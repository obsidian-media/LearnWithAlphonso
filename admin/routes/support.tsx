import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffListStaff } from "@/lib/staff-admin.functions";
import { staffSetSetting } from "@/lib/staff-settings.functions";
import {
  staffAddTicketNote,
  staffAssignTicket,
  staffClearUrgent,
  staffGetTicket,
  staffHandToOwner,
  staffListTickets,
  staffReplyTicket,
  staffSetTicketStatus,
  type InboxPage,
} from "@/lib/staff-support.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { SupportScreen } from "@/components/console/support/SupportScreen";
import type { SupportApi } from "@/components/console/support/supportApi";

/** The Support screen's calls: the existing server functions, each of which checks its own scope. */
const api: SupportApi = {
  listTickets: (query) => staffListTickets({ data: query }),
  getTicket: (id) => staffGetTicket({ data: { id } }),
  reply: (id, body) => staffReplyTicket({ data: { id, body } }),
  note: (id, body) => staffAddTicketNote({ data: { id, body } }),
  assign: (id, assignTo, reason) => staffAssignTicket({ data: { id, assignTo, reason } }),
  setStatus: (id, status, reason) => staffSetTicketStatus({ data: { id, status, reason } }),
  handToOwner: (id, reason) => staffHandToOwner({ data: { id, reason } }),
  clearUrgent: (id, reason) => staffClearUrgent({ data: { id, reason } }),
  // Handing a ticket to someone else is for managers; only they need the list of people.
  listAssignable: async () =>
    (await staffListStaff())
      .filter(
        (s) =>
          !s.disabled &&
          s.role !== "support_ai" &&
          (s.role === "owner" || s.scopes.includes("support.read")),
      )
      .map((s) => ({ userId: s.userId, name: s.displayName ?? "Staff" })),
  setBreachHours: (hours, reason) =>
    staffSetSetting({ data: { key: "support_breach_hours", value: hours, reason } }),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/support")({
  // `t` is the open ticket, so a link to one ticket (the old /support/<id>) lands on the same screen.
  validateSearch: (search: Record<string, unknown>): { t?: string } =>
    typeof search.t === "string" && UUID.test(search.t) ? { t: search.t } : {},
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("support.read")) return { forbidden: true as const };
      let first: InboxPage | null = null;
      try {
        first = await staffListTickets({ data: {} });
      } catch (e) {
        // A failed list read is told on the screen ("Could not read the tickets"); a refusal is not that.
        if (classifyStaffError(e) !== "signin") throw e;
      }
      return {
        forbidden: false as const,
        me: { displayName: me.displayName, role: me.role, scopes: me.scopes },
        first,
      };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Support,
});

function Support() {
  const data = Route.useLoaderData();
  const { t } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (data.forbidden) return <ForbiddenCard title="Support" scope="support.read" />;
  return (
    <SupportScreen
      me={data.me}
      initial={data.first}
      api={api}
      selectedId={t ?? null}
      onSelect={(id) => void navigate({ search: id ? { t: id } : {} })}
    />
  );
}
