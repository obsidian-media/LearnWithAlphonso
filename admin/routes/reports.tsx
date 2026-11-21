import { formatDateTime, formatDay } from "@/lib/staff-dates";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminListReports,
  adminWhoAmI,
  adminResetDisplayName,
  adminRenameTeam,
  adminDisbandTeam,
  adminDismissReport,
  type AdminReport,
} from "@/lib/admin.functions";
import { staffDeleteUser } from "@/lib/staff-users.functions";
import { forbiddenOrSignIn } from "@/lib/staff-forbidden";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { ConsoleCard } from "@/components/staff/ConsoleCard";
import {
  DangerButton,
  EmptyCard,
  ErrorLine,
  FIELD,
  KindPill,
  SmallButton,
} from "@/components/staff/console-ui";

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
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("reports.manage")) return { forbidden: true as const };
      const reports = await adminListReports();
      // Deleting an account is the owner's scope (user.delete); the button is hidden without it, and the server
      // refuses the call regardless.
      return {
        forbidden: false as const,
        reports,
        canDelete: me.scopes.includes("user.delete"),
      };
    } catch (e) {
      // A signed-in person without the scope is told why; a signed-out person goes to sign in.
      return forbiddenOrSignIn(e, "reports.manage");
    }
  },
  component: Reports,
});

function Reports() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) return <ForbiddenCard title="Reports" scope="reports.manage" />;
  const { reports, canDelete } = data;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Reports</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Reports from learners about a person, a team name or an AI answer.
      </p>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {reports.length === 0 ? (
        <EmptyCard title="No open reports." />
      ) : (
        <ul className="mt-4 grid max-w-3xl gap-3">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              canDelete={canDelete}
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
  canDelete,
  onError,
  onDeleted,
}: {
  report: AdminReport;
  canDelete: boolean;
  onError: (message: string | null) => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
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

  /** The learner is deleted through the staff action (reason and email required, recorded), then the report is closed. */
  async function remove() {
    if (!report.reportedId) return;
    onError(null);
    setBusy(true);
    try {
      const result = await staffDeleteUser({
        data: { id: report.reportedId, reason, confirmEmail },
      });
      // The account is gone either way; a failed report close must not read as a failed deletion.
      await adminDismissReport({ data: { reportId: report.id } }).catch(() => undefined);
      if (result.failedSteps.length > 0) {
        onError(
          `Account deleted, but these steps need follow-up (see the action record): ${result.failedSteps.join(", ")}.`,
        );
      }
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <li>
      <ConsoleCard>
        <div className="flex items-center gap-2">
          <KindPill>{KIND_LABEL[report.kind]}</KindPill>
          <span className="ml-auto text-xs font-semibold text-ds-ink-soft">
            {formatDateTime(report.createdAt)}
          </span>
        </div>
        <p className="text-ds-ink">
          <strong>{report.reportedName ?? "No account (AI response)"}</strong> reported by{" "}
          {report.reporterName}
        </p>
        <p className="ds-type-footnote text-ds-ink-soft">{report.reason}</p>
        {report.kind === "ai_response" && typeof report.context?.message === "string" ? (
          <p className="whitespace-pre-wrap rounded-xl border border-ds-line bg-ds-sunk p-2 text-sm text-ds-ink">
            {report.context.message}
          </p>
        ) : null}
        {report.teamId ? (
          <p className="ds-type-footnote text-ds-ink-soft">
            Team:{" "}
            <strong className="text-ds-ink">{report.teamName ?? "(team no longer exists)"}</strong>{" "}
            <span className="text-ds-ink-faint">{report.teamId}</span>
          </p>
        ) : null}
        {report.accountDeletedAt ? (
          <p className="ds-type-footnote text-ds-ink-soft">
            An account on this report was deleted {formatDay(report.accountDeletedAt)}; the report
            is removed 90 days later.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {report.reportedId ? (
            <SmallButton
              onClick={() =>
                act(() => adminResetDisplayName({ data: { reportId: report.id } }), "Reset failed.")
              }
              disabled={busy}
            >
              Reset display name
            </SmallButton>
          ) : null}
          <SmallButton
            onClick={() =>
              act(() => adminDismissReport({ data: { reportId: report.id } }), "Dismiss failed.")
            }
            disabled={busy}
          >
            Dismiss
          </SmallButton>
        </div>

        {report.teamId ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New team name"
                aria-label="New team name"
                maxLength={80}
                className={`${FIELD} flex-1`}
              />
              <SmallButton
                onClick={() =>
                  act(
                    () =>
                      adminRenameTeam({ data: { reportId: report.id, name: newTeamName.trim() } }),
                    "Rename failed.",
                  )
                }
                disabled={busy || newTeamName.trim().length === 0}
              >
                Rename team
              </SmallButton>
            </div>
            {!disbanding ? (
              <div>
                <DangerButton onClick={() => setDisbanding(true)} disabled={busy}>
                  Disband team
                </DangerButton>
              </div>
            ) : (
              <div className="grid gap-2 rounded-xl border border-ds-line p-3">
                <p className="text-xs font-semibold text-ds-wrong-ink">
                  This deletes {report.teamName ?? "the team"} for every member. It cannot be
                  undone. Type DISBAND to confirm.
                </p>
                <input
                  value={disbandText}
                  onChange={(e) => setDisbandText(e.target.value.toUpperCase())}
                  placeholder="DISBAND"
                  aria-label="Type DISBAND"
                  className={FIELD}
                />
                <div className="flex justify-end gap-3">
                  <SmallButton
                    onClick={() => {
                      setDisbanding(false);
                      setDisbandText("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </SmallButton>
                  <SmallButton
                    variant="danger"
                    onClick={() =>
                      act(
                        () => adminDisbandTeam({ data: { reportId: report.id } }),
                        "Disband failed.",
                      )
                    }
                    disabled={disbandText !== "DISBAND" || busy}
                  >
                    {busy ? "Disbanding…" : "Disband forever"}
                  </SmallButton>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {!report.reportedId || !canDelete ? null : !confirming ? (
          <div>
            <DangerButton onClick={() => setConfirming(true)} disabled={busy}>
              Delete this account
            </DangerButton>
          </div>
        ) : (
          <div className="grid gap-2 rounded-xl border border-ds-line p-3">
            <p className="text-xs font-semibold text-ds-wrong-ink">
              This permanently deletes {report.reportedName}&rsquo;s account and all their data. It
              cannot be undone. Give a reason and type the learner&rsquo;s email to confirm (find it
              on{" "}
              <a className="underline" href={`/users/${report.reportedId}`}>
                their page
              </a>
              ).
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (3-500 characters)"
              aria-label="Reason"
              maxLength={500}
              className={FIELD}
            />
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Learner's email"
              aria-label="Learner's email"
              className={FIELD}
            />
            <div className="flex justify-end gap-3">
              <SmallButton
                onClick={() => {
                  setConfirming(false);
                  setConfirmEmail("");
                  setReason("");
                }}
                disabled={busy}
              >
                Cancel
              </SmallButton>
              <SmallButton
                variant="danger"
                onClick={remove}
                disabled={reason.trim().length < 3 || confirmEmail.trim() === "" || busy}
              >
                {busy ? "Deleting…" : "Delete forever"}
              </SmallButton>
            </div>
          </div>
        )}
      </ConsoleCard>
    </li>
  );
}
