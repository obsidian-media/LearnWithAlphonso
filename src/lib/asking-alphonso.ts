/**
 * How big Alphonso is beside a question's prompt: a large figure, a small avatar, or absent (`null`).
 * The same rules run on iPhone (`AskingAlphonsoLayout` in the Kit) and Android (`AskingAlphonsoLayout` in core);
 * only the screen-height thresholds differ by platform.
 *
 * Screen height picks the step; what is already on the screen can only shrink it. A long prompt, or a card that
 * carries an image, audio, a listening button or a speak control, caps him at the small avatar; both together
 * remove him. Either way the answers stay above the Check bar.
 */
export const ASK_NONE_BELOW_PX = 600;
export const ASK_LARGE_FROM_PX = 800;
export const ASK_LARGE_SIZE = 136;
export const ASK_SMALL_SIZE = 56;
/** A prompt longer than this many characters wraps to three or more lines beside a large portrait. */
export const ASK_LONG_PROMPT_CHARS = 60;

export function askingMascotSize(opts: {
  viewportHeight: number;
  prompt: string;
  /** The card also shows an image, plays audio, or has a listening or speak control. */
  hasMedia: boolean;
}): number | null {
  const crowd = (opts.prompt.length > ASK_LONG_PROMPT_CHARS ? 1 : 0) + (opts.hasMedia ? 1 : 0);
  if (crowd >= 2 || opts.viewportHeight < ASK_NONE_BELOW_PX) return null;
  if (opts.viewportHeight >= ASK_LARGE_FROM_PX && crowd === 0) return ASK_LARGE_SIZE;
  return ASK_SMALL_SIZE;
}
