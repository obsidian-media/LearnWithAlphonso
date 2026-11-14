import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import { createRateLimiter } from "./staff-rate-limit";
import type { TicketDetail } from "./staff-support.server";

/**
 * The support inbox for the staff console. Every function is gated by requireStaff(scope). The reads never show the
 * learner's name or email (the facts panel is the snapshot the AI saw); opening a ticket is recorded in the action
 * record BEFORE any of it is returned. Each write is one staff_support_* SQL function that changes the data and writes
 * its action-record row in the same transaction; message and note text never go into the record. Server-only helpers
 * are imported inside the handlers so they never reach a client bundle.
 */

const idSchema = z.string().uuid();
const readLimiter = createRateLimiter(120, 60_000);
const writeLimiter = createRateLimiter(60, 60_000);

export const TOO_MANY_READS = "Too many requests. Wait a minute and try again.";
export const TOO_MANY_CHANGES = "Too many changes. Wait a minute and try again.";
export const NO_TICKET_MESSAGE = "That ticket does not exist.";
export const ASSIGN_OTHERS_MESSAGE = "Handing a ticket to someone else needs the Staff permission.";
export const SELF_TICKET_MESSAGE = "You cannot act on your own account.";

export type TicketFilter = "open" | "waiting" | "solved" | "all";
export type TicketAssigned = "any" | "me" | "unassigned";

export type TicketSummary = {
  id: string;
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
};

export type InboxPage = {
  tickets: TicketSummary[];
  total: number;
  counts: { open: number; waiting: number; solved: number; all: number; unassigned: number };
  next: { at: string; id: string } | null;
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
        filter: z.enum(["open", "waiting", "solved", "all"]).default("open"),
        assigned: z.enum(["any", "me", "unassigned"]).default("any"),
        cursor: z.object({ at: z.string().min(1).max(64), id: idSchema }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InboxPage> => {
    if (!readLimiter.allow(context.userId)) throw new Error(TOO_MANY_READS);
    const { stripSupportLink } = await import("./support-links");
    const { data: raw, error } = await context.supabaseAdmin.rpc("staff_support_inbox", {
      p_actor: context.userId,
      p_filter: data.filter,
      p_assigned: data.assigned,
      p_cursor_at: data.cursor?.at ?? null,
      p_cursor_id: data.cursor?.id ?? null,
      p_limit: 25,
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
    if (!readLimiter.allow(context.userId)) throw new Error(TOO_MANY_READS);
    const { recordUserView } = await import("./staff-audit.server");
    const { readTicketRow, loadTicketDetail } = await import("./staff-support.server");
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
    if (!writeLimiter.allow(context.userId)) throw new Error(TOO_MANY_CHANGES);
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

/**
 * Assign a ticket. Taking it yourself, or giving back one you hold, needs support.assign; handing it to anyone else
 * also needs staff.manage. `assignTo: null` takes the ticket back.
 */
export const staffAssignTicket = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.assign")])
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, assignTo: idSchema.nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    if (!writeLimiter.allow(context.userId)) throw new Error(TOO_MANY_CHANGES);
    if (data.assignTo !== context.userId && !context.staffScopes.includes("staff.manage")) {
      const { readTicketRow } = await import("./staff-support.server");
      const row = await readTicketRow(context.supabaseAdmin, data.id);
      const givingBackMine = data.assignTo === null && row?.assigned_to === context.userId;
      if (!givingBackMine) throw new Error(ASSIGN_OTHERS_MESSAGE);
    }
    const { data: changed, error } = await context.supabaseAdmin.rpc("staff_support_assign", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_assignee: data.assignTo,
    } as never);
    if (error) {
      throw refusal(error, "Could not assign the ticket. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "22023": "That person cannot work support tickets.",
      });
    }
    return { ok: true, changed: changed === true };
  });

/** open, waiting on the learner, or solved; a solved ticket can only be reopened. */
export const staffSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff("support.reply")])
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, status: z.enum(["open", "waiting_learner", "solved"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    if (!writeLimiter.allow(context.userId)) throw new Error(TOO_MANY_CHANGES);
    const { data: changed, error } = await context.supabaseAdmin.rpc("staff_support_set_status", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_conversation: data.id,
      p_status: data.status,
    } as never);
    if (error) {
      throw refusal(error, "Could not change the status. Nothing was changed.", {
        ...COMMON_REFUSALS,
        "22023": "A solved ticket can only be reopened.",
        "23505": "The learner already has an open conversation, so this one cannot be reopened.",
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
    if (!writeLimiter.allow(context.userId)) throw new Error(TOO_MANY_CHANGES);
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
