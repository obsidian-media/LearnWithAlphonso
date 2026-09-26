import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { adminListReports, adminDeleteReportedUser, type AdminReport } from "@/lib/admin.functions";

/**
 * Abuse reports (App Store Guideline 1.2 -- responding to a complaint
 * about user-generated content/interaction). content_reports has been
 * insert-only since it was created (supabase/migrations/
 * 20260928020000_block_and_report.sql) -- reports went in and nothing
 * ever read them back. This is that read, plus the one action that
 * actually responds to a report rather than just displaying it.
 */
export const Route = createFileRoute("/reports")({
  loader: async () => {
    try {
      return { reports: await adminListReports() };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Reports,
});

function Reports() {
  const { reports } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/" className="text-sm text-moss underline">
        ← Home
      </Link>
      <h1 className="font-display mt-2 text-2xl font-semibold">Reports</h1>
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      {reports.length === 0 ? (
        <p className="mt-6 text-ink-soft">No open reports.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onError={setError}
              onDeleted={() => router.invalidate()}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function ReportRow({
  report,
  onError,
  onDeleted,
}: {
  report: AdminReport;
  onError: (message: string | null) => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    onError(null);
    setBusy(true);
    try {
      await adminDeleteReportedUser({ data: { reportId: report.id } });
      // No separate "dismiss": content_reports.reported cascades on
      // delete, so this report (and every other one against the same
      // account) is already gone from the table once the request above
      // resolves -- invalidating just re-reads the now-shorter list.
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-hairline pb-4">
      <p>
        <strong>{report.reportedName}</strong> reported by {report.reporterName}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{report.reason}</p>
      <p className="mt-1 text-xs text-ink-soft">{new Date(report.createdAt).toLocaleString()}</p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="mt-2 text-sm text-ember"
        >
          Delete this account
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded border border-hairline p-3">
          <p className="text-xs text-ember">
            This permanently deletes {report.reportedName}&rsquo;s account and all their data. It
            cannot be undone. Type DELETE to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            className="w-full rounded border border-hairline px-3 py-2 text-sm"
          />
          <div className="flex gap-4">
            <button
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
              }}
              disabled={busy}
              className="text-sm text-ink-soft underline disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={remove}
              disabled={confirmText !== "DELETE" || busy}
              className="text-sm font-semibold text-ember disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
