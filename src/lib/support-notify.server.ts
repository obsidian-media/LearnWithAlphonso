import { z } from "zod";
import type { LooseAdmin } from "./support-chat-runtime.server";
import {
  sendEmailViaResend,
  REPORT_NOTIFY_HEADER,
  type EmailMessage,
} from "./report-notify.server";
import { MIN_SHARED_SECRET_LENGTH, secretMatches } from "./shared-secret.server";
import {
  NOTIFY_RETRY_AFTER_MINUTES,
  buildReplyNotice,
  buildTicketDigest,
  digestDue,
  emailBudgetLeft,
  notifyLabel,
  sweepDecision,
  type ReplyNotice,
} from "./support-notify";

/**
 * "Tell the learner a person replied" and the owner's new-ticket digest (milestone 6). The database queues the job
 * (support_queue_staff_reply) and posts its id here; this reads who to tell, sends one email and one push, and stamps
 * the row so the 15-minute sweep (maintenance.server.ts) retries only what is missing.
 *
 * PRIVACY RULES, each pinned by support-notify.server.test.ts and support-body-guard.test.ts:
 *   - Nothing here ever selects support_messages.body. The notice is built from a person's label alone.
 *   - The learner's address and the staff member's name are read on the server for this one send and go nowhere
 *     else: not into a log, not into the response, not into the queue row.
 *   - Logs carry an event name and a status only.
 */

export type QueueRow = {
  id: number;
  conversationId: string;
  messageId: number;
  queuedAt: Date;
  emailSentAt: Date | null;
  pushSentAt: Date | null;
  deliveredAt: Date | null;
  gaveUpAt: Date | null;
  attempts: number;
};

export type Recipient = {
  userId: string;
  /** The learner's account address; null when the account has none. */
  email: string | null;
  /** The staff member who wrote the reply, for the label. Raw: it is reduced to a first name before it is used. */
  staff: { displayName: string | null; email: string | null } | null;
};

export type QueuePatch = Partial<{
  emailSentAt: Date;
  pushSentAt: Date;
  deliveredAt: Date;
  gaveUpAt: Date;
  attempts: number;
  lastAttemptAt: Date;
}>;

export interface SupportNotifyStore {
  getRow(id: number): Promise<QueueRow | null>;
  /** Rows neither delivered nor given up that were queued before `before`, oldest first. */
  waitingRows(before: Date, limit: number): Promise<QueueRow[]>;
  recipient(row: QueueRow): Promise<Recipient | null>;
  emailsSentSince(since: Date): Promise<number>;
  save(id: number, patch: QueuePatch): Promise<void>;
  /** Ids of conversations handed to a person (status new) that the owner was not yet told about. */
  unseenNewTickets(limit: number): Promise<string[]>;
  lastDigestAt(): Promise<Date | null>;
  markSeen(conversationIds: string[], at: Date): Promise<void>;
}

export type SupportNotifyDeps = {
  store: SupportNotifyStore;
  now: () => Date;
  sendEmail: (msg: EmailMessage) => Promise<void>;
  /** Throws on a failed call; a learner with no device is a success (the sender does nothing). */
  sendPush: (userId: string, push: ReplyNotice["push"]) => Promise<void>;
  /** Where the owner digest goes; empty means no digest. */
  ownerEmail: string;
  supportFrom: string;
};

export const DEFAULT_SUPPORT_FROM =
  "Learn with Alphonso Support team <support@hello.learnwithalphonso.com>";
const BATCH = 20;

export type Outcome = "sent" | "skipped" | "failed" | "done";
export type DeliveryResult = { email: Outcome; push: Outcome; delivered: boolean };

