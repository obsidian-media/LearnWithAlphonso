import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminListReports,
  adminDeleteReportedUser,
  adminResetDisplayName,
  adminRenameTeam,
  adminDisbandTeam,
  adminDismissReport,
  type AdminReport,
} from "@/lib/admin.functions";

/**
 * Abuse reports (App Store Guideline 1.2 -- responding to a complaint
 * about user-generated content/interaction). content_reports has been
 * insert-only since it was created (supabase/migrations/
 * 20260928020000_block_and_report.sql) -- reports went in and nothing
 * ever read them back. This is that read, plus the actions that respond
 * to a report: delete or rename the account, rename or disband the team,
 * or dismiss the report.
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

const KIND_LABEL: Record<AdminReport["kind"], string> = {
  user: "Learner",
  team_name: "Team name",
  ai_response: "AI response",
};

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
  const [newTeamName, setNewTeamName] = useState("");
  const [disbanding, setDisbanding] = useState(false);
  const [disbandText, setDisbandText] = useState("");

  /** Every action: busy while it runs, the server's message on failure, a re-read of the list on success. */
  async function act(action: () => Promise<unknown>, fallback: string) {
    onError(null);
    setBusy(true);
    try {
      await action();
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : fallback);
      setBusy(false);
    }
  }

  async function remove() {
    onError(null);
    setBusy(true);
    try {
      await adminDeleteReportedUser({ data: { reportId: report.id } });
      // content_reports.reported cascades on delete, so this report (and
      // every other one against the same account) is already gone once the
      // request above resolves -- invalidating just re-reads the list.
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-hairline pb-4">
      <p className="text-xs uppercase tracking-wider text-ink-soft">{KIND_LABEL[report.kind]}</p>
      <p>
        <strong>{report.reportedName ?? "No account (AI response)"}</strong> reported by{" "}
        {report.reporterName}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{report.reason}</p>
      {report.kind === "ai_response" && typeof report.context?.message === "string" ? (
        <p className="mt-1 whitespace-pre-wrap rounded border border-hairline p-2 text-sm">
          {report.context.message}
        </p>
      ) : null}
      {report.teamId ? (
        <p className="mt-1 text-sm">
          Team: <strong>{report.teamName ?? "(team no longer exists)"}</strong>{" "}
          <span className="text-xs text-ink-soft">{report.teamId}</span>
        </p>
      ) : null}
      <p className="mt-1 text-xs text-ink-soft">{new Date(report.createdAt).toLocaleString()}</p>

      <div className="mt-2 flex flex-wrap gap-4">
        {report.reportedId ? (
          <button
            onClick={() =>
              act(() => adminResetDisplayName({ data: { reportId: report.id } }), "Reset failed.")
            }
            disabled={busy}
            className="text-sm text-moss underline disabled:opacity-50"
          >
            Reset display name
          </button>
        ) : null}
        <button
          onClick={() =>
            act(() => adminDismissReport({ data: { reportId: report.id } }), "Dismiss failed.")
          }
          disabled={busy}
          className="text-sm text-ink-soft underline disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>

      {report.teamId ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="New team name"
              aria-label="New team name"
              maxLength={80}
              className="flex-1 rounded border border-hairline px-3 py-2 text-sm"
            />
            <button
              onClick={() =>
                act(
                  () =>
                    adminRenameTeam({ data: { reportId: report.id, name: newTeamName.trim() } }),
                  "Rename failed.",
                )
              }
              disabled={busy || newTeamName.trim().length === 0}
              className="text-sm text-moss underline disabled:opacity-50"
            >
              Rename team
            </button>
          </div>
          {!disbanding ? (
            <button
              onClick={() => setDisbanding(true)}
              disabled={busy}
              className="text-sm text-ember"
            >
              Disband team
            </button>
          ) : (
            <div className="space-y-2 rounded border border-hairline p-3">
              <p className="text-xs text-ember">
                This deletes {report.teamName ?? "the team"} for every member. It cannot be undone.
                Type DISBAND to confirm.
              </p>
              <input
                value={disbandText}
                onChange={(e) => setDisbandText(e.target.value.toUpperCase())}
                placeholder="DISBAND"
                className="w-full rounded border border-hairline px-3 py-2 text-sm"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setDisbanding(false);
                    setDisbandText("");
                  }}
                  disabled={busy}
                  className="text-sm text-ink-soft underline disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    act(
                      () => adminDisbandTeam({ data: { reportId: report.id } }),
                      "Disband failed.",
                    )
                  }
                  disabled={disbandText !== "DISBAND" || busy}
                  className="text-sm font-semibold text-ember disabled:opacity-50"
                >
                  {busy ? "Disbanding…" : "Disband forever"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {!report.reportedId ? null : !confirming ? (
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
