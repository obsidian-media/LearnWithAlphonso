import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";
import { callRpc } from "./untyped-rpc";
import type { TicketDetail } from "./staff-support.server";

/**
 * The support inbox for the staff console. Every function is gated by requireStaff(scope). The reads never show the
 * learner's name or email (the facts panel is the snapshot the AI saw); opening a ticket is recorded in the action
 * record BEFORE any of it is returned. Each write is one staff_support_* SQL function that changes the data and writes
 * its action-record row in the same transaction; message and note text never go into the record. Server-only helpers
 * are imported inside the handlers so they never reach a client bundle.
 */

const idSchema = z.string().uuid();

export const TOO_MANY_READS = "Too many requests. Wait a minute and try again.";
export const TOO_MANY_CHANGES = "Too many changes. Wait a minute and try again.";
export const NO_TICKET_MESSAGE = "That ticket does not exist.";
export const ASSIGN_OTHERS_MESSAGE = "Handing a ticket to someone else needs the Staff permission.";
export const TOO_OLD_MESSAGE = "This chat is too old to reopen; the learner can start a new one.";
export const SELF_TICKET_MESSAGE = "You cannot act on your own account.";
export const NO_OWNER_MESSAGE = "There is no active owner to hand this ticket to.";
export const OWNER_ONLY_MESSAGE = "Only an owner can do that.";
export const NOT_ALLOWED_MESSAGE = "You cannot do that on this ticket.";
export const REASON_NEEDED_MESSAGE = "A reason of 3 to 500 characters is required.";

export type TicketFilter = "open" | "waiting" | "solved" | "breaching" | "all";
export type TicketAssigned = "any" | "me" | "unassigned";

export type TicketSummary = {
  id: string;
  /** The visible ticket number; null only for a chat that has not reached a person. */
  ticketNo: number | null;
  status: "new" | "open" | "waiting_learner" | "solved";
  topic: string | null;
  channel: "web" | "ios" | "android";
  handoffReason: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  snippet: string | null;
  createdAt: string;
  updatedAt: string;
  unopened: boolean;
  /** When the learner started waiting for a staff reply; null unless the ticket needs one (new or open). */
  waitingSince: string | null;
  /** True when it has waited longer than the support_breach_hours setting. */
  breaching: boolean;
  /** Handed to an owner and not yet cleared or solved. */
  urgent: boolean;
};

export type InboxCounts = {
  open: number;
  waiting: number;
  solved: number;
  all: number;
  unassigned: number;
  /** Tickets that need a reply and nobody holds. */
  openUnassigned: number;
  /** Tickets that need a reply and the caller holds. */
  mine: number;
  /** Unsolved tickets handed to an owner. */
  urgent: number;
  /** null when the setting is missing: never a 0 for unknown. */
  breaching: number | null;
  oldestWaitingSince: string | null;
};

export type InboxPage = {
  tickets: TicketSummary[];
  total: number;
  counts: InboxCounts;
  /** The support_breach_hours setting the counts used; null when it is missing. */
  breachHours: number | null;
  next: { at: string; id: string; urgent: boolean } | null;
  /** The signed-in staff member, so the screen can say "You". */
  me: string;
};

type SqlError = { code?: string } | null;

/** The plain sentence for each database refusal; anything unexpected says nothing was changed. */
function refusal(error: NonNullable<SqlError>, fallback: string, byCode: Record<string, string>) {
  const known = error.code ? byCode[error.code] : undefined;
  return new Error(known ?? fallback);
}

const COMMON_REFUSALS: Record<string, string> = {
  P0002: NO_TICKET_MESSAGE,
  "42501": SELF_TICKET_MESSAGE,
  "55000": "This ticket is still with the AI or is solved. Reopen it first.",
};

