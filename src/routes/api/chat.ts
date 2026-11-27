import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";
import { ALL_SYSTEM_PROMPTS, canonicalSystemPrompt } from "@/data/scenarios";
import { COURSES, isCourse, type Course } from "@/data/courses";
import { courseOfSystemPrompt } from "@/lib/system-prompt-course";
import { filterModelOutput, makeBlockedTermCheck } from "@/lib/ai-safety";
import { llmChatCompletion } from "@/lib/llm-chat.server";
import { boundTranscript } from "@/lib/chat-transcript-limits";
import { splitReplyVerdict, withVerdictInstruction } from "@/lib/chat-verdict";
import { recordPracticeReply, recordRehearsalReply } from "@/lib/practice-calls.server";
import { rehearsalsEnabled } from "@/lib/rehearsals-flag";

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
 * general-purpose LLM proxy funded by this app's own AI provider key, wholly
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
/** A conversation reply normally arrives in about a second; past this the learner gets a retryable error. */
const CHAT_TIMEOUT_MS = 25_000;
/** A partner turn is a few sentences. The cap bounds cost and time if the model runs on. */
const CHAT_MAX_TOKENS = 1024;

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

/** True when the body is a JSON object with an object-valued `rehearsal`. Reads a clone, so the request stays unread. */
async function peekRehearsal(request: Request): Promise<boolean> {
  // Only a request that carries a bearer token is worth parsing here; an anonymous body is never read before auth.
  if (!/^Bearer\s+\S/i.test(request.headers.get("Authorization") ?? "")) return false;
  try {
    const peek = (await request.clone().json()) as { rehearsal?: unknown } | null;
    return typeof peek?.rehearsal === "object" && peek.rehearsal !== null;
  } catch {
    return false;
  }
}

type AuthorizedChat = Extract<
  Awaited<ReturnType<typeof import("@/lib/ai-consent.server").authorizeAiRequest>>,
  { ok: true }
>;

/**
 * A rehearsal stage's reply. The rehearsal is checked first (404 / 409 / 402 before any quota or model call), then
 * the quota is charged, then the prompt that rehearsal-chat.server.ts built from the stored brief and the memory of
 * earlier runs is sent. The course is the rehearsal's own. Alphonso's everyday memory is not mixed in: a rehearsal
 * carries its own.
 */
async function handleRehearsalChat(
  request: Request,
  timer: StageTimer,
  access: AuthorizedChat,
  body: { messages?: ChatMessage[]; cefrLevel?: string; callId?: string; rehearsal?: unknown },
  key: string,
): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { resolveRehearsalChat } = await import("@/lib/rehearsal-chat.server");
  const resolved = await timer.time("rehearsal", () =>
    resolveRehearsalChat(admin, {
      userId: access.userId,
      rehearsal: body.rehearsal,
      callId: body.callId,
      cefrLevel: body.cefrLevel,
    }),
  );
  if (!resolved.ok) return resolved.response;
  const messages: ChatMessage[] = boundTranscript(body.messages);
  if (messages.length === 0) return noStoreJson({ error: "messages required" }, { status: 400 });
  const refused = await access.chargeQuota?.();
  if (refused) return refused;

  const finalMessages: ChatMessage[] = [
    { role: "system", content: withVerdictInstruction(resolved.prompt) },
    ...messages,
  ];
  const model = resolveLlmChatModel();
  const llm = await timer.time("llm", () =>
    callModel(request, key, model, finalMessages, access.userId),
  );
  if (!llm.ok) return llm.failure;
  const { text: replyText, verdict } = splitReplyVerdict(llm.content);
  if (!replyText) {
    console.warn(JSON.stringify({ event: "chat_empty_reply", model }));
    return noStoreJson({ error: "empty-reply" }, { status: 502 });
  }
  const safe = await filterModelOutput(replyText, {
    check: makeBlockedTermCheck(supabaseAdmin),
    course: resolved.course,
    route: "chat",
  });
  const replyVerdict = safe.blocked ? "none" : verdict;
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    await recordRehearsalReply(supabaseAdmin, {
      userId: access.userId,
      callId: body.callId,
      rehearsalId: resolved.rehearsalId,
      stage: resolved.stage,
      course: resolved.course,
      learnerText: last.content,
      verdict: replyVerdict,
    });
  }
  return noStoreJson({ content: safe.text, verdict: replyVerdict });
}

/** The one model call of a chat reply, for the rehearsal path. A timeout or an unreachable provider is retryable. */
async function callModel(
  request: Request,
  key: string,
  model: string,
  messages: ChatMessage[],
  userId: string,
): Promise<{ ok: true; content: string } | { ok: false; failure: Response }> {
  let resp: Response;
  try {
    resp = await llmChatCompletion({
      apiKey: key,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(CHAT_TIMEOUT_MS)]),
      body: { model, messages, max_tokens: CHAT_MAX_TOKENS },
      track: { userId, kind: "chat" },
    });
  } catch {
    return { ok: false, failure: noStoreJson({ error: "reply-unavailable" }, { status: 504 }) };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, failure: upstreamErrorResponse("OpenRouter", resp.status, text) };
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  return { ok: true, content: data.choices?.[0]?.message?.content ?? "" };
}

