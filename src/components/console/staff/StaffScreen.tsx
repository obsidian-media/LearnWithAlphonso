import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "../../../lib/staff-dates";
import { DEFAULT_SCOPES, type Scope } from "../../../lib/staff-scopes";
import { Button } from "../../ui/Button";
import { ReasonDialog } from "../../staff/ReasonDialog";
import { Figure } from "../Figure";
import { AccessSheet } from "./AccessSheet";
import { GRANTABLE_SCOPES, ScopeList } from "./ScopeChips";
import type { StaffApi, StaffRow } from "./staffApi";

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const ROLE_WORD: Record<string, string> = {
  owner: "Owner",
  support: "Support",
  support_ai: "AI (not a login)",
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: StaffRow[] };

/** What is waiting for its reason: the dialog asks, then the server is called. */
type Pending =
  | {
      kind: "add";
      email: string;
      role: "owner" | "support";
      scopes: Scope[];
    }
  | {
      kind: "edit";
      row: StaffRow;
      role: "owner" | "support";
      scopes: Scope[];
    }
  | { kind: "suspend"; row: StaffRow }
  | { kind: "reactivate"; row: StaffRow };

function pendingCopy(p: Pending): { title: string; description: string; confirm: string } {
  switch (p.kind) {
    case "add":
      return {
        title: "Reason for adding this person",
        description: `Adds ${p.email} as ${ROLE_WORD[p.role]}. Kept in the action record.`,
        confirm: "Add staff",
      };
    case "edit":
      return {
        title: "Reason for this change",
        description: `Changes the access of ${p.row.displayName ?? p.row.email ?? "this person"}. The old and new access are kept in the action record.`,
        confirm: "Save change",
      };
    case "suspend":
      return {
        title: "Reason for suspending",
        description: `${p.row.displayName ?? p.row.email ?? "This person"} will no longer be able to use the console. You can reactivate them later.`,
        confirm: "Suspend",
      };
    case "reactivate":
      return {
        title: "Reason for reactivating",
        description: `${p.row.displayName ?? p.row.email ?? "This person"} will be able to use the console again, with the access they had.`,
        confirm: "Reactivate",
      };
  }
}

/**
 * Staff: who can use the console and what each person may do. Owner only, enforced on the server (the screen only
 * hides). The role is the REAL role, Owner or Support, and Support's scopes are the real scopes as chips: what the
 * screen shows is what the server enforces. There are no invented presets, no pending invitations (a person must
 * already have an account) and no remove: Suspend is the reversible equivalent. Every change asks for a reason first.
 */
