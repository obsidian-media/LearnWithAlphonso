import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { Modal } from "./Modal";

/** An explicit choice: no backdrop dismiss and no Escape, both buttons are answers (same rule as iOS). */
export function AiConsentSheet({
  open,
  saving,
  error,
  onAllow,
  onDecline,
}: {
  open: boolean;
  saving: boolean;
  error: string | null;
  onAllow: () => void;
  onDecline: () => void;
}) {
  if (!open) return null;
  return (
    <Modal
      labelledBy="ai-consent-title"
      describedBy="ai-consent-body"
      className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 outline-none sm:rounded-3xl"
    >
      <h2
        id="ai-consent-title"
        className="text-center font-display text-[22px] font-semibold text-ink"
      >
        {AI_CONSENT_COPY.sheetTitle}
      </h2>
      <p id="ai-consent-body" className="mt-3 text-center text-sm text-ink-soft">
        {AI_CONSENT_COPY.sheetBody}
      </p>
      <p className="mt-3 text-center">
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-moss underline"
        >
          {AI_CONSENT_COPY.privacyLink}
        </a>
      </p>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-rose-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onAllow}
        disabled={saving}
        className="mt-5 w-full rounded-2xl bg-moss px-4 py-3.5 text-base font-semibold text-surface disabled:opacity-60"
      >
        {saving ? "Saving…" : AI_CONSENT_COPY.allow}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={saving}
        className="mt-2 w-full px-4 py-3 text-sm font-medium text-ink-soft"
      >
        {AI_CONSENT_COPY.notNow}
      </button>
    </Modal>
  );
}
