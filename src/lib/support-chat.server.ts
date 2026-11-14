import { z } from "zod";
import {
  HANDOFF_NOTICE,
  buildSupportMessages,
  buildSupportRequestBody,
  findForcedHandoff,
  guardSupportReply,
  parseSupportReply,
  type HandoffReason,
  type SupportTopic,
  type SupportTurn,
} from "./support-ai.server";
import type { SupportFacts } from "./support-facts.server";
import type { QuotaResult } from "./ai-quota.server";
import type { Course } from "@/data/courses";

/**
 * The Help chat's server logic (docs/superpowers/plans/2026-11-14-support-help-chat.md, "Order in POST /api/support/message").
 * The three routes under src/routes/api/support/ are thin: they verify the session and call these. Everything the
 * learner does goes through here with the user id taken from the VERIFIED SESSION, never from a body.
 *
 * Everything outside (database, switches, consent, quota, model, filter) comes in through SupportRuntime, so the
 * tests run the whole flow against the real SQL functions (PGlite) with a fake model, and the production wiring is in
 * support-chat-runtime.server.ts.
 *
 * Logs: event name, outcome, hand-off reason, status code, quota result, message length. Never a user id, a
 * conversation id or any text.
 */

export const MESSAGE_LIMIT_CODE = "support-message-limit";

export class SupportCapError extends Error {
  constructor(readonly which: "daily" | "conversation") {
    super(`support_${which}_cap`);
  }
}

export type LearnerMessageView = {
  id: number;
  kind: "you" | "ai" | "support" | "system";
  body: string;
  at: string;
};
export type LearnerView = {
  status: "ai" | "new" | "open" | "waiting_learner" | "solved";
  unread: number;
  messages: LearnerMessageView[];
};

export interface SupportStore {
  openConversation(userId: string, channel: "web" | "ios" | "android"): Promise<string>;
  /** Throws SupportCapError at the daily or per-conversation cap. */
  addLearnerMessage(
    userId: string,
    conversationId: string,
    text: string,
    clientId: string,
  ): Promise<number>;
  conversationStatus(conversationId: string): Promise<string>;
  hasMessagesAfter(conversationId: string, messageId: number): Promise<boolean>;
  recentTurns(conversationId: string, limit: number): Promise<SupportTurn[]>;
  /** null when a person already has the conversation (nothing written). */
  addAiMessage(
    conversationId: string,
    body: string,
    facts: SupportFacts,
    handoff: { reason: HandoffReason; topic: SupportTopic; summary: string } | null,
  ): Promise<number | null>;
  handoff(
    userId: string,
    conversationId: string,
    reason: HandoffReason,
    topic: SupportTopic,
    summary: string | null,
  ): Promise<boolean>;
  view(userId: string): Promise<LearnerView | null>;
}

export type SupportRuntime = {
  store: SupportStore;
  /** The owner's switches: `ai` and `support_ai` must both be on. */
  aiSwitchedOn(): Promise<boolean>;
  consent(userId: string): Promise<"granted" | "missing" | "error">;
  /** Spends one `support` quota unit (per-minute and daily). */
  consumeQuota(): Promise<QuotaResult>;
  loadFacts(userId: string, conversationId: string): Promise<SupportFacts>;
  /** The model's reply text, or null on any failure (the runtime logs the status only). */
  callModel(body: ReturnType<typeof buildSupportRequestBody>["messages"]): Promise<string | null>;
  /** True when the text hits the blocked-terms list (fails closed). */
  blocked(text: string, course: Course): Promise<boolean>;
  log(event: Record<string, string | number | boolean | null>): void;
};

export type HandlerResult = { status: number; body: unknown };

// ---- request bodies ----

/** zod strips unknown keys: a body with author_kind, kind, author_id, conversationId or userId changes nothing. */
export const messageBodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  clientId: z.string().uuid(),
});

export function channelOf(request: Request): "web" | "ios" | "android" {
  const v = (request.headers.get("x-client") ?? "").trim().toLowerCase();
  return v === "ios" || v === "android" ? v : "web";
}

const courseOf = (facts: SupportFacts | null): Course => {
  const c = facts?.course;
  return c === "fr" || c === "es" ? c : "en";
};

// ---- GET conversation ----

