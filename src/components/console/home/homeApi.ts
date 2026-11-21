import type { TicketDetail } from "../../../lib/staff-support.server";
import type { InboxPage, TicketAssigned, TicketFilter } from "../../../lib/staff-support.functions";
import type { FeedRow, HomeMetrics, HomeRange, MoneyTile } from "../../../lib/staff-home.functions";

/**
 * Everything the Home screen calls, as one object the route fills with the real server functions. The screen never
 * imports a server function itself, so a test can hand it fakes and watch exactly what it asks for. Each call is gated
 * on the server by its own requireStaff(scope); a scope hidden in the UI is courtesy, never the control.
 */
export type HomeApi = {
  listTickets: (query: { filter: TicketFilter; assigned: TicketAssigned }) => Promise<InboxPage>;
  getTicket: (id: string) => Promise<TicketDetail & { me: string }>;
  replyTicket: (id: string, body: string) => Promise<unknown>;
  assignTicket: (id: string, assignTo: string | null) => Promise<unknown>;
  /** Resolve keeps its current behaviour in this PR (status "solved", no reason); the reason arrives with N-8. */
  resolveTicket: (id: string) => Promise<unknown>;
  metrics: (range: HomeRange) => Promise<HomeMetrics>;
  money: () => Promise<{ generatedAt: string; tiles: MoneyTile[] }>;
};

/** What the route's loader read. undefined = this person may not see the card; null = it could not be read. */
export type HomeData = {
  loadedAt: string;
  queue: InboxPage | null | undefined;
  metrics: HomeMetrics | null | undefined;
  health:
    | { events: { event: string; status: "green" | "amber" | "red"; count24h: number }[] }
    | null
    | undefined;
  feed: { rows: FeedRow[] } | null | undefined;
};
