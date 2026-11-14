import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { DsButton } from "./ds/Blocks";
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
      className="relative grid max-h-[92dvh] w-full max-w-[430px] justify-items-center gap-2.5 overflow-y-auto rounded-t-[28px] bg-ds-surface px-5 pb-6 pt-5 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <img
        src="/mascots/alphonso.png"
        alt=""
        height={110}
        decoding="async"
        draggable={false}
        className="h-[110px] w-auto"
      />
      <h2 id="ai-consent-title" className="ds-type-title text-center text-ds-ink">
        {AI_CONSENT_COPY.sheetTitle}
      </h2>
      <p id="ai-consent-body" className="ds-type-footnote text-left text-ds-ink-soft">
        {AI_CONSENT_COPY.sheetBody}
      </p>
      <a
        href="/privacy"
        target="_blank"
        rel="noreferrer"
        className="ds-type-footnote font-extrabold text-ds-choice underline"
      >
        {AI_CONSENT_COPY.privacyLink}
      </a>
      {error && (
        <p role="alert" className="ds-type-footnote text-center font-bold text-ds-wrong-ink">
          {error}
        </p>
      )}
      <div className="grid w-full gap-2.5">
        <DsButton full onClick={onAllow} disabled={saving}>
          {saving ? "Saving…" : AI_CONSENT_COPY.allow}
        </DsButton>
        <DsButton full variant="secondary" onClick={onDecline} disabled={saving}>
          {AI_CONSENT_COPY.notNow}
        </DsButton>
      </div>
    </Modal>
  );
}
