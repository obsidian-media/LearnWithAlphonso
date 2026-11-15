import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { SCOPES, type Scope } from "../../lib/staff-scopes";
import { ConsoleCard } from "./ConsoleCard";
import { ReasonDialog } from "./ReasonDialog";

export type StaffRow = {
  userId: string;
  displayName: string | null;
  role: string;
  scopes: string[];
  disabled: boolean;
  addedAt: string;
};

/** Scopes a non-owner can hold (staff.manage never belongs to anyone but an owner). */
const GRANTABLE = SCOPES.filter((s) => s !== "staff.manage");

type Pending =
  { kind: "toggle"; row: StaffRow } | { kind: "scopes"; row: StaffRow; scopes: Scope[] };

function pendingTitle(p: Pending): string {
  if (p.kind === "scopes") return "Reason for this change";
  return p.row.disabled ? "Reason for enabling" : "Reason for disabling";
}

function pendingLabel(p: Pending): string {
  if (p.kind === "scopes") return "Save change";
  return p.row.disabled ? "Enable" : "Disable";
}

/** Who is staff and what each person may do. The owner's own row is read-only: nobody edits their own access. */
export function StaffView({
  rows,
  myId,
  error,
  busy,
  onAdd,
  onUpdate,
}: {
  rows: StaffRow[];
  myId: string;
  error: string | null;
  busy: boolean;
  onAdd: (input: { email: string; role: "owner" | "support"; reason: string }) => void;
  onUpdate: (input: {
    userId: string;
    scopes?: Scope[];
    disabled?: boolean;
    reason: string;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "support">("support");
  const [reason, setReason] = useState("");
  // The change waiting for its reason: the dialog replaces the browser prompt box.
  const [pending, setPending] = useState<Pending | null>(null);

  function confirmPending(why: string) {
    if (!pending) return;
    if (pending.kind === "toggle") {
      onUpdate({ userId: pending.row.userId, disabled: !pending.row.disabled, reason: why });
    } else {
      onUpdate({ userId: pending.row.userId, scopes: pending.scopes, reason: why });
    }
    setPending(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() && reason.trim().length >= 3) onAdd({ email: email.trim(), role, reason });
  }

  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Staff</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Each person uses their own staff account (not a learner account) and signs in with a second
        factor. support_ai is a label in the action record, not a login.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      <ul className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.userId} className="rounded-2xl border border-ds-line bg-ds-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ds-ink">
                  {r.displayName ?? r.userId}{" "}
                  <span className="text-sm text-ds-ink-soft">
                    · {r.role}
                    {r.userId === myId ? " (you)" : ""}
                    {r.disabled ? " · disabled" : ""}
                  </span>
                </p>
                <p className="text-xs text-ds-ink-soft">
                  added {new Date(r.addedAt).toLocaleDateString()}
                </p>
              </div>
              {r.userId !== myId ? (
                <Button
                  variant="secondary"
                  className="!px-4 !py-2 text-sm"
                  disabled={busy}
                  onClick={() => setPending({ kind: "toggle", row: r })}
                >
                  {r.disabled ? "Enable" : "Disable"}
                </Button>
              ) : null}
            </div>
            {r.role === "support" && r.userId !== myId ? (
              <fieldset className="mt-3">
                <legend className="text-xs uppercase tracking-wider text-ds-ink-soft">
                  Scopes
                </legend>
                <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {GRANTABLE.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-sm text-ds-ink">
                      <input
                        type="checkbox"
                        className="size-4 accent-ds-choice"
                        checked={r.scopes.includes(scope)}
                        disabled={busy}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...r.scopes, scope]
                            : r.scopes.filter((s) => s !== scope);
                          setPending({ kind: "scopes", row: r, scopes: next as Scope[] });
                        }}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </li>
        ))}
      </ul>

      <ConsoleCard title="Add someone" className="mt-4">
        <p className="ds-type-footnote text-ds-ink-soft">
          They must already have an account; found by exact email.
        </p>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Staff email"
            placeholder="their account email"
            className="min-h-11 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "support")}
            aria-label="Role"
            className="min-h-11 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
          >
            <option value="support">support</option>
            <option value="owner">owner</option>
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason"
            placeholder="Reason (3 to 500 characters)"
            maxLength={500}
            className="min-h-11 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={busy || !email.trim() || reason.trim().length < 3}
              className="!py-2"
            >
              Add
            </Button>
          </div>
        </form>
      </ConsoleCard>
      {pending ? (
        <ReasonDialog
          title={pendingTitle(pending)}
          confirmLabel={pendingLabel(pending)}
          busy={busy}
          error={error}
          onCancel={() => setPending(null)}
          onSubmit={confirmPending}
        />
      ) : null}
    </section>
  );
}
