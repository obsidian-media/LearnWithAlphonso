import { useTheme } from "../lib/theme";

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
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const state = stateOf({ checked, isPicked, isRight });

  if (isStudioInk) {
    const barColor =
      state === "correct"
        ? "border-l-moss"
        : state === "incorrect"
          ? "border-l-rose-400"
          : state === "selected"
            ? "border-l-ink"
            : "border-l-transparent";
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`w-full border-b border-hairline border-l-[3px] py-3 pl-3 pr-4 text-left text-sm text-ink transition ${barColor}`}
      >
        {label}
      </button>
    );
  }

  const boxClasses =
    state === "correct"
      ? "border-moss bg-moss/10 text-ink"
      : state === "incorrect"
        ? "border-rose-400 bg-rose-50 text-ink"
        : state === "selected"
          ? "border-ink bg-parchment text-ink"
          : "border-hairline bg-surface text-ink hover:border-ink/30";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3.5 text-left text-sm transition ${boxClasses}`}
    >
      {label}
    </button>
  );
}