export async function handleGetConversation(
  userId: string,
  rt: SupportRuntime,
): Promise<HandlerResult> {
  let view: LearnerView | null;
  try {
    view = await rt.store.view(userId);
  } catch {
    rt.log({ event: "support_conversation", outcome: "read_failed" });
    return { status: 500, body: { error: "Could not load your messages." } };
  }
  const aiAvailable = await rt.aiSwitchedOn();
  return {
    status: 200,
    body: {
      status: view?.status ?? "none",
      unread: view?.unread ?? 0,
      messages: view?.messages ?? [],
      aiAvailable,
    },
  };
}

// ---- POST message ----

async function handOff(
  rt: SupportRuntime,
  userId: string,
  conversationId: string,
  reason: HandoffReason,
  topic: SupportTopic,
  summary: string | null,
): Promise<boolean> {
  // One retry: a failed hand-off leaves the conversation with the AI and the learner's message unanswered.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await rt.store.handoff(userId, conversationId, reason, topic, summary);
      return true;
    } catch {
      rt.log({ event: "support_handoff_failed", reason, attempt });
    }
  }
  return false;
}

export const SUPPORT_UNREACHABLE_CODE = "support-unreachable";
const unreachable = (): HandlerResult => ({
  status: 503,
  body: {
    error: SUPPORT_UNREACHABLE_CODE,
    message: "We couldn't reach support. Your message is saved. Try again in a moment.",
  },
});

async function newMessages(
  rt: SupportRuntime,
  userId: string,
  fromId: number,
): Promise<HandlerResult> {
  const view = await rt.store.view(userId);
  return {
    status: 200,
    body: {
      status: view?.status ?? "none",
      messages: (view?.messages ?? []).filter((m) => m.id >= fromId),
    },
  };
}

export async function handlePostMessage(
  userId: string,
  channel: "web" | "ios" | "android",
  raw: unknown,
  rt: SupportRuntime,
): Promise<HandlerResult> {
  const parsed = messageBodySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "invalid-request" } };
  const { text, clientId } = parsed.data;

  let conversationId: string;
  let learnerMessageId: number;
  try {
    conversationId = await rt.store.openConversation(userId, channel);
    learnerMessageId = await rt.store.addLearnerMessage(userId, conversationId, text, clientId);
  } catch (err) {
    if (err instanceof SupportCapError) {
      rt.log({ event: "support_message", outcome: "cap", which: err.which, length: text.length });
      return {
        status: 429,
        body: {
          error: MESSAGE_LIMIT_CODE,
          message:
            err.which === "daily"
              ? "You have reached today's limit of messages to Help. Try again tomorrow."
              : "This conversation has reached its message limit. A person will read what you have sent.",
        },
      };
    }
    rt.log({ event: "support_message", outcome: "store_failed", length: text.length });
    return { status: 500, body: { error: "Could not send your message." } };
  }

  try {
    // Already with a person, or a retried request whose answer exists: no AI.
    const status = await rt.store.conversationStatus(conversationId);
    if (status !== "ai" || (await rt.store.hasMessagesAfter(conversationId, learnerMessageId))) {
      rt.log({ event: "support_message", outcome: "stored", status, length: text.length });
      return await newMessages(rt, userId, learnerMessageId);
    }

    const forced = findForcedHandoff(text);
    if (forced) {
      if (!(await handOff(rt, userId, conversationId, forced.reason, forced.topic, null))) {
        return unreachable();
      }
      rt.log({
        event: "support_message",
        outcome: "handoff",
        reason: forced.reason,
        length: text.length,
      });
      return await newMessages(rt, userId, learnerMessageId);
    }

    const stop = async (
      reason: HandoffReason,
      extra: Record<string, string | number | boolean | null> = {},
    ) => {
      if (!(await handOff(rt, userId, conversationId, reason, "other", null))) return unreachable();
      rt.log({
        event: "support_message",
        outcome: "handoff",
        reason,
        length: text.length,
        ...extra,
      });
      return await newMessages(rt, userId, learnerMessageId);
    };

    if (!(await rt.aiSwitchedOn())) return await stop("ai_unavailable", { why: "switch" });
    const consent = await rt.consent(userId);
    if (consent === "missing") return await stop("ai_unavailable", { why: "consent" });
    if (consent === "error") return await stop("ai_error", { why: "consent_check" });

    const quota = await rt.consumeQuota();
    if (!quota.ok) {
      return await stop(quota.status === 429 ? "quota" : "ai_error", {
        why: "quota",
        quotaStatus: quota.status,
      });
    }

    let facts: SupportFacts;
    try {
      facts = await rt.loadFacts(userId, conversationId);
    } catch {
      return await stop("ai_error", { why: "facts" });
    }

    const history = await rt.store.recentTurns(conversationId, 40);
    const content = await rt.callModel(buildSupportMessages(facts, history));
    const reply = parseSupportReply(content);
    if (!reply) return await stop("ai_error", { why: "parse" });

    const guarded = guardSupportReply(reply.reply);
    if (!guarded.ok) return await stop("ai_error", { why: guarded.why });
    if (await rt.blocked(guarded.reply, courseOf(facts)))
      return await stop("ai_error", { why: "filter" });

    const handoff = reply.handoff
      ? {
          reason: (reply.reason ?? "ai_unsure") as HandoffReason,
          topic: reply.topic,
          summary: reply.summary,
        }
      : null;
    if (handoff && handoff.summary) {
      const g = guardSupportReply(handoff.summary);
      if (!g.ok || (await rt.blocked(handoff.summary, courseOf(facts)))) handoff.summary = "";
    }
    const stored = await rt.store.addAiMessage(conversationId, guarded.reply, facts, handoff);
    rt.log({
      event: "support_message",
      outcome: stored === null ? "taken_by_person" : handoff ? "handoff" : "answered",
      reason: handoff?.reason ?? null,
      length: text.length,
    });
    return await newMessages(rt, userId, learnerMessageId);
  } catch {
    // A failure after the learner's message was stored: the message stays; a person gets the conversation.
    if (!(await handOff(rt, userId, conversationId, "ai_error", "other", null)))
      return unreachable();
    rt.log({
      event: "support_message",
      outcome: "handoff",
      reason: "ai_error",
      why: "exception",
      length: text.length,
    });
    try {
      return await newMessages(rt, userId, learnerMessageId);
    } catch {
      return { status: 500, body: { error: "Could not load your messages." } };
    }
  }
}

