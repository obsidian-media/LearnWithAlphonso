import type { TicketDetail } from "../../../lib/staff-support.server";
import type { InboxPage, TicketAssigned, TicketFilter } from "../../../lib/staff-support.functions";

export type Assignable = { userId: string; name: string };

/**
 * Everything the Support screen calls, as one object the route fills with the real server functions. The screen never
 * imports a server function itself, so a test can hand it fakes and watch exactly what it asks for. Each call is gated
 * on the server by its own requireStaff(scope) (and the database refuses what the data forbids); a button hidden in the
 * UI is courtesy, never the control.
 */
export type SupportApi = {
  listTickets: (query: {
    filter: TicketFilter;
    assigned: TicketAssigned;
    cursor?: NonNullable<InboxPage["next"]>;
  }) => Promise<InboxPage>;
  getTicket: (id: string) => Promise<TicketDetail & { me: string }>;
  reply: (id: string, body: string) => Promise<unknown>;
  note: (id: string, body: string) => Promise<unknown>;
  /** A reason only when handing the ticket to someone else (or taking someone else's back). */
  assign: (id: string, assignTo: string | null, reason?: string) => Promise<unknown>;
  setStatus: (
    id: string,
    status: "open" | "waiting_learner" | "solved",
    reason: string,
  ) => Promise<unknown>;
  handToOwner: (id: string, reason: string) => Promise<unknown>;
  clearUrgent: (id: string, reason: string) => Promise<unknown>;
  /** Who a manager may hand a ticket to. Only called for a person holding staff.manage. */
  listAssignable: () => Promise<Assignable[]>;
  /** Owner only. */
  setBreachHours: (hours: number, reason: string) => Promise<unknown>;
};
