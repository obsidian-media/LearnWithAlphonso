import { Icon } from "./ds/Blocks";

/**
 * The short message that slides over a screen and leaves on its own (the web twin of ToastBanner.swift): a nudge
 * arrived, someone passed you, a block went through. It is a polite live region, so a screen reader hears it
 * without the focus moving, and it stays on screen long enough to read.
 */
export function ToastBanner({
  message,
  icon = "waving_hand",
}: {
  message: string | null;
  icon?: string;
}) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
      <p
        role="status"
        aria-live="polite"
        className="flex max-w-[430px] items-center gap-2 rounded-full border-2 border-ds-line bg-ds-card px-4 py-2 ds-type-footnote font-bold text-ds-ink shadow-[var(--ds-shadow-floating)]"
      >
        <Icon name={icon} size={22} />
        <span>{message}</span>
      </p>
    </div>
  );
}
