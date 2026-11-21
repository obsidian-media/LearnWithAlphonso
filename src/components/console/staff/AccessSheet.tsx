import { useState, type FormEvent } from "react";
import { DEFAULT_SCOPES, type Scope } from "../../../lib/staff-scopes";
import { Button } from "../../ui/Button";
import { ScopePicker } from "./ScopeChips";

export type AccessChoice = { role: "owner" | "support"; scopes: Scope[] };

const SUPPORT_START: readonly Scope[] = DEFAULT_SCOPES.support;

const sameScopes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((s) => b.includes(s));

/**
 * One sheet for "add someone" and "change someone's access": a role (Owner or Support, the real roles) and, for
 * Support, the real scopes as chips. Saving does not write anything: it hands the choice up and the screen asks for the
 * reason before the server is called.
 */
export function AccessSheet({
  mode,
  startRole,
  startScopes,
  name,
  busy,
  onCancel,
  onSubmit,
}: {
  mode: "add" | "edit";
  startRole: "owner" | "support";
  startScopes: readonly Scope[];
  /** Who is being changed (edit mode). */
  name?: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { email: string; role: "owner" | "support"; scopes: Scope[] }) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "support">(startRole);
  // Demoting an owner starts from the standard support scopes (an owner's stored scopes are empty, they have every one).
  const [scopes, setScopes] = useState<Scope[]>(
    startRole === "support" ? [...startScopes] : [...SUPPORT_START],
  );

  const unchanged =
    mode === "edit" && role === startRole && (role === "owner" || sameScopes(scopes, startScopes));
  const ready = mode === "add" ? email.trim().length >= 3 : !unchanged;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit({ email: email.trim(), role, scopes });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "add" ? "Add staff" : "Change access"}
      className="fixed inset-0 z-40 flex items-end justify-center bg-ds-ink/40 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg"
      >
        <h2 className="ds-type-title text-ds-ink">
          {mode === "add" ? "Add staff" : `Change access${name ? ` for ${name}` : ""}`}
        </h2>
        {mode === "add" ? (
          <label className="block text-sm">
            Account email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="their account email"
              className="mt-1 min-h-11 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
            />
            <span className="ds-type-footnote mt-1 block text-ds-ink-soft">
              They must already have an account. There is no invitation: if there is no account with
              that email, they need to sign up first.
            </span>
          </label>
        ) : null}
        <label className="block text-sm">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "support")}
            className="mt-1 min-h-11 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
          >
            <option value="support">Support</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        {role === "support" ? (
          <div className="grid gap-2">
            <p className="text-sm">Scopes</p>
            <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
            <p className="ds-type-footnote text-ds-ink-soft">
              These are exactly what the server allows this person to do. Managing staff is for
              owners only.
            </p>
          </div>
        ) : (
          <p className="ds-type-footnote text-ds-ink-soft">
            An owner can do everything, including managing staff.
          </p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button
            variant="secondary"
            className="!px-4 !py-2 text-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" className="!px-4 !py-2 text-sm" disabled={!ready || busy}>
            {mode === "add" ? "Continue" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
