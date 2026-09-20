import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { detectAndRecordWeaknesses, type Weakness } from "@/lib/weakness-detection.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/analyze-weaknesses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.NVIDIA_API_KEY;
        if (!key) return Response.json({ error: "Analysis is not configured" }, { status: 500 });

        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });

        let body: { messages?: ChatMessage[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return Response.json({ weaknessesDetected: 0 });
        }

        const authHeader = request.headers.get("authorization")!; // consumeQuota already required this
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!url || !anonKey)
          return Response.json({ error: "Server not configured." }, { status: 500 });

        const supabase = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        });
        // Bug fix (found during V3 package 3b work): this handler never
        // resolved the caller's own user id, so every insert below was
        // missing review_items.user_id (NOT NULL, no default/trigger) and
        // silently failed -- weaknessesDetected always returned 0 actually
        // inserted regardless of how many the model found. Also:
        // review_items no longer grants direct INSERT to `authenticated`
        // (supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql),
        // so the insert itself needs supabaseAdmin now, same pattern as
        // review.functions.ts's recordMisses/gradeReview.
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub as string | undefined;
        if (claimsError || !userId) {
          return Response.json({ error: "Unauthorized: invalid token" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const inserted = await detectAndRecordWeaknesses({
          userId,
          sourceDescription: "English-learner conversation",
          transcriptMessages: messages,
          nvidiaApiKey: key,
          nvidiaModel: process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct",
          dedupCheck: async (label) => {
            const { data: existing } = await supabase
              .from("review_items")
              .select("item_key")
              .eq("user_id", userId)
              .eq("source", "weakness")
              .eq("weakness_label", label)
              .maybeSingle();
            return !!existing;
          },
          adminInsertReviewItem: async (weakness: Weakness) => {
            const itemKey = `weakness:${crypto.randomUUID().replace(/-/g, "")}`;
            const { error } = await supabaseAdmin.from("review_items").insert({
              user_id: userId,
              item_key: itemKey,
              lesson_id: "weakness",
              level: "A1",
              language: "en",
              ease: 2.5,
              interval_days: 0,
              repetitions: 0,
              due_on: new Date().toISOString().slice(0, 10),
              source: "weakness",
              weakness_label: weakness.label,
              weakness_display: weakness.display,
              prompt: weakness.prompt,
              choices: weakness.choices,
              answer_index: weakness.answerIndex,
              explanation: weakness.explanation,
            });
            return !error;
          },
          adminInsertEvent: async (category) => {
            await supabaseAdmin
              .from("weakness_events")
              .insert({ user_id: userId, category, event_type: "detected" });
          },
        });

        return Response.json({ weaknessesDetected: inserted });
      },
    },
  },
});