export function StaffScreen({ myId, api }: { myId: string; api: StaffApi }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [sheet, setSheet] = useState<{ mode: "add" } | { mode: "edit"; row: StaffRow } | null>(
    null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
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
        setLoad({ status: "error", message: messageOf(e, "Could not read the staff list.") });
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  async function confirm(reason: string) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      let done: string;
      switch (pending.kind) {
        case "add":
          await api.add({
            email: pending.email,
            role: pending.role,
            ...(pending.role === "support" ? { scopes: pending.scopes } : {}),
            reason,
          });
          done = "Added.";
          break;
        case "edit": {
          const row = pending.row;
          const roleChanged = pending.role !== row.role;
          await api.update({
            userId: row.userId,
            ...(roleChanged ? { role: pending.role } : {}),
            ...(pending.role === "support" ? { scopes: pending.scopes } : {}),
            reason,
          });
          done = "Access changed.";
          break;
        }
        case "suspend":
          await api.update({ userId: pending.row.userId, disabled: true, reason });
          done = "Suspended.";
          break;
        case "reactivate":
          await api.update({ userId: pending.row.userId, disabled: false, reason });
          done = "Reactivated.";
          break;
      }
      setPending(null);
      setSheet(null);
      setNotice(done);
      await reload(true);
    } catch (e) {
      setError(messageOf(e, "That did not work. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  function closeReason() {
    setPending(null);
    setError(null);
  }

  const rows = load.status === "ready" ? load.rows : [];
  const copy = pending ? pendingCopy(pending) : null;

  return (
    <main className="mx-auto max-w-[84rem] p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
            System ·{" "}
            <Figure
              value={load.status === "ready" ? rows.length : null}
              reason={load.status === "loading" ? "Loading" : "Could not read"}
            />{" "}
            {load.status === "ready" && rows.length === 1 ? "member" : "members"}
          </p>
          <h1 className="font-display text-2xl font-semibold text-ds-ink">Staff</h1>
          <p className="mt-1 max-w-2xl text-sm text-ds-ink-soft">
            Each person uses their own account and signs in with a second factor. Owners can do
            everything; Support can do only the scopes shown.
          </p>
        </div>
        <Button
          className="!px-4 !py-2 text-sm"
          disabled={load.status !== "ready"}
          onClick={() => {
            setNotice(null);
            setSheet({ mode: "add" });
          }}
        >
          Add staff
        </Button>
      </div>

      {notice ? (
        <p role="status" className="mt-3 text-sm font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}
      {load.status === "loading" ? (
        <p role="status" className="mt-6 text-sm font-semibold text-ds-ink-faint">
          Loading staff…
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

      {load.status === "ready" ? (
        <ul
          aria-label="Staff"
          className="mt-5 divide-y divide-ds-line overflow-hidden rounded-2xl border border-ds-line bg-ds-card"
        >
          {rows.map((r) => {
            const mine = r.userId === myId;
            const isLogin = r.role === "owner" || r.role === "support";
            return (
              <li
                key={r.userId}
                data-staff-row=""
                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ds-ink">
                    {r.displayName ?? r.email ?? r.userId}
                    {mine ? <span className="font-semibold text-ds-ink-soft"> (you)</span> : null}
                  </p>
                  {r.displayName && r.email ? (
                    <p className="break-all text-sm text-ds-ink-soft">{r.email}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-block rounded-full bg-ds-sunk px-2 py-0.5 text-xs font-bold text-ds-ink">
                      {ROLE_WORD[r.role] ?? r.role}
                    </span>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.disabled
                          ? "bg-ds-flame-tint text-ds-flame"
                          : "bg-ds-right-tint text-ds-right-ink"
                      }`}
                    >
                      {r.disabled ? "Suspended" : "Active"}
                    </span>
                  </p>
                </div>
                <div className="min-w-0">
                  <ScopeList role={r.role} scopes={r.scopes} />
                </div>
                <p className="text-sm text-ds-ink-soft">
                  <span className="block text-xs font-bold uppercase tracking-wider">
                    Last sign-in
                  </span>
                  {r.lastSignInAt ? formatDateTime(r.lastSignInAt) : "Never signed in"}
                </p>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {mine ? (
                    <span className="text-xs font-semibold text-ds-ink-faint">
                      You cannot change your own access
                    </span>
                  ) : isLogin ? (
                    <>
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5 text-sm"
                        disabled={busy}
                        aria-label={`Change access for ${r.displayName ?? r.email ?? "this person"}`}
                        onClick={() => {
                          setNotice(null);
                          setSheet({ mode: "edit", row: r });
                        }}
                      >
                        Change access
                      </Button>
                      <Button
                        variant={r.disabled ? "secondary" : "danger"}
                        className="!px-3 !py-1.5 text-sm"
                        disabled={busy}
                        aria-label={`${r.disabled ? "Reactivate" : "Suspend"} ${r.displayName ?? r.email ?? "this person"}`}
                        onClick={() => {
                          setNotice(null);
                          setPending({ kind: r.disabled ? "reactivate" : "suspend", row: r });
                        }}
                      >
                        {r.disabled ? "Reactivate" : "Suspend"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {sheet ? (
        <AccessSheet
          mode={sheet.mode}
          startRole={sheet.mode === "edit" && sheet.row.role === "owner" ? "owner" : "support"}
          startScopes={
            sheet.mode === "edit"
              ? sheet.row.scopes.filter((x): x is Scope =>
                  (GRANTABLE_SCOPES as readonly string[]).includes(x),
                )
              : [...DEFAULT_SCOPES.support]
          }
          name={
            sheet.mode === "edit"
              ? (sheet.row.displayName ?? sheet.row.email ?? undefined)
              : undefined
          }
          busy={busy}
          covered={pending !== null}
          onCancel={() => setSheet(null)}
          onSubmit={({ email, role, scopes }) =>
            setPending(
              sheet.mode === "add"
                ? { kind: "add", email, role, scopes }
                : { kind: "edit", row: sheet.row, role, scopes },
            )
          }
        />
      ) : null}
      {pending && copy ? (
        <ReasonDialog
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          busy={busy}
          error={error}
          onCancel={closeReason}
          onSubmit={(reason) => void confirm(reason)}
        />
      ) : null}
    </main>
  );
}