/** Tickets, newest activity first, 25 a page. No learner name or email. */
export const staffListTickets = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        filter: z.enum(["open", "waiting", "solved", "breaching", "all"]).default("open"),
        assigned: z.enum(["any", "me", "unassigned"]).default("any"),
        cursor: z
          .object({
            at: z.string().min(1).max(64),
            id: idSchema,
            urgent: z.boolean().default(false),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InboxPage> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_read))
    )
      throw new Error(TOO_MANY_READS);
    const { stripSupportLink } = await import("./support-links");
    const { data: raw, error } = await context.supabaseAdmin.rpc("staff_support_inbox", {
      p_actor: context.userId,
      p_filter: data.filter,
      p_assigned: data.assigned,
      p_cursor_at: data.cursor?.at ?? null,
      p_cursor_id: data.cursor?.id ?? null,
      p_limit: 25,
      p_cursor_urgent: data.cursor?.urgent ?? false,
    } as never);
    if (error || !raw || typeof raw !== "object") throw new Error("Could not read the tickets.");
    const page = raw as unknown as Omit<InboxPage, "me">;
    return {
      ...page,
      // The snippet is the learner's own first message; it goes through the parser like every body.
      tickets: page.tickets.map((t) => ({
        ...t,
        snippet: t.snippet ? stripSupportLink(t.snippet) : null,
      })),
      me: context.userId,
    };
  });

/**
 * One ticket with its whole conversation (the AI part included), notes, the AI summary and the facts panel. The view
 * is recorded FIRST (the learner as the target): no record, no data.
 */
export const staffGetTicket = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.read")])
  .inputValidator((d: unknown) => z.object({ id: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<TicketDetail & { me: string }> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_read))
    )
      throw new Error(TOO_MANY_READS);
    const { recordUserView } = await import("./staff-audit.server");
    const { readTicketRow, loadTicketDetail, readWaiting } = await import("./staff-support.server");
    const { loadSupportFacts } = await import("./support-facts.server");
    const row = await readTicketRow(context.supabaseAdmin, data.id);
    if (!row) throw new Error(NO_TICKET_MESSAGE);
    await recordUserView(context.supabaseAdmin, {
      actor: context.userId,
      role: context.staffRole,
      target: row.user_id,
    });
    const detail = await loadTicketDetail(context.supabaseAdmin, row, {
      canSeeLearner: context.staffScopes.includes("users.read"),
      waiting: await readWaiting(context.supabaseAdmin, row, context.userId),
      rebuildFacts: (userId) => loadSupportFacts(context.supabaseAdmin, userId),
    });
    return { ...detail, me: context.userId };
  });

/** A reply in the learner's chat. The learner is notified later; the notification never carries this text. */
export const staffReplyTicket = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.reply")])
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; messageId: number }> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { data: messageId, error } = await context.supabaseAdmin.rpc("staff_support_reply", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_body: data.body,
    } as never);
    if (error) {
      throw refusal(error, "Could not send the reply. Nothing was sent.", {
        ...COMMON_REFUSALS,
        "22023": "A reply must be 1 to 4000 characters.",
      });
    }
    return { ok: true, messageId: Number(messageId) };
  });

/** The reason on a write that needs one: trimmed, 3 to 500 characters, else the plain sentence. */
function reasonOf(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < 3 || text.length > 500) throw new Error(REASON_NEEDED_MESSAGE);
  return text;
}

/**
 * Assign a ticket. Taking it yourself, or giving back one you hold, needs support.assign and no reason; handing it to
 * anyone else (or taking someone else's back) also needs staff.manage AND a reason (N-8). `assignTo: null` takes the
 * ticket back.
 */
