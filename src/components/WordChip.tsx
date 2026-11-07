import { useTheme } from "../lib/theme";

/**
 * One word in a fill-in word bank or a reorder pool: a chunky tile that presses down, highlighted when it is the
 * picked word. Shared by the lesson player and review. Studio Ink keeps its quiet pill.
 */
export function WordChip({
  word,
  picked,
  disabled,
  onClick,
}: {
  word: string;
  picked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  if (isStudioInk) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={picked}
        className="rounded-full border border-ds-line bg-ds-card px-3 py-1.5 text-sm text-ds-ink-soft hover:text-ds-ink"
      >
        {word}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={picked}
      className={`min-h-11 rounded-[14px] border-2 px-4 py-2 text-base font-medium text-ds-ink transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none disabled:opacity-60 motion-reduce:transition-none ${
        picked
          ? "border-ds-brand bg-ds-brand/15 shadow-[0_4px_0_0_var(--color-edge-moss)]"
          : "border-ds-line bg-ds-sunk shadow-[0_4px_0_0_var(--color-hairline)]"
      }`}
    >
      {word}
    </button>
  );
}