/** Sends what is still owed for one queue row and stamps what went out. Never throws for a failed channel. */
export async function deliverNotice(
  deps: SupportNotifyDeps,
  row: QueueRow,
): Promise<DeliveryResult> {
  const { store } = deps;
  const none: DeliveryResult = { email: "done", push: "done", delivered: true };
  if (row.deliveredAt || row.gaveUpAt) return none;
  const who = await store.recipient(row);
  const now = deps.now();
  if (!who) {
    // The learner or the reply is gone (account deleted): nothing to tell.
    await store.save(row.id, { deliveredAt: now, attempts: row.attempts + 1, lastAttemptAt: now });
    return { email: "skipped", push: "skipped", delivered: true };
  }
  const notice = buildReplyNotice(notifyLabel(who.staff?.displayName, who.staff?.email));
  const patch: QueuePatch = { attempts: row.attempts + 1, lastAttemptAt: now };
  const result: DeliveryResult = { email: "done", push: "done", delivered: false };
  let emailDone = row.emailSentAt !== null;
  let pushDone = row.pushSentAt !== null;

  if (!emailDone) {
    if (!who.email) {
      // An account with no address (nothing to send to): done, not retried.
      emailDone = true;
      patch.emailSentAt = now;
      result.email = "skipped";
    } else if (!emailBudgetLeft(await store.emailsSentSince(new Date(now.getTime() - 3_600_000)))) {
      // Over the hourly cap: left for the sweep, which tries again later.
      result.email = "failed";
      console.error("[support-notify] email held back: hourly cap reached");
    } else {
      try {
        await deps.sendEmail({
          from: deps.supportFrom,
          to: who.email,
          subject: notice.email.subject,
          text: notice.email.text,
        });
        emailDone = true;
        patch.emailSentAt = now;
        result.email = "sent";
      } catch (e) {
        result.email = "failed";
        // The sender's error carries a status and a short code only (sendEmailViaResend), never the address.
        console.error("[support-notify] email failed:", e instanceof Error ? e.message : "error");
      }
    }
  }

  if (!pushDone) {
    try {
      await deps.sendPush(who.userId, notice.push);
      pushDone = true;
      patch.pushSentAt = now;
      result.push = "sent";
    } catch (e) {
      result.push = "failed";
      console.error("[support-notify] push failed:", e instanceof Error ? e.message : "error");
    }
  }

  if (emailDone && pushDone) {
    patch.deliveredAt = now;
    result.delivered = true;
  }
  await store.save(row.id, patch);
  return result;
}

const payloadSchema = z.object({ queueId: z.number().int().positive() });

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Target of the database trigger only (support_queue_staff_reply), authenticated by the report-notify shared secret. */
export async function handleSupportNotify(
  request: Request,
  makeDeps: () => Promise<SupportNotifyDeps> = defaultSupportDeps,
): Promise<Response> {
  const expected = process.env.REPORT_NOTIFY_SECRET ?? "";
  if (expected.length < MIN_SHARED_SECRET_LENGTH) {
    console.error("[support-notify] REPORT_NOTIFY_SECRET (32+ chars) is not configured");
    return json({ error: "not-configured" }, 503);
  }
  // Authenticate before reading the body.
  if (!secretMatches(expected, request.headers.get(REPORT_NOTIFY_HEADER))) {
    return json({ error: "unauthorized" }, 401);
  }
  let queueId: number;
  try {
    queueId = payloadSchema.parse(await request.json()).queueId;
  } catch {
    return json({ error: "bad-payload" }, 400);
  }
  try {
    const deps = await makeDeps();
    const row = await deps.store.getRow(queueId);
    if (!row) return json({ ok: true, found: false }, 200);
    const r = await deliverNotice(deps, row);
    // Counts and words only: this response is stored in the database's request log.
    return json({ ok: true, email: r.email, push: r.push, delivered: r.delivered }, 200);
  } catch (e) {
    console.error("[support-notify] failed:", e instanceof Error ? e.message : "error");
    return json({ error: "failed" }, 500);
  }
}

export type SupportSweepResult = {
  retried: number;
  delivered: number;
  gaveUp: number;
  digest: number;
};

/**
 * The sweep's share (maintenance.server.ts): retries a notice the route never finished after 10 minutes, gives up on one
 * older than 24 hours, and sends the owner one digest of tickets they were not yet told about.
 */
