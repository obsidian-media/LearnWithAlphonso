import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";

/** The shortest reason the server accepts (staff-audit.server validateReason); the dialog enforces it first. */
export const MIN_REASON = 3;

/**
 * A reason-only dialog, the same box and behaviour as the learner page's ActionDialog (centred on desktop, a sheet on
 * a phone): 3 to 500 characters, kept in the action record, Cancel and a confirm button that stays off until valid.
 */
export function ReasonDialog({
  title,
  confirmLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= MIN_REASON;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit(reason.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ds-ink/40 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg"
      >
        <h2 className="ds-type-title text-ds-ink">{title}</h2>
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
          <Button type="submit" className="!px-4 !py-2 text-sm" disabled={!ready || busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
