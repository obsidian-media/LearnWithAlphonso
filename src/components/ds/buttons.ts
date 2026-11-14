/** The chunky button classes, apart from Blocks so a module can build them at load without pulling in the app shell. */

export type DsButtonVariant = "primary" | "secondary" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[16px] ds-type-headline text-center font-extrabold transition-transform duration-[var(--ds-duration-press)] active:translate-y-px disabled:opacity-45 disabled:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";

export function dsButtonClass(
  variant: DsButtonVariant = "primary",
  { small = false, full = false }: { small?: boolean; full?: boolean } = {},
): string {
  const size = small ? "min-h-9 rounded-[12px] px-3 py-1.5 ds-type-caption" : "min-h-12 px-4 py-3";
  const look =
    variant === "primary"
      ? "bg-ds-action text-ds-on-action shadow-[0_4px_0_var(--c-action-edge)]"
      : variant === "danger"
        ? "border-2 border-ds-line bg-ds-card text-ds-wrong-ink shadow-[0_3px_0_var(--c-line)]"
        : "border-2 border-ds-line bg-ds-card text-ds-brand shadow-[0_3px_0_var(--c-line)]";
  return `${BUTTON_BASE} ${size} ${look} ${full ? "w-full" : ""}`;
}
