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
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="font-display text-2xl font-semibold text-ds-ink">Support</h1>
        <div className="mt-4 rounded-2xl border border-ds-line bg-ds-card p-4">
          <p className="text-sm font-bold text-ds-ink">Forbidden: missing scope support.read</p>
          <p className="ds-type-footnote text-ds-ink-soft">
            Ask the owner to add the Support role to your account.
          </p>
        </div>
      </main>
    );
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
