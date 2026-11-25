import { DsButton } from "@/components/ds/Blocks";
import { Modal } from "../Modal";

/**
 * "Leave this lesson?": asked when the learner closes a lesson they have already answered questions in, so one stray
 * tap on the X does not throw the run away. Escape and the backdrop both mean "keep going" (the safe answer).
 */
export function LeaveLessonDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Modal
      labelledBy="leave-lesson-title"
      describedBy="leave-lesson-body"
      onEscape={onStay}
      onBackdrop={onStay}
      className="relative grid max-h-[92dvh] w-full max-w-[430px] gap-3 overflow-y-auto rounded-t-[28px] bg-ds-surface px-5 pb-6 pt-5 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <h2 id="leave-lesson-title" className="ds-type-title text-ds-ink">
        Leave this lesson?
      </h2>
      <p id="leave-lesson-body" className="ds-type-body text-ds-ink-soft">
        You will lose your progress in this lesson. Anything you got wrong still comes back in
        Review.
      </p>
      <DsButton full onClick={onStay}>
        Keep going
      </DsButton>
      <DsButton variant="secondary" full onClick={onLeave}>
        Leave lesson
      </DsButton>
    </Modal>
  );
}