async function handleChat(request: Request, timer: StageTimer): Promise<Response> {
  const key = resolveLlmApiKey();
  if (!key) return noStoreJson({ error: "Chat is not configured" }, { status: 500 });
  // A rehearsal request is recognised before auth only to choose WHEN the quota is spent: it is charged after the
  // rehearsal has been checked (a request for a rehearsal that is not the caller's must cost nothing). Nothing from
  // this early read is trusted.
  const rehearsalMode = await peekRehearsal(request);
  if (rehearsalMode && !rehearsalsEnabled())
    return noStoreJson({ error: "not_enabled" }, { status: 404 });
  const access = await timer.time("auth", async () => {
    const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
    return rehearsalMode
      ? authorizeAiRequest(request, "chat", { route: "chat", deferQuota: true })
      : authorizeAiRequest(request, "chat", { route: "chat" });
  });
  if (!access.ok) return access.response;
  let body: {
    messages?: ChatMessage[];
    systemPrompt?: string;
    cefrLevel?: string;
    course?: string;
    /** Practice stars: the call this reply belongs to (a uuid the client made when the call started). Optional. */
    callId?: string;
    /** Rehearsal mode: the rehearsal and stage to talk in. Replaces systemPrompt; no prompt text is ever sent. */
    rehearsal?: { id?: unknown; stage?: unknown };
  };
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (rehearsalMode) return handleRehearsalChat(request, timer, access, body, key);
  // A known persona is required, not merely allowed. With no system prompt the model would answer anything, which
  // is exactly the general-purpose proxy VALID_SYSTEM_PROMPTS exists to prevent.
  // A prompt an earlier build shipped is accepted too and replaced by its current text, so every lookup below
  // (course, practice item, the model call) sees the current prompt.
  const canonicalPrompt =
    typeof body.systemPrompt === "string" ? canonicalSystemPrompt(body.systemPrompt) : undefined;
  if (canonicalPrompt === undefined || !VALID_SYSTEM_PROMPTS.has(canonicalPrompt)) {
    return noStoreJson({ error: "unknown-system-prompt" }, { status: 400 });
  }
  body.systemPrompt = canonicalPrompt;
  // Found alongside the same bug in Hector's own message builder
  // (2026-09-28 audit): a client-supplied entry here could claim
  // role: "system" and land in the array the actual system message
  // (below, from body.systemPrompt) gets prepended to -- a second,
  // client-controlled system message the model would see, not just
  // the one this route intends to send.
  // A conversation can run long; the model only needs the recent turns, and each call's input stays bounded
  // (see chat-transcript-limits.ts).
  const messages: ChatMessage[] = boundTranscript(body.messages);
  if (messages.length === 0) return noStoreJson({ error: "messages required" }, { status: 400 });
  // The conversation's course. Clients that send none (earlier builds) get the course the matched persona belongs
  // to, which is English for every earlier persona.
  const course: Course =
    courseOfSystemPrompt(body.systemPrompt) ??
    (typeof body.course === "string" && isCourse(body.course) ? body.course : "en");
  // Alphonso's memory (free for every learner since #749): topic labels from the learner's own memory lines, as one leading turn, the same way
  // Hector is primed. Built here from stored rows, never from the request; nobody without memory pays a lookup.
  const { supabaseAdmin: memoryDb } = await import("@/integrations/supabase/client.server");
  const { loadAlphonsoPriming } = await import("@/lib/call-recap.server");
  const priming = await loadAlphonsoPriming(memoryDb, access.userId, course);
  const finalMessages: ChatMessage[] = [
    {
      role: "system",
      content: withVerdictInstruction(
        withDifficultyHint(body.systemPrompt, body.cefrLevel, course),
      ),
    },
    ...(priming ? [priming] : []),
    ...messages,
  ];

  // The AI provider's hosted API is
  // OpenAI-compatible, so only the URL/key/model name change from the
  // Lovable Gateway. See llm-chat-model.server.ts for why the
  // model id lives there instead of being hardcoded here.
  const model = resolveLlmChatModel();
  const llm = await timer.time("llm", () =>
    callModel(request, key, model, finalMessages, access.userId),
  );
  if (!llm.ok) return llm.failure;
  // An empty completion is an upstream failure, not a reply. It used to return 200 with "" and the clients
  // rendered an ellipsis as the partner's turn. 502 lets each client retry once.
  // The model ends its reply with a verdict tag about the learner's last turn. It is parsed and removed here, so
  // the text that is shown, spoken and filtered never carries it.
  const { text: replyText, verdict } = splitReplyVerdict(llm.content);
  if (!replyText) {
    console.warn(JSON.stringify({ event: "chat_empty_reply", model }));
    return noStoreJson({ error: "empty-reply" }, { status: 502 });
  }
  // The fallback language and the output mask follow the persona the server matched, never a client field.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safe = await filterModelOutput(replyText, {
    check: makeBlockedTermCheck(supabaseAdmin),
    course: courseOfSystemPrompt(body.systemPrompt) ?? "en",
    route: "chat",
  });
  // `verdict` is an extra field: shipped iOS and Android builds read `content` only and ignore it. A reply the
  // filter replaced says nothing about the learner's answer.
  const replyVerdict = safe.blocked ? "none" : verdict;
  // Practice stars: the judged reply is recorded against the call, here on the server, so a call's stars come from
  // verdicts no client wrote. Only a learner's turn counts; a call with no id (older clients) records nothing.
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    await recordPracticeReply(supabaseAdmin, {
      userId: access.userId,
      callId: body.callId,
      systemPrompt: body.systemPrompt,
      learnerText: last.content,
      verdict: replyVerdict,
    });
  }
  return noStoreJson({ content: safe.text, verdict: replyVerdict });
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
