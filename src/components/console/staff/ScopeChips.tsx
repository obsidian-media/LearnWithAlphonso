import { SCOPES, scopeLabel, type Scope } from "../../../lib/staff-scopes";

/** Scopes a support person can hold. staff.manage belongs to owners only (the server refuses it for anyone else). */
export const GRANTABLE_SCOPES: readonly Scope[] = SCOPES.filter((s) => s !== "staff.manage");

const CHIP = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold";

/** The scopes a person really has, as read-only chips (label from the real key; the key is the tooltip). */
export function ScopeList({ role, scopes }: { role: string; scopes: readonly string[] }) {
  if (role === "owner") {
    return (
      <span className={`${CHIP} bg-ds-choice-tint text-ds-choice`} title="Every scope">
        Every scope
      </span>
    );
  }
  if (scopes.length === 0) {
    return <span className="text-xs font-semibold text-ds-ink-faint">No scopes</span>;
  }
  return (
    <ul aria-label="Scopes" className="flex flex-wrap gap-1.5">
      {scopes.map((s) => (
        <li key={s} title={s} className={`${CHIP} border border-ds-line bg-ds-sunk text-ds-ink`}>
          {scopeLabel(s)}
        </li>
      ))}
    </ul>
  );
}

/** Editable scope chips: one toggle per real grantable scope. */
export function ScopePicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly Scope[];
  onChange: (next: Scope[]) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Scopes" className="flex flex-wrap gap-1.5">
      {GRANTABLE_SCOPES.map((scope) => {
        const on = value.includes(scope);
        return (
          <button
            key={scope}
            type="button"
            aria-pressed={on}
            title={scope}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((s) => s !== scope) : [...value, scope])}
            className={`${CHIP} min-h-9 border transition-colors disabled:opacity-50 ${
              on
                ? "border-ds-choice bg-ds-choice-tint text-ds-choice"
                : "border-ds-line bg-ds-card text-ds-ink-soft"
            }`}
          >
            {scopeLabel(scope)}
          </button>
        );
      })}
    </div>
  );
}
