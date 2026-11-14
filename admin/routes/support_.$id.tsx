import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import {
  staffAddTicketNote,
  staffAssignTicket,
  staffGetTicket,
  staffReplyTicket,
  staffSetTicketStatus,
} from "@/lib/staff-support.functions";
import { staffListStaff } from "@/lib/staff-admin.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { TicketView, type AssignableStaff } from "@/components/staff/TicketView";

// The trailing underscore keeps this page from nesting under support.tsx (which has no Outlet): /support/$id is its
// own page, not a child drawn inside the inbox.
export const Route = createFileRoute("/support_/$id")({
  loader: async ({ params }) => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("support.read")) return { forbidden: true as const };
      // Opening a ticket is recorded in the action record before any of it comes back.
      const ticket = await staffGetTicket({ data: { id: params.id } });
      // Handing a ticket to someone else is for managers; only they need the list of people.
      let assignable: AssignableStaff[] | null = null;
      if (me.scopes.includes("staff.manage")) {
        try {
          assignable = (await staffListStaff())
            .filter(
              (s) =>
                !s.disabled &&
                s.role !== "support_ai" &&
                (s.role === "owner" || s.scopes.includes("support.read")),
            )
            .map((s) => ({ userId: s.userId, name: s.displayName ?? "Staff" }));
        } catch {
          assignable = null;
        }
      }
      return { forbidden: false as const, ticket, scopes: me.scopes, assignable, missing: false };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      if (e instanceof Error && e.message === "That ticket does not exist.") {
        return { forbidden: false as const, missing: true as const };
      }
      throw redirect({ to: "/signin" });
    }
  },
  component: Ticket,
});

function Ticket() {
  const data = Route.useLoaderData();
  const { id } = Route.useParams();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.forbidden) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="rounded-2xl border border-ds-line bg-ds-card p-4">
          <p className="text-sm font-bold text-ds-ink">Forbidden: missing scope support.read</p>
          <p className="ds-type-footnote text-ds-ink-soft">
            Ask the owner to add the Support role to your account.
          </p>
        </div>
      </main>
    );
  }
  if (data.missing) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <a href="/support" className="text-sm font-bold text-ds-choice underline">
          ← Support
        </a>
        <p className="mt-3 text-ds-ink-soft">That ticket does not exist.</p>
      </main>
    );
  }

  async function run(action: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNotice(done);
      await router.invalidate();
      return true;
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : "That did not work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <TicketView
        ticket={data.ticket}
        scopes={data.scopes}
        assignable={data.assignable}
        busy={busy}
        error={error}
        notice={notice}
        onReply={(body) => run(() => staffReplyTicket({ data: { id, body } }), "Reply sent.")}
        onNote={(body) => run(() => staffAddTicketNote({ data: { id, body } }), "Note added.")}
        onAssign={(assignTo) =>
          void run(
            () => staffAssignTicket({ data: { id, assignTo } }),
            assignTo ? "Assigned." : "Ticket unassigned.",
          )
        }
        onStatus={(status) =>
          void run(
            () => staffSetTicketStatus({ data: { id, status } }),
            status === "solved"
              ? "Marked solved."
              : status === "open"
                ? "Reopened."
                : "Status changed.",
          )
        }
      />
    </main>
  );
}
