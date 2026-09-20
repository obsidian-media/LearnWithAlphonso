import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { upstreamErrorResponse } from "@/lib/api-response.server";

const TAXONOMY = [
  "past-tense",
  "articles",
  "prepositions",
  "subject-verb-agreement",
  "plurals",
  "question-formation",
  "modal-verbs",
  "word-order",
  "pronouns",
  "comparatives",
  "conditionals",
  "phrasal-verbs",
  "negation",
  "vocabulary-choice",
  "spelling",
] as const;

const weaknessSchema = z.object({
  label: z.enum(TAXONOMY),
  display: z.string().min(1).max(120),
  prompt: z.string().min(1).max(300),
  choices: z.array(z.string().min(1).max(120)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(300),
});
const weaknessesSchema = z.array(weaknessSchema).max(3);
type Weakness = z.infer<typeof weaknessSchema>;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Never throws -- any parse/shape failure yields an empty array. */
function parseWeaknesses(content: string): Weakness[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = weaknessesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function analysisPrompt(): string {
  return (
    `From this English-learner conversation, pick 0-3 categories from ` +
    `this exact list that the learner struggled with: ${TAXONOMY.join(", ")}. ` +
    `For each, write a 4-choice multiple-choice question testing that ` +
    `category, plus a short explanation of the right answer. Respond with ` +
    `ONLY a JSON array, no other text, in this exact shape: ` +
    `[{"label": "<one of the categories above>", "display": "<short human-readable description, e.g. 'Past-tense verbs'>", ` +
    `"prompt": "<question text>", "choices": ["<4 options>"], "answerIndex": <0-3>, "explanation": "<why>"}]. ` +
    `If there's nothing worth flagging, respond with [].`
  );
}

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

        const model = process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
        const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [...messages, { role: "user" as const, content: analysisPrompt() }],
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return upstreamErrorResponse("NVIDIA", resp.status, text);
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        const weaknesses = parseWeaknesses(content);
        if (weaknesses.length === 0) {
          return Response.json({ weaknessesDetected: 0 });
        }

        const authHeader = request.headers.get("authorization")!; // consumeQuota already required this
        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!url || !anonKey)
          return Response.json({ error: "Server not configured." }, { status: 500 });

        const supabase = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        });

        let inserted = 0;
        for (const weakness of weaknesses) {
          const { data: existing } = await supabase
            .from("review_items")
            .select("item_key")
            .eq("source", "weakness")
            .eq("weakness_label", weakness.label)
            .maybeSingle();
          if (existing) continue;

          const itemKey = `weakness:${crypto.randomUUID().replace(/-/g, "")}`;
          const { error } = await supabase.from("review_items").insert({
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
          if (!error) inserted += 1;
        }

        return Response.json({ weaknessesDetected: inserted });
      },
    },
  },
});
