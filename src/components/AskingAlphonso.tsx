import { MascotImage } from "./MascotImage";

/**
 * A question's prompt as Alphonso asking it: his portrait beside a speech bubble. The prompt stays the question's
 * `h2` (inside the bubble), so headings and screen readers are unchanged; the portrait is decorative. On a short
 * screen (Safari on an iPhone SE shows about 550 px) the portrait is hidden so the answer options stay above the fold, and the
 * bubble keeps the full width. He never springs in (MascotImage's breathing is off under Reduce Motion).
 */
export function AskingAlphonso({ prompt }: { prompt: string }) {
  return (
    <div className="flex items-end gap-2.5">
      {/* Three steps by screen height: none under 600 px, a small avatar from 600, a real figure from 800. */}
      <div
        data-ask-mascot=""
        className="hidden shrink-0 [@media(min-height:600px)_and_(max-height:799px)]:block"
      >
        <MascotImage moment="questionAsk" size={56} tone="sun" radius={18} alt="" />
      </div>
      <div data-ask-mascot-large="" className="hidden shrink-0 [@media(min-height:800px)]:block">
        <MascotImage moment="questionAsk" size={136} tone="sun" radius={28} alt="" />
      </div>
      <div
        data-ask-bubble=""
        className="relative min-w-0 flex-1 break-words rounded-2xl border-2 border-hairline bg-surface px-4 py-3 shadow-[0_3px_0_0_var(--color-hairline)]"
      >
        {/* The bubble's tail, pointing at Alphonso; gone with him on a short screen. */}
        <span
          aria-hidden="true"
          className="absolute -left-[7px] bottom-4 hidden size-3 rotate-45 border-b-2 border-l-2 border-hairline bg-surface [@media(min-height:600px)]:block"
        />
        <h2 className="font-display text-[20px] font-semibold leading-snug text-ink">{prompt}</h2>
      </div>
    </div>
  );
}
