import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { ACTION_LABEL, NEEDS_EMAIL, type UserAction } from "../../lib/staff-actions";

export type ActionInput = { reason: string; confirmEmail: string; days: number };

const WARNING: Partial<Record<UserAction, string>> = {
  ban: "The learner is signed out everywhere and cannot sign in until the ban is lifted.",
  delete: "This permanently deletes the account and all its data. It cannot be undone.",
  block: "The learner keeps learning but loses friends, leagues, duels, buddies and teams.",
};

/**
 * Every write asks for a reason; ban and delete also need the learner's email typed back, and a gift needs its length.
 * The server validates all of it again.
 */
export function ActionDialog({
  action,
  learnerLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  action: UserAction;
  learnerLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: ActionInput) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [days, setDays] = useState(30);
  const needsEmail = NEEDS_EMAIL.includes(action);
  const ready =
    reason.trim().length >= 3 &&
    (!needsEmail || confirmEmail.trim() !== "") &&
    (action !== "gift" || (Number.isInteger(days) && days >= 1 && days <= 365));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit({ reason, confirmEmail, days });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ACTION_LABEL[action]}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ds-ink/40 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg"
      >
        <h2 className="ds-type-title text-ds-ink">
          {ACTION_LABEL[action]}: {learnerLabel}
        </h2>
        {WARNING[action] ? (
          <p className="ds-type-footnote text-ds-ink-soft">{WARNING[action]}</p>
        ) : null}
        {action === "gift" ? (
          <label className="block text-sm">
            Days of Pro (1 to 365)
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
            />
          </label>
        ) : null}
        <label className="block text-sm">
          Reason (3 to 500 characters, kept in the action record)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
          />
        </label>
        {needsEmail ? (
          <label className="block text-sm">
            Type the learner&rsquo;s email to confirm
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
            />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-ember">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <Button
            variant="secondary"
            className="!px-4 !py-2 text-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={action === "delete" || action === "ban" ? "ember" : "primary"}
            className="!px-4 !py-2 text-sm"
            disabled={!ready || busy}
          >
            {busy ? "Working…" : ACTION_LABEL[action]}
          </Button>
        </div>
      </form>
    </div>
  );
}
