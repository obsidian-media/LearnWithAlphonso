import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffListAudit, type AuditRow } from "@/lib/staff-audit.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { AuditView, type AuditFilters } from "@/components/staff/AuditView";

export const Route = createFileRoute("/audit")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("audit.read")) return { forbidden: true as const };
      return { forbidden: false as const, first: await staffListAudit({ data: {} }) };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Audit,
});

function Audit() {
  const data = Route.useLoaderData();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-ink-soft">You do not have access to this page.</p>
      </main>
    );
  }
  const shownRows = rows ?? data.first.rows;
  const shownCursor = cursor === undefined ? data.first.nextCursor : cursor;

  async function load(next: AuditFilters, after?: number, append = false) {
    setBusy(true);
    setError(null);
    try {
      const page = await staffListAudit({ data: { ...next, cursor: after } });
      setRows(append ? [...shownRows, ...page.rows] : page.rows);
      setCursor(page.nextCursor);
      setFilters(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the action record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <AuditView
        rows={shownRows}
        nextCursor={shownCursor}
        error={error}
        busy={busy}
        onFilter={(f) => load(f)}
        onMore={() => (shownCursor ? load(filters, shownCursor, true) : undefined)}
      />
    </main>
  );
}
