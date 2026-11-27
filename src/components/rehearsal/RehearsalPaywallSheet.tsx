import { useState } from "react";
import { paywallSummary } from "@/lib/rehearsal-copy";
import type { EventKind } from "@/lib/rehearsal-rules";
import { Modal } from "../Modal";
import { WebPaywallSheet } from "../WebPaywall";

/**
 * What a non-Pro learner sees at "Rehearse a real conversation" once their free rehearsal is used: a bottom sheet that
 * names exactly what they already did and what stays free, with two equal ways out. "See Pro" opens the existing Pro
 * paywall (the same purchase flow as everywhere); the store shows the price, never this sheet.
 */
export function RehearsalPaywallSheet({
  done,
  onClose,
}: {
  done: { eventKind: EventKind; runs: number; stagesDone: number; corrections: number } | null;
  onClose: () => void;
}) {
  const [pro, setPro] = useState(false);

  if (pro) return <WebPaywallSheet source="rehearsal_entry" onClose={onClose} />;
  return (
    <Modal
      labelledBy="rehearsal-pro-title"
      onEscape={onClose}
      onBackdrop={onClose}
      className="w-full max-w-md rounded-t-3xl bg-ds-surface px-5 pb-8 pt-6 sm:rounded-3xl"
    >
      <div>
        <h2
          id="rehearsal-pro-title"
          className="font-display ds-type-title font-semibold text-ds-ink"
        >
          Rehearsals are part of Pro
        </h2>
        <p className="mt-1 ds-type-headline font-semibold text-ds-ink">
          You have used your free rehearsal
        </p>
        <p className="mt-2 ds-type-footnote text-ds-ink-soft">{paywallSummary(done)}</p>
        <ul className="mt-3 flex flex-col gap-1.5 ds-type-footnote text-ds-ink">
          <li>Your plan and run history stay readable.</li>
          <li>Recaps and Alphonso&apos;s memory stay free.</li>
        </ul>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setPro(true)}
            className="flex-1 rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card"
          >
            See Pro
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-ds-line px-5 py-3 font-semibold text-ds-ink"
          >
            Not now
          </button>
        </div>
        <p className="mt-3 ds-type-caption text-ds-ink-soft">
          The price is shown by the store before you pay. You can cancel any time in your store
          settings.
        </p>
      </div>
    </Modal>
  );
}
