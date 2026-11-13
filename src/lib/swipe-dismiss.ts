/** How far down (CSS px) the full player must be dragged before letting go minimises it to the mini player. */
export const SWIPE_DISMISS_PX = 96;

export function shouldDismissSwipe(deltaY: number): boolean {
  return Number.isFinite(deltaY) && deltaY >= SWIPE_DISMISS_PX;
}
