import { useEffect, useRef, useState } from "react";
import { formatDateTime, formatDay } from "../../../lib/staff-dates";
import { reportActions } from "../../../lib/report-actions";
import { ActionDialog, type ActionInput } from "../../staff/ActionDialog";
import { ReasonDialog } from "../../staff/ReasonDialog";
import { Button } from "../../ui/Button";
import { Figure } from "../Figure";
import type { ReportRow, ReportsApi } from "./reportsApi";

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const KIND_LABEL: Record<ReportRow["kind"], string> = {
  user: "Learner",
  team_name: "Team name",
  ai_response: "AI response",
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: ReportRow[] };

/** What is waiting for its reason (or its typed email): the dialog asks, then the server is called. */
type Pending =
  | { kind: "dismiss" }
  | { kind: "reset_name" }
  | { kind: "rename_team"; name: string }
  | { kind: "disband_team" }
  | { kind: "ban" }
  | { kind: "delete" };

/** What the report is about: the team for a team-name report, the learner for a learner report, else the AI answer. */
const reportedLabel = (r: ReportRow) =>
  r.kind === "ai_response"
    ? "AI response"
    : r.kind === "team_name"
      ? (r.teamName ?? "(team no longer exists)")
      : (r.reportedName ?? "(deleted account)");

function reasonCopy(
  p: Exclude<Pending, { kind: "ban" } | { kind: "delete" }>,
  r: ReportRow,
): { title: string; description: string; confirm: string } {
  const who = reportedLabel(r);
  switch (p.kind) {
    case "dismiss":
      return {
        title: "Reason for dismissing",
        description:
          "No action is needed. The report is removed from this list and the reason is kept in the action record.",
        confirm: "Dismiss report",
      };
    case "reset_name":
      return {
        title: "Reason for resetting the name",
        description: `${who} gets a fresh Learner-XXXX name and is asked to choose again. The report is then closed.`,
        confirm: "Reset name",
      };
    case "rename_team":
      return {
        title: "Reason for renaming the team",
        description: `Renames ${r.teamName ?? "the team"} to “${p.name}”. The report is then closed.`,
        confirm: "Rename team",
      };
    case "disband_team":
      return {
        title: "Reason for disbanding the team",
        description: `Deletes ${r.teamName ?? "the team"} for every member. It cannot be undone. The report is then closed.`,
        confirm: "Disband forever",
      };
  }
}

/**
 * Reports: what learners reported (a person, a team name, an AI answer) and what to do about it. OPEN reports only: a
 * handled report is deleted, so there is no Resolved list; what was done and why stays in the Audit record. Every
 * action asks for a reason first, and the server and the database each refuse one without. What can be done depends on
 * the kind of report (see reportActions), and ban and delete keep their own scopes and a typed-email confirmation.
 */
