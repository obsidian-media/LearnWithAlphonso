import { z } from "zod";
import { authHeaders } from "./auth-headers";
import { parseSupportLinkId, type SupportLinkId } from "./support-links";

/**
 * The browser side of the Help chat routes (`/api/support/conversation`, `/message`, `/handoff`). The learner id is
 * the session's; a request carries only the text and a client id. The apps have the same client in Swift and Kotlin
 * (milestones 4 and 5).
 *
 * Every reply is checked here too: a link id outside the allow-list becomes `null` even if a server bug sent it.
 */

/** `none` is "no conversation yet"; the rest are the server's words. */
export type SupportStatus = "none" | "ai" | "new" | "open" | "waiting_learner" | "solved";
export type SupportMessageKind = "you" | "ai" | "support" | "system";

export type SupportMessage = {
  id: number;
  kind: SupportMessageKind;
  body: string;
  at: string;
  link: SupportLinkId | null;
};

export type SupportConversation = {
  status: SupportStatus;
  unread: number;
  messages: SupportMessage[];
  aiAvailable: boolean;
};

/** What a send or a hand-off returns: the status now, and the messages (new ones for a send, all for a hand-off). */
export type SupportUpdate = { status: SupportStatus; messages: SupportMessage[] };

export type SupportErrorKind =
  | "offline"
  /** 503 `support-unreachable`: the learner's message IS saved on the server. */
  | "unreachable"
  /** 429 `support-message-limit`, 50 learner messages a day. */
  | "dailyLimit"
  /** 429 `support-message-limit`, 100 messages in one conversation. */
  | "conversationLimit"
  | "failed";

export class SupportError extends Error {
  constructor(readonly kind: SupportErrorKind) {
    super(kind);
    this.name = "SupportError";
  }
}

const STATUSES = ["ai", "new", "open", "waiting_learner", "solved", "none"] as const;

const messageSchema = z.object({
  id: z.number().int(),
  kind: z.enum(["you", "ai", "support", "system"]),
  body: z.string(),
  at: z.string(),
  link: z.unknown().optional(),
});
const toMessage = (m: z.infer<typeof messageSchema>): SupportMessage => ({
  id: m.id,
  kind: m.kind,
  body: m.body,
  at: m.at,
  // Only an AI answer carries a link, and only an allow-listed id counts.
  link: m.kind === "ai" ? parseSupportLinkId(m.link) : null,
});

const updateSchema = z.object({
  status: z.enum(STATUSES),
  messages: z.array(messageSchema),
});
const conversationSchema = updateSchema.extend({
  unread: z.number().int().nonnegative(),
  aiAvailable: z.boolean(),
});

async function call(
  fetchImpl: typeof fetch,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<Response> {
  try {
    return await fetchImpl(path, {
      method: init.method,
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(await authHeaders()),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new SupportError("offline");
  }
}

async function errorBody(res: Response): Promise<{ error?: unknown; which?: unknown }> {
  try {
    return (await res.json()) as { error?: unknown; which?: unknown };
  } catch {
    return {};
  }
}

async function failure(res: Response): Promise<SupportError> {
  const body = await errorBody(res);
  if (res.status === 503 && body.error === "support-unreachable")
    return new SupportError("unreachable");
  if (res.status === 429 && body.error === "support-message-limit")
    return new SupportError(body.which === "conversation" ? "conversationLimit" : "dailyLimit");
  return new SupportError("failed");
}

async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SupportError("failed");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SupportError("failed");
  return parsed.data;
}

export async function fetchConversation(
  fetchImpl: typeof fetch = fetch,
): Promise<SupportConversation> {
  const res = await call(fetchImpl, "/api/support/conversation", { method: "GET" });
  if (!res.ok) throw await failure(res);
  const v = await parse(res, conversationSchema);
  return {
    status: v.status,
    unread: v.unread,
    aiAvailable: v.aiAvailable,
    messages: v.messages.map(toMessage),
  };
}

/** `clientId` makes a retry safe: the server returns the stored message instead of posting twice. */
export async function sendSupportMessage(
  input: { text: string; clientId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SupportUpdate> {
  const res = await call(fetchImpl, "/api/support/message", { method: "POST", body: input });
  if (!res.ok) throw await failure(res);
  const v = await parse(res, updateSchema);
  return { status: v.status, messages: v.messages.map(toMessage) };
}

export async function requestSupportHandoff(
  fetchImpl: typeof fetch = fetch,
): Promise<SupportUpdate> {
  const res = await call(fetchImpl, "/api/support/handoff", { method: "POST", body: {} });
  if (!res.ok) throw await failure(res);
  const v = await parse(res, updateSchema);
  return { status: v.status, messages: v.messages.map(toMessage) };
}

/** Messages by id, oldest first: what a poll or a send adds to what is already on screen. */
export function mergeMessages(
  current: readonly SupportMessage[],
  incoming: readonly SupportMessage[],
): SupportMessage[] {
  const byId = new Map<number, SupportMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
