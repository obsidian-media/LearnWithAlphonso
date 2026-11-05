import { useSyncExternalStore } from "react";
import { askingMascotSize, ASK_LARGE_SIZE } from "../lib/asking-alphonso";
import { MascotImage } from "./MascotImage";

const subscribeToResize = (notify: () => void) => {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
};
const viewportHeight = () => window.innerHeight;
// Server render and first hydration paint have no screen to measure, so no portrait until the browser answers.
const serverViewportHeight = () => 0;

/**
 * A question's prompt as Alphonso asking it: his portrait beside a speech bubble. The prompt stays the question's
 * `h2` (inside the bubble), so headings and screen readers are unchanged; the portrait is decorative.
 *
 * One portrait is rendered, sized by `askingMascotSize`: a large figure on a tall screen, a small avatar on a mid-size
 * one or when the card is crowded (a long prompt, or an image, audio or speak control above the answers), and none on
 * a short screen (Safari on an iPhone SE shows about 550 px) or when both apply, so the answers stay above the Check
 * bar. He never springs in (MascotImage's breathing is off under Reduce Motion).
 */
export function AskingAlphonso({
  prompt,
  hasMedia = false,
}: {
  prompt: string;
  hasMedia?: boolean;
}) {
  const height = useSyncExternalStore(subscribeToResize, viewportHeight, serverViewportHeight);
  const size = askingMascotSize({ viewportHeight: height, prompt, hasMedia });
  return (
    <div className="flex items-end gap-2.5">
      {size !== null && (
        <div data-ask-mascot="" data-ask-size={size} className="shrink-0">
          <MascotImage
            moment="questionAsk"
            size={size}
            tone="sun"
            radius={size === ASK_LARGE_SIZE ? 28 : 18}
            alt=""
          />
        </div>
      )}
      <div
        data-ask-bubble=""
        className="relative min-w-0 flex-1 break-words rounded-2xl border-2 border-hairline bg-surface px-4 py-3 shadow-[0_3px_0_0_var(--color-hairline)]"
      >
        {/* The bubble's tail, pointing at Alphonso; gone with him. */}
        {size !== null && (
          <span
            aria-hidden="true"
            className="absolute -left-[7px] bottom-4 size-3 rotate-45 border-b-2 border-l-2 border-hairline bg-surface"
          />
        )}
        <h2 className="font-display text-[20px] font-semibold leading-snug text-ink">{prompt}</h2>
      </div>
    </div>
  );
}