// ---- POST handoff ----

const SUMMARY_SYSTEM =
  "You write a short note for a support person. Read the learner's messages and say in at most 300 characters, in English, what they need. No names, no email addresses, no links. Reply with the note only.";

export async function handlePostHandoff(
  userId: string,
  channel: "web" | "ios" | "android",
  rt: SupportRuntime,
): Promise<HandlerResult> {
  let conversationId: string;
  try {
    conversationId = await rt.store.openConversation(userId, channel);
  } catch {
    rt.log({ event: "support_handoff", outcome: "store_failed" });
    return { status: 500, body: { error: "Could not reach support." } };
  }
  let summary: string | null = null;
  try {
    if ((await rt.store.conversationStatus(conversationId)) === "ai") {
      summary = await trySummary(rt, userId, conversationId);
    }
    const moved = await rt.store.handoff(userId, conversationId, "learner_asked", "other", summary);
    rt.log({
      event: "support_handoff",
      outcome: moved ? "handoff" : "already_with_person",
      summarised: summary !== null,
    });
    const view = await rt.store.view(userId);
    return {
      status: 200,
      body: { status: view?.status ?? "none", messages: view?.messages ?? [] },
    };
  } catch {
    rt.log({ event: "support_handoff", outcome: "failed" });
    return { status: 500, body: { error: "Could not reach support." } };
  }
}

/** One quota unit for a summary, only when AI is on, allowed and there is something to summarise. Never throws. */
async function trySummary(
  rt: SupportRuntime,
  userId: string,
  conversationId: string,
): Promise<string | null> {
  try {
    if (!(await rt.aiSwitchedOn())) return null;
    if ((await rt.consent(userId)) !== "granted") return null;
    const turns = (await rt.store.recentTurns(conversationId, 40)).filter(
      (t) => t.kind === "learner",
    );
    if (turns.length === 0) return null;
    const quota = await rt.consumeQuota();
    if (!quota.ok) return null;
    const content = await rt.callModel([
      { role: "system", content: SUMMARY_SYSTEM },
      { role: "user", content: turns.map((t) => t.body).join("\n---\n") },
    ]);
    const note = (content ?? "").trim().slice(0, 300);
    if (!note) return null;
    if (!guardSupportReply(note).ok) return null;
    if (await rt.blocked(note, "en")) return null;
    return note;
  } catch {
    return null;
  }
}

export { HANDOFF_NOTICE };
