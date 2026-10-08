import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";
import { ALL_SYSTEM_PROMPTS } from "@/data/scenarios";
import { COURSES, isCourse, type Course } from "@/data/courses";
import { courseOfSystemPrompt } from "@/lib/system-prompt-course";
import { filterModelOutput, makeBlockedTermCheck } from "@/lib/ai-safety";
import { nvidiaChatCompletion } from "@/lib/nvidia-chat.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * 2026-09-30 audit (Codex #4): despite this route's own comment below
 * ("systemPrompt stays fully client-controlled by design"), that design
 * only ever held for the two legitimate callers (converse_.$scenarioId.tsx,
 * campaign_.$campaignId.tsx), which always send one of a fixed,
 * developer-authored set of personas -- never real user input. Nothing
 * enforced that server-side, so a caller bypassing the app UI (any valid
 * session, direct HTTP) could set systemPrompt to anything at all, turning
 * this quota-gated (60/day) but otherwise unrestricted route into a
 * general-purpose LLM proxy funded by this app's own NVIDIA key, wholly
 * unrelated to language learning. Whitelisting against the exact set of
 * real personas closes that off with zero behavior change for either real
 * client -- both already send one of these values verbatim (iOS bundles
 * the identical JSON export of the same source, see CurriculumModels.swift).
 */
// The whitelist is every course variant of every scenario and every composed
// campaign scene, owned by src/data/scenarios.ts. It still contains the
// earlier English prompts byte for byte (pinned by
// src/data/legacy-system-prompts.test.ts), so installed clients keep working.
const VALID_SYSTEM_PROMPTS: ReadonlySet<string> = ALL_SYSTEM_PROMPTS;

/**
 * Language-neutral. The B2 and C1 hints used to say "English" for every course,
 * which pulled French and Spanish partners toward English. `language` is the
 * course's target language; for "en" every string is byte-identical to the
 * earlier hint, so legacy clients see no change.
 */
/** The most recent turns forwarded to the model, matching the tutor route's cap. */
const MAX_TURNS_SENT = 40;

const CEFR_DIFFICULTY_HINTS: Record<string, (language: string) => string> = {
  A1: () =>
    "The learner's level is CEFR A1 (beginner). Use very simple, common vocabulary and short sentences (roughly 5-10 words). Avoid idioms, phrasal verbs, and complex tenses.",
  A2: () =>
    "The learner's level is CEFR A2 (elementary). Use simple vocabulary and short, clear sentences. Avoid idioms and rare phrasal verbs; keep tenses mostly present/simple past.",
  B1: () =>
    "The learner's level is CEFR B1 (intermediate). Use everyday vocabulary and moderately complex sentences. Common idioms are fine if used naturally.",
  B2: (language) =>
    `The learner's level is CEFR B2 (upper-intermediate). Use natural, varied vocabulary and sentence structure, similar to talking with a competent ${language} speaker.`,
  C1: (language) =>
    `The learner's level is CEFR C1 (advanced). Use natural, idiomatic ${language} with varied sentence structure -- don't simplify for them.`,
};

/**
 * V3 package 3a: this is a prompt-shaping hint, not a trust boundary --
 * there's no exploit value in a client claiming a level it doesn't have
 * (worst case, the conversation partner is too easy or too hard for
 * them), so this is trusted client input, same as `systemPrompt` itself
 * already was. Appended after the scenario's own systemPrompt so it
 * doesn't override the scenario's persona/character instructions.
 */
function withDifficultyHint(
  systemPrompt: string,
  cefrLevel: string | undefined,
  course: Course,
): string {
  const hint = cefrLevel ? CEFR_DIFFICULTY_HINTS[cefrLevel] : undefined;
  if (!hint) return systemPrompt;
  const language = COURSES.find((c) => c.id === course)?.targetLanguage ?? "English";
  return `${systemPrompt}\n\n${hint(language)}`;
}

async function handleChat(request: Request, timer: StageTimer): Promise<Response> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return Response.json({ error: "Chat is not configured" }, { status: 500 });
  const access = await timer.time("auth", async () => {
    const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
    return authorizeAiRequest(request, "chat", { route: "chat" });
  });
  if (!access.ok) return access.response;
  let body: {
    messages?: ChatMessage[];
    systemPrompt?: string;
    cefrLevel?: string;
    course?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // A known persona is required, not merely allowed. With no system prompt the model would answer anything, which
  // is exactly the general-purpose proxy VALID_SYSTEM_PROMPTS exists to prevent.
  if (typeof body.systemPrompt !== "string" || !VALID_SYSTEM_PROMPTS.has(body.systemPrompt)) {
    return Response.json({ error: "unknown-system-prompt" }, { status: 400 });
  }
  // Found alongside the same bug in Hector's own message builder
  // (2026-09-28 audit): a client-supplied entry here could claim
  // role: "system" and land in the array the actual system message
  // (below, from body.systemPrompt) gets prepended to -- a second,
  // client-controlled system message the model would see, not just
  // the one this route intends to send.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    // A conversation can run long; the model only needs the recent turns.
    .slice(-MAX_TURNS_SENT);
  if (messages.length === 0) return Response.json({ error: "messages required" }, { status: 400 });
  // The conversation's course. Clients that send none (earlier builds) get the course the matched persona belongs
  // to, which is English for every earlier persona.
  const course: Course =
    courseOfSystemPrompt(body.systemPrompt) ??
    (typeof body.course === "string" && isCourse(body.course) ? body.course : "en");
  const finalMessages: ChatMessage[] = [
    { role: "system", content: withDifficultyHint(body.systemPrompt, body.cefrLevel, course) },
    ...messages,
  ];

  // NVIDIA NIM's hosted inference API is
  // OpenAI-compatible, so only the URL/key/model name change from the
  // Lovable Gateway. See nvidia-chat-model.server.ts for why the
  // model id lives there instead of being hardcoded here.
  const model = resolveNvidiaChatModel();
  const llm = await timer.time("llm", async () => {
    const resp = await nvidiaChatCompletion({
      apiKey: key,
      body: { model, messages: finalMessages },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false as const, failure: upstreamErrorResponse("NVIDIA", resp.status, text) };
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true as const, content: data.choices?.[0]?.message?.content ?? "" };
  });
  if (!llm.ok) return llm.failure;
  // An empty completion is an upstream failure, not a reply. It used to return 200 with "" and the clients
  // rendered an ellipsis as the partner's turn. 502 lets each client retry once.
  if (!llm.content.trim()) {
    console.warn(JSON.stringify({ event: "chat_empty_reply", model }));
    return Response.json({ error: "empty-reply" }, { status: 502 });
  }
  // The fallback language and the output mask follow the persona the server matched, never a client field.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safe = await filterModelOutput(llm.content, {
    check: makeBlockedTermCheck(supabaseAdmin),
    course: courseOfSystemPrompt(body.systemPrompt) ?? "en",
    route: "chat",
  });
  return Response.json({ content: safe.text });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const timer = createStageTimer();
        const res = await handleChat(request, timer);
        timer.log("chat", res.status);
        res.headers.set("Server-Timing", timer.serverTiming());
        return res;
      },
    },
  },
});