export async function sweepSupport(deps: SupportNotifyDeps): Promise<SupportSweepResult> {
  const { store } = deps;
  const now = deps.now();
  const result: SupportSweepResult = { retried: 0, delivered: 0, gaveUp: 0, digest: 0 };
  const rows = await store.waitingRows(
    new Date(now.getTime() - NOTIFY_RETRY_AFTER_MINUTES * 60_000),
    BATCH,
  );
  for (const row of rows) {
    const decision = sweepDecision(row, now);
    if (decision === "give_up") {
      await store.save(row.id, { gaveUpAt: now });
      result.gaveUp += 1;
    } else if (decision === "retry") {
      result.retried += 1;
      const r = await deliverNotice(deps, row);
      if (r.delivered) result.delivered += 1;
    }
  }
  result.digest = await sendDigest(deps);
  return result;
}

/** Tells the owner how many new tickets are waiting: a count, never a learner's words. Returns the count sent. */
export async function sendDigest(deps: SupportNotifyDeps): Promise<number> {
  if (!deps.ownerEmail) return 0;
  const now = deps.now();
  if (!digestDue(await deps.store.lastDigestAt(), now)) return 0;
  const ids = await deps.store.unseenNewTickets(200);
  const mail = buildTicketDigest(ids.length);
  if (!mail) return 0;
  try {
    await deps.sendEmail({ to: deps.ownerEmail, subject: mail.subject, text: mail.text });
  } catch (e) {
    console.error("[support-notify] digest failed:", e instanceof Error ? e.message : "error");
    return 0;
  }
  // Marked only after the send: a failed send is tried again on the next pass.
  await deps.store.markSeen(ids, now);
  return ids.length;
}

// ---- production wiring ----

type Q = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};
const must = (r: Q, what: string) => {
  if (r.error) throw new Error(`${what} failed`);
  return r.data;
};

const dateOrNull = (v: unknown): Date | null => (typeof v === "string" ? new Date(v) : null);
const COLUMNS =
  "id, conversation_id, message_id, queued_at, email_sent_at, push_sent_at, delivered_at, gave_up_at, attempts";

type RawRow = Record<string, unknown>;
const toRow = (r: RawRow): QueueRow => ({
  id: Number(r.id),
  conversationId: String(r.conversation_id),
  messageId: Number(r.message_id),
  queuedAt: new Date(String(r.queued_at)),
  emailSentAt: dateOrNull(r.email_sent_at),
  pushSentAt: dateOrNull(r.push_sent_at),
  deliveredAt: dateOrNull(r.delivered_at),
  gaveUpAt: dateOrNull(r.gave_up_at),
  attempts: Number(r.attempts ?? 0),
});

