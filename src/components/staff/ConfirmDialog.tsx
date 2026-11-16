import { Button } from "../ui/Button";

/** A yes/no box for an action that cannot be undone: same frame as the reason dialog (a sheet on a phone). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ds-ink/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md space-y-3 rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg">
        <h2 className="ds-type-title text-ds-ink">{title}</h2>
        <p className="ds-type-footnote text-ds-ink-soft">{body}</p>
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
            variant="danger"
            className="!px-4 !py-2 text-sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
