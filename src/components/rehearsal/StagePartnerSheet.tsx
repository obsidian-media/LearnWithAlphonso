import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AiLabel } from "@/components/AiLabel";
import { STAGE_LABELS, type Stage } from "@/lib/rehearsal-rules";
import { Modal } from "../Modal";
import { WebPaywallSheet } from "../WebPaywall";

/**
 * The partner, chosen at the start of EACH stage (the owner's pick 5B). Alphonso is the main button for everyone: the
 * free rehearsal is always with him, at the normal level. Hector is the second choice. A learner who is not Pro sees a
 * Pro badge on him, and choosing him opens the existing Pro paywall (never a refusal after the call has started). On the
 * last stage a Hector run can also be a hard mode: faster, with interruptions and surprise questions, still inside the
 * brief and still kind. Both are AI, and the sheet says so.
 *
 * `hectorAvailable` is the server's answer: true is Pro, false is not, null is "could not tell", which lets the learner
 * try (the run's own start checks Pro once, and a refusal there explains itself).
 */
export function StagePartnerSheet({
  rehearsalId,
  stage,
  hectorAvailable,
  onClose,
}: {
  rehearsalId: string;
  stage: Stage;
  hectorAvailable: boolean | null;
  onClose: () => void;
}) {
  const [paywall, setPaywall] = useState(false);
  const [hard, setHard] = useState(false);
  const isPro = hectorAvailable !== false;
  const hardAvailable = stage === "hard_moments";

  if (paywall) return <WebPaywallSheet source="rehearsal_entry" onClose={onClose} />;
  return (
    <Modal
      labelledBy="stage-partner-title"
      onEscape={onClose}
      onBackdrop={onClose}
      className="w-full max-w-md rounded-t-3xl bg-ds-surface px-5 pb-8 pt-6 sm:rounded-3xl"
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2
            id="stage-partner-title"
            className="font-display ds-type-title font-semibold text-ds-ink"
          >
            {STAGE_LABELS[stage]}
          </h2>
          <p className="mt-1 ds-type-footnote text-ds-ink-soft">
            Who do you want to practise with?
          </p>
        </div>

        <Link
          to="/rehearse/$id/$stage"
          params={{ id: rehearsalId, stage }}
          onClick={onClose}
          className="rounded-full bg-ds-brand px-5 py-3 text-center font-semibold text-ds-card"
        >
          Start with Alphonso
        </Link>

        <div className="flex flex-col gap-3 rounded-2xl border border-ds-line bg-ds-card p-4">
          <div className="flex items-center gap-2">
            <h3 className="ds-type-headline font-semibold text-ds-ink">Hector</h3>
            <AiLabel />
            {!isPro && (
              <span className="rounded-full bg-ds-choice-tint px-2 py-0.5 ds-type-caption font-semibold text-ds-brand">
                Pro
              </span>
            )}
          </div>
          <p className="ds-type-footnote text-ds-ink-soft">
            A tougher, more realistic partner, and a longer debrief at the end.
          </p>
          {isPro && hardAvailable && (
            <label className="flex items-start gap-3 ds-type-footnote text-ds-ink">
              <input
                type="checkbox"
                checked={hard}
                onChange={(e) => setHard(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-semibold">Hard mode.</span> Faster, with interruptions and
                surprise questions. Still inside your plan, and still kind.
              </span>
            </label>
          )}
          {isPro ? (
            <Link
              to="/rehearse/$id/$stage"
              params={{ id: rehearsalId, stage }}
              search={{
                persona: "hector",
                ...(hardAvailable && hard ? { hard: true as const } : {}),
              }}
              onClick={onClose}
              className="rounded-full border border-ds-line px-5 py-3 text-center font-semibold text-ds-ink"
            >
              {hardAvailable && hard ? "Start hard mode with Hector" : "Start with Hector"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setPaywall(true)}
              className="rounded-full border border-ds-line px-5 py-3 text-center font-semibold text-ds-ink"
            >
              Start with Hector (Pro)
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="self-center ds-type-footnote font-semibold text-ds-ink-soft underline"
        >
          Not now
        </button>
      </div>
    </Modal>
  );
}
