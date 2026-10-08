import { createFileRoute } from "@tanstack/react-router";
import { detectAndRecordWeaknesses, type Weakness } from "@/lib/weakness-detection.server";
import { COURSES, isCourse, type Course } from "@/data/courses";
import { makeBlockedTermCheck } from "@/lib/ai-safety";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/analyze-weaknesses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Second-opinion audit (2026-09-28): this whole pipeline had zero
        // observability anywhere -- the client calls it fire-and-forget
        // (`_ = try? await client.analyzeWeaknesses(...)`), so even a
        // non-2xx response here was effectively invisible to anyone.
        // Checkable from Vercel's dashboard now, no device needed.
        const key = process.env.NVIDIA_API_KEY;
        if (!key) {
          console.error("[analyze-weaknesses] NVIDIA_API_KEY not configured in this environment");
          return Response.json({ error: "Analysis is not configured" }, { status: 500 });
        }

        const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
        const access = await authorizeAiRequest(request, "chat", { route: "analyze-weaknesses" });
        if (!access.ok) return access.response;
        const { supabase, userId } = access;

        let body: { messages?: ChatMessage[]; course?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        // A client could send role "system" here and it went to the model verbatim. Only the learner's and
        // partner's turns are transcript; the analysis instructions are this server's.
        const messages = (Array.isArray(body.messages) ? body.messages : []).filter(
          (m): m is { role: "user" | "assistant"; content: string } =>
            !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        );
        if (messages.length === 0) {
          return Response.json({ weaknessesDetected: 0 });
        }

        // The conversation's course. Clients that send none (earlier builds) are English.
        const course: Course =
          typeof body.course === "string" && isCourse(body.course) ? body.course : "en";
        const language = COURSES.find((c) => c.id === course)?.targetLanguage ?? "English";
        const sourceDescription =
          course === "en"
            ? "English-learner conversation"
            : `conversation with a learner of ${language} (write the question, its choices and the display text in ${language}; write the explanation in English)`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const inserted = await detectAndRecordWeaknesses({
          userId,
          sourceDescription,
          transcriptMessages: messages,
          nvidiaApiKey: key,
          nvidiaModel: resolveNvidiaChatModel(),
          course,
          outputCheck: makeBlockedTermCheck(supabaseAdmin),
          dedupCheck: async (label) => {
            const { data: existing } = await supabase
              .from("review_items")
              .select("item_key")
              .eq("user_id", userId)
              .eq("source", "weakness")
              .eq("weakness_label", label)
              .eq("language", course)
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
              language: course,
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
