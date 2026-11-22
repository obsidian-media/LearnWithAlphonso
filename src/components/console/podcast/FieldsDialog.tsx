import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MIN_REASON } from "../../staff/ReasonDialog";
import { Button } from "../../ui/Button";

/** The shared look of a form field in the podcast dialogs: 44 px tall so a thumb can hit it. */
export const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-ds-ink disabled:opacity-60";

/**
 * A dialog for a podcast change that needs fields AND a reason (a new folder, an episode's title, a replacement audio
 * file ...). The reason is the last field: 3 to 500 characters, kept in the action record, and the confirm button stays
 * off until it and `valid` (the caller's own checks of its fields) both hold. A sheet from the bottom on a phone.
 */
export function FieldsDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  valid,
  busy,
  error,
  children,
  onCancel,
  onSubmit,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Whether the caller's own fields are filled in; the reason is checked here. */
  valid: boolean;
  busy: boolean;
  error: string | null;
  children?: ReactNode;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const live = useRef({ busy, onCancel });
  live.current = { busy, onCancel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !live.current.busy) live.current.onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const ready = valid && reason.trim().length >= MIN_REASON;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit(reason.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ds-ink/40 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg"
      >
        <h2 className="ds-type-title text-ds-ink">{title}</h2>
        {description ? <p className="text-sm text-ds-ink-soft">{description}</p> : null}
        {children}
        <label className="block text-sm">
          <span className="font-semibold text-ds-ink">Reason</span>{" "}
          <span className="text-xs text-ds-ink-faint">(kept in the action record)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={busy}
            className={`${FIELD_CLASS} mt-1`}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
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
            variant={danger ? "danger" : "primary"}
            className="!px-4 !py-2 text-sm"
            disabled={!ready || busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
