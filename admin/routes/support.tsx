import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import {
  staffListTickets,
  type InboxPage,
  type TicketAssigned,
  type TicketFilter,
} from "@/lib/staff-support.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { TicketList } from "@/components/staff/TicketList";

export const Route = createFileRoute("/support")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("support.read")) return { forbidden: true as const };
      return { forbidden: false as const, first: await staffListTickets({ data: {} }) };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Support,
});

function Support() {
  const data = Route.useLoaderData();
  const [page, setPage] = useState<InboxPage | null>(null);
  const [filter, setFilter] = useState<TicketFilter>("open");
  const [assigned, setAssigned] = useState<TicketAssigned>("any");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) {
    return <ForbiddenCard title="Support" scope="support.read" />;
  }
  const shown = page ?? data.first;

  async function load(nextFilter: TicketFilter, nextAssigned: TicketAssigned, append: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await staffListTickets({
        data: {
          filter: nextFilter,
          assigned: nextAssigned,
          cursor: append ? (shown.next ?? undefined) : undefined,
        },
      });
      setPage(append ? { ...result, tickets: [...shown.tickets, ...result.tickets] } : result);
      setFilter(nextFilter);
      setAssigned(nextAssigned);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the tickets.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <TicketList
        page={shown}
        filter={filter}
        assigned={assigned}
        busy={busy}
        error={error}
        onFilter={(f, a) => load(f, a, false)}
        onMore={() => load(filter, assigned, true)}
      />
    </main>
  );
}