export const staffAssignTicket = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.assign")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: idSchema,
        assignTo: idSchema.nullable(),
        reason: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { readTicketRow } = await import("./staff-support.server");
    const row = await readTicketRow(context.supabaseAdmin, data.id);
    const held = row?.assigned_to ?? null;
    // Reason-free: picking up a ticket nobody holds, or giving back one you hold (a fixed word is recorded). Taking over
    // a ticket ANOTHER person holds is a reassignment: it needs a reason.
    const pickUp = data.assignTo === context.userId && held === null;
    const giveBack = data.assignTo === null && held === context.userId;
    const alreadyMine = data.assignTo === context.userId && held === context.userId; // a no-op
    const selfMove = pickUp || giveBack || alreadyMine;
    // Moving a ticket to someone else (or taking someone else's back to the pool) also needs the Staff permission;
    // taking one over for yourself needs only support.assign.
    if (
      data.assignTo !== context.userId &&
      !giveBack &&
      !context.staffScopes.includes("staff.manage")
    ) {
      throw new Error(ASSIGN_OTHERS_MESSAGE);
    }
    const reason = selfMove ? null : reasonOf(data.reason);
    const { data: changed, error } = await context.supabaseAdmin.rpc("staff_support_assign", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_assignee: data.assignTo,
      p_reason: reason,
    } as never);
    if (error) {
      throw refusal(error, "Could not assign the ticket. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "22023": "That person cannot work support tickets.",
      });
    }
    return { ok: true, changed: changed === true };
  });

/** open, waiting on the learner, or solved; a solved ticket can only be reopened. Every change carries a reason (N-8). */
export const staffSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.reply")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: idSchema,
        status: z.enum(["open", "waiting_learner", "solved"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    const reason = reasonOf(data.reason);
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { data: changed, error } = await context.supabaseAdmin.rpc("staff_support_set_status", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_status: data.status,
      p_reason: reason,
    } as never);
    if (error) {
      throw refusal(error, "Could not change the status. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "22023": "A solved ticket can only be reopened.",
        "23505": "The learner already has an open conversation, so this one cannot be reopened.",
        LW001: TOO_OLD_MESSAGE,
      });
    }
    return { ok: true, changed: changed === true };
  });

/** An internal note: the learner never sees it, and its text stays out of the action record. */
export const staffAddTicketNote = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.reply")])
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { error } = await context.supabaseAdmin.rpc("staff_support_add_note", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_body: data.body,
    } as never);
    if (error) {
      throw refusal(error, "Could not save the note.", {
        ...COMMON_REFUSALS,
        "22023": "A note must be 1 to 2000 characters.",
      });
    }
    return { ok: true };
  });

/**
 * Hand a ticket to an owner (N-13): the database reassigns it to an active owner and marks it urgent, with this reason
 * and one action-record row. Any support agent who may assign can do it; it needs no Staff permission because the
 * ticket only ever goes UP to an owner, never sideways.
 */
export const staffHandToOwner = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.assign")])
  .inputValidator((d: unknown) => z.object({ id: idSchema, reason: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    const reason = reasonOf(data.reason);
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { data: changed, error } = await callRpc(
      context.supabaseAdmin,
      "staff_support_hand_to_owner",
      {
        p_actor: context.userId,
        p_role: context.staffRole,
        p_conversation: data.id,
        p_reason: reason,
      },
    );
    if (error) {
      throw refusal(error, "Could not hand the ticket over. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "42501": NOT_ALLOWED_MESSAGE,
        "22023": REASON_NEEDED_MESSAGE,
        LW002: NO_OWNER_MESSAGE,
      });
    }
    return { ok: true, changed: changed === true };
  });

/** An owner takes the urgent flag off a ticket, with a reason. (Solving a ticket clears it too.) */
export const staffClearUrgent = createServerFn({ method: "POST" })
  .middleware([requireStaff("staff.manage")])
  .inputValidator((d: unknown) => z.object({ id: idSchema, reason: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    if (context.staffRole !== "owner") throw new Error(OWNER_ONLY_MESSAGE);
    const reason = reasonOf(data.reason);
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.support_write))
    )
      throw new Error(TOO_MANY_CHANGES);
    const { data: changed, error } = await callRpc(
      context.supabaseAdmin,
      "staff_support_clear_urgent",
      {
        p_actor: context.userId,
        p_role: context.staffRole,
        p_conversation: data.id,
        p_reason: reason,
      },
    );
    if (error) {
      throw refusal(error, "Could not clear the flag. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "42501": NOT_ALLOWED_MESSAGE,
        "22023": REASON_NEEDED_MESSAGE,
      });
    }
    return { ok: true, changed: changed === true };
  });
