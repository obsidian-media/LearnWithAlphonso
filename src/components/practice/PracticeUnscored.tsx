import { edgeButtonClass } from "../lesson/LessonParts";
import { UNSCORED_NOTICE } from "@/lib/practice-result-buttons";

/**
 * A call that came back without a score (offline, or the server could not be reached): the learner stays on the
 * scene, is told why, and can try the same scene again. Nothing is left behind, so earlier scenes keep their progress.
 */
export function PracticeUnscored({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      data-practice-unscored=""
      className="flex min-h-dvh flex-col justify-center gap-4 bg-ds-surface px-4 text-center text-ds-ink"
    >
      <p role="alert" className="ds-type-headline font-extrabold">
        {UNSCORED_NOTICE}
      </p>
      <button type="button" onClick={onRetry} className={edgeButtonClass("primary")}>
        Try again
      </button>
    </section>
  );
}
