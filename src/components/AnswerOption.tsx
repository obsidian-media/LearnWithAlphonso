type AnswerState = "idle" | "selected" | "correct" | "incorrect";

function stateOf({
  checked,
  isPicked,
  isRight,
}: {
  checked: boolean;
  isPicked: boolean;
  isRight: boolean;
}): AnswerState {
  if (checked && isRight) return "correct";
  if (checked && isPicked) return "incorrect";
  if (isPicked) return "selected";
  return "idle";
}

/**
 * A single multiple-choice option. Shared by the lesson player, spaced
 * review, and the placement test, which all rendered identical markup —
 * kept as one component so the Studio Ink treatment stays consistent
 * everywhere instead of drifting across three copies.
 */
export function AnswerOption({
  label,
  checked,
  isPicked,
  isRight,
  disabled,
  onClick,
}: {
  label: string;
  checked: boolean;
  isPicked: boolean;
  isRight: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const state = stateOf({ checked, isPicked, isRight });

  // A chunky tile with a darker bottom edge that collapses while pressed, like the app's buttons. The colours
  // say picked / right / wrong; the edge takes the same hue so the tile reads as one solid piece.
  const boxClasses =
    state === "correct"
      ? "border-ds-brand bg-ds-brand/20 text-ds-ink shadow-[0_4px_0_0_var(--color-edge-moss)]"
      : state === "incorrect"
        ? "border-rose-400 bg-rose-500/15 text-ds-ink shadow-[0_4px_0_0_rgba(190,18,60,0.55)]"
        : state === "selected"
          ? "border-ds-brand bg-ds-brand/10 text-ds-ink shadow-[0_4px_0_0_var(--color-edge-moss)]"
          : "border-ds-line bg-ds-sunk text-ds-ink shadow-[0_4px_0_0_var(--color-hairline)] hover:border-ds-ink/30";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={isPicked}
      className={`flex min-h-14 w-full items-center gap-3 rounded-[18px] border-2 px-4 py-3 text-left text-base font-medium transition-[transform,box-shadow,background-color,border-color] duration-100 active:translate-y-1 active:shadow-none motion-reduce:transition-none ${boxClasses}`}
    >
      <span className="flex-1">{label}</span>
      {state === "correct" && (
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-full bg-ds-brand text-xs font-bold text-ds-card"
        >
          ✓
        </span>
      )}
      {state === "incorrect" && (
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white"
        >
          ✕
        </span>
      )}
    </button>
  );
}
