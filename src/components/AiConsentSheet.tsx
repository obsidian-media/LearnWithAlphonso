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
      className="relative w-full max-w-md rounded-t-3xl bg-ds-card p-6 outline-none sm:rounded-3xl"
    >
      <h2 id="ai-consent-title" className="text-center font-display ds-type-title text-ds-ink">
        {AI_CONSENT_COPY.sheetTitle}
      </h2>
      <p id="ai-consent-body" className="mt-3 text-center text-sm text-ds-ink-soft">
        {AI_CONSENT_COPY.sheetBody}
      </p>
      <p className="mt-3 text-center">
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-ds-brand underline"
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
        className="mt-5 w-full rounded-2xl bg-ds-brand px-4 py-3.5 text-base font-semibold text-ds-card disabled:opacity-60"
      >
        {saving ? "Saving…" : AI_CONSENT_COPY.allow}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={saving}
        className="mt-2 w-full px-4 py-3 text-sm font-medium text-ds-ink-soft"
      >
        {AI_CONSENT_COPY.notNow}
      </button>
    </Modal>
  );
}
