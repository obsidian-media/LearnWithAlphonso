import { useEffect, useState } from "react";
import { DsIcon } from "@/components/ds/DsIcon";
import { localeForCourse, type Course } from "@/data/course-meta";
import type { HectorCorrection } from "@/lib/hector-correction";
import { hasVoiceFor, speak } from "@/lib/speech";

/** Whether the device can say the fix aloud (re-checked when the browser finishes loading its voices). */
function useDeviceVoice(lang: string): boolean {
  const [available, setAvailable] = useState(() => hasVoiceFor(lang));
  useEffect(() => {
    setAvailable(hasVoiceFor(lang));
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setAvailable(hasVoiceFor(lang));
    synth.addEventListener?.("voiceschanged", update);
    return () => synth.removeEventListener?.("voiceschanged", update);
  }, [lang]);
  return available;
}

const MINI =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 ds-type-footnote font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice disabled:opacity-50";

/**
 * Hector's gentle correction under the learner's bubble: "Almost — one fix", the slip struck through, the fix in bold,
 * an optional note, and two actions. "Hear it" speaks the fix with the DEVICE's own voice (Web Speech: no request, no
 * server, no quota) and is left out when the device has no voice for the course. "Try again" is the caller's: it
 * re-arms the mic, or focuses the composer where there is no mic.
 */
export function CorrectionCard({
  correction,
  course,
  onTryAgain,
  tryAgainDisabled = false,
  hearDisabled = false,
  onBeforeHear,
}: {
  correction: HectorCorrection;
  course: Course;
  onTryAgain: () => void;
  tryAgainDisabled?: boolean;
  /** The mic is open (hands-free listening or a recording): the fix must not be spoken into it. */
  hearDisabled?: boolean;
  /** Called first, so Hector's own reply stops before the fix is spoken (one voice at a time). */
  onBeforeHear?: () => void;
}) {
  const lang = localeForCourse(course);
  const canHear = useDeviceVoice(lang);
  return (
    <div
      role="group"
      aria-label="Hector's correction"
      data-testid="hector-correction"
      className="ml-[39px] max-w-[85%] rounded-[18px] rounded-bl-[7px] border border-ds-line bg-ds-card px-3.5 py-3 shadow-[var(--ds-shadow-resting)]"
    >
      <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-ds-right-tint px-2 py-[3px] ds-type-overline font-extrabold text-ds-right-ink">
        <DsIcon name="check" className="size-3" />
        Almost — one fix
      </span>
      <p className="ds-type-footnote text-ds-ink">
        <span className="sr-only">You said </span>
        <del className="text-ds-wrong opacity-80 decoration-[1.5px]">{correction.slip}</del>
        <span className="sr-only">; better: </span>
        <span aria-hidden="true"> → </span>
        <strong className="font-extrabold text-ds-right-ink">{correction.fix}</strong>
      </p>
      {correction.note && (
        <p className="mt-1.5 ds-type-caption text-ds-ink-soft">{correction.note}</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {canHear && (
          <button
            type="button"
            aria-label={`Hear it: ${correction.fix}`}
            disabled={hearDisabled}
            onClick={() => {
              onBeforeHear?.();
              speak(correction.fix, lang);
            }}
            className={`${MINI} bg-ds-action text-ds-on-action shadow-[inset_0_-2px_0_var(--c-action-edge)]`}
          >
            <DsIcon name="play" className="size-3.5" />
            Hear it
          </button>
        )}
        <button
          type="button"
          aria-label="Try again: say it once more"
          onClick={onTryAgain}
          disabled={tryAgainDisabled}
          className={`${MINI} bg-ds-sunk text-ds-brand`}
        >
          <DsIcon name="mic" className="size-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