/** The store over the service-role client. Never selects a message body. */
export function supabaseNotifyStore(admin: LooseAdmin): SupportNotifyStore {
  return {
    async getRow(id) {
      const rows = must(
        await admin.from("support_notify_queue").select(COLUMNS).eq("id", id).limit(1),
        "queue read",
      ) as RawRow[];
      return rows[0] ? toRow(rows[0]) : null;
    },
    async waitingRows(before, limit) {
      const rows = must(
        await admin
          .from("support_notify_queue")
          .select(COLUMNS)
          .is("delivered_at", null)
          .is("gave_up_at", null)
          .lt("queued_at", before.toISOString())
          .order("queued_at", { ascending: true })
          .limit(limit),
        "queue list",
      ) as RawRow[];
      return rows.map(toRow);
    },
    async recipient(row) {
      const conv = must(
        await admin
          .from("support_conversations")
          .select("user_id")
          .eq("id", row.conversationId)
          .limit(1),
        "conversation read",
      ) as { user_id: string }[];
      if (!conv[0]) return null;
      // Only the author id of the reply is read, never its text.
      const msg = must(
        await admin.from("support_messages").select("author_id").eq("id", row.messageId).limit(1),
        "reply read",
      ) as { author_id: string | null }[];
      const learner = await admin.auth.admin.getUserById(conv[0].user_id);
      if (!learner.data.user) return null;
      let staff: Recipient["staff"] = null;
      const authorId = msg[0]?.author_id ?? null;
      if (authorId) {
        const profiles = must(
          await admin.from("profiles").select("display_name").eq("id", authorId).limit(1),
          "staff name",
        ) as { display_name: string | null }[];
        const author = await admin.auth.admin.getUserById(authorId);
        staff = {
          displayName: profiles[0]?.display_name ?? null,
          email: author.data.user?.email ?? null,
        };
      }
      return { userId: conv[0].user_id, email: learner.data.user.email ?? null, staff };
    },
    async emailsSentSince(since) {
      const r = (await admin
        .from("support_notify_queue")
        .select("id", { count: "exact", head: true })
        .gte("email_sent_at", since.toISOString())) as Q;
      if (r.error) throw new Error("queue count failed");
      return r.count ?? 0;
    },
    async save(id, patch) {
      const body: Record<string, unknown> = {};
      if (patch.emailSentAt) body.email_sent_at = patch.emailSentAt.toISOString();
      if (patch.pushSentAt) body.push_sent_at = patch.pushSentAt.toISOString();
      if (patch.deliveredAt) body.delivered_at = patch.deliveredAt.toISOString();
      if (patch.gaveUpAt) body.gave_up_at = patch.gaveUpAt.toISOString();
      if (patch.attempts !== undefined) body.attempts = patch.attempts;
      if (patch.lastAttemptAt) body.last_attempt_at = patch.lastAttemptAt.toISOString();
      must(await admin.from("support_notify_queue").update(body).eq("id", id), "queue save");
    },
    async unseenNewTickets(limit) {
      const tickets = must(
        await admin
          .from("support_conversations")
          .select("id")
          .eq("status", "new")
          .limit(limit * 2),
        "ticket list",
      ) as { id: string }[];
      if (tickets.length === 0) return [];
      const seen = must(
        await admin
          .from("support_digest_seen")
          .select("conversation_id")
          .in(
            "conversation_id",
            tickets.map((t) => t.id),
          ),
        "digest read",
      ) as { conversation_id: string }[];
      const told = new Set(seen.map((s) => s.conversation_id));
      return tickets
        .map((t) => t.id)
        .filter((id) => !told.has(id))
        .slice(0, limit);
    },
    async lastDigestAt() {
      const rows = must(
        await admin
          .from("support_digest_seen")
          .select("seen_at")
          .order("seen_at", { ascending: false })
          .limit(1),
        "digest time",
      ) as { seen_at: string }[];
      return rows[0] ? new Date(rows[0].seen_at) : null;
    },
    async markSeen(ids, at) {
      if (ids.length === 0) return;
      must(
        await admin
          .from("support_digest_seen")
          .upsert(ids.map((id) => ({ conversation_id: id, seen_at: at.toISOString() }))),
        "digest save",
      );
    },
  };
}

/** The push goes through the existing send-push Edge Function (APNs and FCM), called with the service role key. */
export async function sendPushViaEdgeFunction(
  userId: string,
  push: ReplyNotice["push"],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("push is not configured");
  const res = await fetchImpl(`${url.replace(/\/$/, "")}/functions/v1/send-push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, title: push.title, body: push.body, data: push.data }),
    signal: AbortSignal.timeout(10_000),
  });
  // Status only: the body is never read into a log.
  if (!res.ok) throw new Error(`send-push ${res.status}`);
}

export async function defaultSupportDeps(): Promise<SupportNotifyDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    store: supabaseNotifyStore(supabaseAdmin as unknown as LooseAdmin),
    now: () => new Date(),
    sendEmail: (m) => sendEmailViaResend(m),
    sendPush: (userId, push) => sendPushViaEdgeFunction(userId, push),
    ownerEmail: process.env.REPORT_NOTIFY_TO ?? "",
    supportFrom: process.env.SUPPORT_NOTIFY_FROM || DEFAULT_SUPPORT_FROM,
  };
}