export function ReportsScreen({ api, scopes }: { api: ReportsApi; scopes: readonly string[] }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [newName, setNewName] = useState("");
  const [disbandText, setDisbandText] = useState("");
  const [disbanding, setDisbanding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  async function reload(keepRows = false) {
    const mine = ++seq.current;
    if (!keepRows) setLoad({ status: "loading" });
    try {
      const rows = await api.list();
      if (mine === seq.current) setLoad({ status: "ready", rows });
    } catch (e) {
      if (mine === seq.current)
        setLoad({ status: "error", message: messageOf(e, "Could not read the reports.") });
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  const rows = load.status === "ready" ? load.rows : [];
  const open = rows.find((r) => r.id === openId) ?? null;

  function resetDrawerState() {
    setPending(null);
    setError(null);
    setNewName("");
    setDisbanding(false);
    setDisbandText("");
  }
  function closeDrawer() {
    setOpenId(null);
    resetDrawerState();
  }
  function choose(id: string) {
    setNotice(null);
    resetDrawerState();
    setOpenId(id);
  }
  useEffect(() => {
    if (!open || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeDrawer only calls state setters
  }, [open, pending]);

  async function finish(done: string) {
    setNotice(done);
    closeDrawer();
    await reload(true);
  }

  async function confirm(reason: string) {
    if (!open || !pending) return;
    setBusy(true);
    setError(null);
    try {
      switch (pending.kind) {
        case "dismiss":
          await api.dismiss(open.id, reason);
          await finish("Dismissed.");
          return;
        case "reset_name":
          await api.resetName(open.id, reason);
          await finish("Display name reset. The report is closed.");
          return;
        case "rename_team":
          await api.renameTeam(open.id, pending.name, reason);
          await finish("Team renamed. The report is closed.");
          return;
        case "disband_team":
          await api.disbandTeam(open.id, reason);
          await finish("Team disbanded. The report is closed.");
          return;
        default:
          return;
      }
    } catch (e) {
      setError(messageOf(e, "That did not work. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  /** Ban and delete: reason plus the learner's email typed back. Delete then dismisses the report with the same reason. */
  async function confirmAccount(input: ActionInput) {
    if (!open || !open.reportedId || !pending) return;
    const id = open.reportedId;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "ban") {
        await api.ban(id, input.reason, input.confirmEmail);
        setNotice("Banned. The report is still open: dismiss it when you are done.");
        setPending(null);
        return;
      }
      const result = (await api.deleteUser(id, input.reason, input.confirmEmail)) as
        { failedSteps?: string[] } | undefined;
      // The account is gone either way; a failed report close must not read as a failed deletion.
      let closed = true;
      await api.dismiss(open.id, input.reason).catch(() => {
        closed = false;
      });
      const failed = result?.failedSteps ?? [];
      const parts = ["Account deleted."];
      if (!closed) parts.push("The report could not be closed: dismiss it from the list.");
      if (failed.length > 0)
        parts.push(`These steps need follow-up (see the action record): ${failed.join(", ")}.`);
      await finish(parts.join(" "));
    } catch (e) {
      setError(messageOf(e, "That did not work. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  const actions = open ? reportActions(open, scopes) : [];
  const accountPending = pending?.kind === "ban" || pending?.kind === "delete";
  const copy = pending && open && !accountPending ? reasonCopy(pending, open) : null;

  return (
    <main className="mx-auto max-w-[84rem] p-4 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        Operate ·{" "}
        <Figure
          value={load.status === "ready" ? rows.length : null}
          reason={load.status === "loading" ? "Loading" : "Could not read"}
        />{" "}
        open
      </p>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Reports</h1>
      <p className="mt-1 max-w-2xl text-sm text-ds-ink-soft">
        Reports from learners about a person, a team name or an AI answer. A handled report is
        removed from this list; what was done and why stays in the Audit record.
      </p>

      {notice ? (
        <p role="status" className="mt-3 text-sm font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}
      {load.status === "loading" ? (
        <p role="status" className="mt-6 text-sm font-semibold text-ds-ink-faint">
          Loading reports…
        </p>
      ) : null}
      {load.status === "error" ? (
        <div className="mt-6 grid gap-2">
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {load.message}
          </p>
          <div>
            <Button
              variant="secondary"
              className="!px-4 !py-2 text-sm"
              onClick={() => void reload()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}
      {load.status === "ready" && rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ds-line bg-ds-card p-6 text-sm font-semibold text-ds-ink-soft">
          No open reports.
        </p>
      ) : null}

      {load.status === "ready" && rows.length > 0 ? (
        <ul
          aria-label="Open reports"
          className="mt-5 divide-y divide-ds-line overflow-hidden rounded-2xl border border-ds-line bg-ds-card"
        >
          {rows.map((r) => (
            <li key={r.id} data-report-row="">
              <button
                type="button"
                onClick={() => choose(r.id)}
                aria-label={`Open the report about ${reportedLabel(r)}`}
                className="grid min-h-11 w-full gap-1 p-4 text-left md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,2fr)_auto] md:items-center md:gap-4"
              >
                <span className="min-w-0 font-bold text-ds-ink">
                  {reportedLabel(r)}
                  {r.repeatCount !== null && r.repeatCount > 1 ? (
                    <span
                      data-repeat=""
                      className="ml-2 rounded-full bg-ds-flame-tint px-2 py-0.5 text-xs font-bold text-ds-flame"
                    >
                      ×<Figure value={r.repeatCount} reason="" />
                    </span>
                  ) : null}
                </span>
                <span>
                  <span className="inline-block rounded-full bg-ds-sunk px-2 py-0.5 text-xs font-bold text-ds-ink">
                    {KIND_LABEL[r.kind]}
                  </span>
                </span>
                <span className="min-w-0 truncate text-sm text-ds-ink-soft">{r.reason}</span>
                <span className="text-xs font-semibold text-ds-ink-faint">
                  {formatDateTime(r.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report"
          aria-hidden={pending ? true : undefined}
          inert={pending !== null}
          className="fixed inset-0 z-40 flex justify-end bg-ds-ink/40"
        >
          <section className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-ds-line bg-ds-card p-5 sm:max-w-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  {KIND_LABEL[open.kind]} report
                </p>
                <h2 className="ds-type-title break-words text-ds-ink">{reportedLabel(open)}</h2>
              </div>
              <Button
                variant="secondary"
                className="!px-3 !py-1.5 text-sm"
                onClick={closeDrawer}
                disabled={busy}
              >
                Close
              </Button>
            </div>

            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  Reason
                </dt>
                <dd className="text-ds-ink">{open.reason}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  Reported by
                </dt>
                <dd className="text-ds-ink">{open.reporterName}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  When
                </dt>
                <dd className="text-ds-ink">{formatDateTime(open.createdAt)}</dd>
              </div>
              {open.repeatCount !== null && open.repeatCount > 1 ? (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                    Open reports about this {open.kind === "team_name" ? "team" : "learner"}
                  </dt>
                  <dd className="text-ds-ink">
                    <Figure value={open.repeatCount} reason="Could not read" />
                  </dd>
                </div>
              ) : null}
              {open.teamId ? (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                    Team
                  </dt>
                  <dd className="text-ds-ink">{open.teamName ?? "(team no longer exists)"}</dd>
                </div>
              ) : null}
            </dl>

            {open.kind === "ai_response" && typeof open.context?.message === "string" ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  The AI answer that was reported
                </p>
                <p
                  data-ai-context=""
                  className="mt-1 whitespace-pre-wrap rounded-xl border border-ds-line bg-ds-sunk p-3 text-sm text-ds-ink"
                >
                  {open.context.message}
                </p>
              </div>
            ) : null}

            {open.accountDeletedAt ? (
              <p className="text-sm text-ds-ink-soft">
                An account on this report was deleted {formatDay(open.accountDeletedAt)}; the report
                is removed 90 days later.
              </p>
            ) : null}

            {open.reportedId ? (
              <a
                href={`/users?u=${open.reportedId}`}
                className="text-sm font-semibold text-ds-ink underline"
              >
                Open this learner (their email is needed to ban or delete)
              </a>
            ) : null}

            <div className="grid gap-3 border-t border-ds-line pt-4">
              {actions.includes("rename_team") ? (
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New team name"
                    aria-label="New team name"
                    maxLength={80}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
                  />
                  <Button
                    variant="secondary"
                    className="!px-3 !py-1.5 text-sm"
                    disabled={busy || newName.trim().length === 0}
                    onClick={() => setPending({ kind: "rename_team", name: newName.trim() })}
                  >
                    Rename team
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {actions.includes("reset_name") ? (
                  <Button
                    variant="secondary"
                    className="!px-3 !py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => setPending({ kind: "reset_name" })}
                  >
                    Reset display name
                  </Button>
                ) : null}
                {actions.includes("ban") ? (
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => setPending({ kind: "ban" })}
                  >
                    Ban author
                  </Button>
                ) : null}
                {actions.includes("delete") ? (
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => setPending({ kind: "delete" })}
                  >
                    Delete account
                  </Button>
                ) : null}
                {actions.includes("disband_team") && !disbanding ? (
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => setDisbanding(true)}
                  >
                    Disband team
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5 text-sm"
                  disabled={busy}
                  onClick={() => setPending({ kind: "dismiss" })}
                >
                  Dismiss
                </Button>
              </div>
              {disbanding ? (
                <div className="grid gap-2 rounded-xl border border-ds-line p-3">
                  <p className="text-xs font-semibold text-ds-wrong-ink">
                    This deletes {open.teamName ?? "the team"} for every member. It cannot be
                    undone. Type DISBAND to confirm.
                  </p>
                  <input
                    value={disbandText}
                    onChange={(e) => setDisbandText(e.target.value.toUpperCase())}
                    placeholder="DISBAND"
                    aria-label="Type DISBAND"
                    autoComplete="off"
                    className="min-h-11 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
                  />
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 text-sm"
                      onClick={() => {
                        setDisbanding(false);
                        setDisbandText("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-sm"
                      disabled={disbandText !== "DISBAND" || busy}
                      onClick={() => setPending({ kind: "disband_team" })}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {pending && copy ? (
        <ReasonDialog
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          busy={busy}
          error={error}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          onSubmit={(reason) => void confirm(reason)}
        />
      ) : null}
      {open && pending && accountPending ? (
        <ActionDialog
          action={pending.kind === "ban" ? "ban" : "delete"}
          learnerLabel={reportedLabel(open)}
          busy={busy}
          error={error}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          onSubmit={(input) => void confirmAccount(input)}
        />
      ) : null}
    </main>
  );
}
