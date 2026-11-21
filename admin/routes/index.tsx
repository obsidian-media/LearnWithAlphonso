import { createFileRoute, redirect } from "@tanstack/react-router";
import { SECOND_FACTOR_REQUIRED_MESSAGE } from "@/lib/admin-auth";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffGetSystemHealth } from "@/lib/staff-health.functions";
import { staffHomeFeed, staffHomeMetrics, staffHomeMoney } from "@/lib/staff-home.functions";
import {
  staffAssignTicket,
  staffGetTicket,
  staffListTickets,
  staffReplyTicket,
  staffSetTicketStatus,
} from "@/lib/staff-support.functions";
import { HomeScreen } from "@/components/console/home/HomeScreen";
import type { HomeApi, HomeData } from "@/components/console/home/homeApi";

/** The Home screen's calls: the existing server functions, each of which checks its own scope. */
const api: HomeApi = {
  listTickets: (query) => staffListTickets({ data: query }),
  getTicket: (id) => staffGetTicket({ data: { id } }),
  replyTicket: (id, body) => staffReplyTicket({ data: { id, body } }),
  assignTicket: (id, assignTo) => staffAssignTicket({ data: { id, assignTo } }),
  resolveTicket: (id, reason) => staffSetTicketStatus({ data: { id, status: "solved", reason } }),
  metrics: (range) => staffHomeMetrics({ data: { range } }),
  money: () => staffHomeMoney(),
};

export const Route = createFileRoute("/")({
  // The gate is the server function, not this loader. A loader runs on the client too and is trivially skipped;
  // adminWhoAmI throws for anyone who is not active staff, and every read below is made by a call that checks its own
  // scope. This redirect is a courtesy to a signed-out person, not a control.
  loader: async (): Promise<{
    me: { displayName: string | null; scopes: readonly string[] };
    data: HomeData;
  }> => {
    let me: Awaited<ReturnType<typeof adminWhoAmI>>;
    try {
      me = await adminWhoAmI();
    } catch (error) {
      // Staff whose session lacks a required second factor are sent to finish it, not to sign in again.
      const needsSecondFactor =
        error instanceof Error && error.message.includes(SECOND_FACTOR_REQUIRED_MESSAGE);
      throw redirect({ to: "/signin", search: needsSecondFactor ? { mfa: "required" } : {} });
    }
    const has = (scope: string) => me.scopes.includes(scope);
    // One read per card the person may see. undefined = not theirs to see; null = the read failed (the card says so).
    const [queue, metrics, health, feed] = await Promise.all([
      has("support.read") ? staffListTickets({ data: {} }).catch(() => null) : undefined,
      has("numbers.read")
        ? staffHomeMetrics({ data: { range: "today" } }).catch(() => null)
        : undefined,
      has("numbers.read") ? staffGetSystemHealth().catch(() => null) : undefined,
      has("audit.read") ? staffHomeFeed().catch(() => null) : undefined,
    ]);
    return {
      me: { displayName: me.displayName, scopes: me.scopes },
      data: { loadedAt: new Date().toISOString(), queue, metrics, health, feed },
    };
  },
  component: Home,
});

function Home() {
  const { me, data } = Route.useLoaderData();
  return <HomeScreen me={me} data={data} api={api} />;
}
