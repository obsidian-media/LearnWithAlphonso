import { describe, expect, it } from "vitest";
import { SWIPE_DISMISS_PX, shouldDismissSwipe } from "./swipe-dismiss";

describe("shouldDismissSwipe", () => {
  it("dismisses on a long enough downward drag", () => {
    expect(shouldDismissSwipe(SWIPE_DISMISS_PX)).toBe(true);
    expect(shouldDismissSwipe(SWIPE_DISMISS_PX + 80)).toBe(true);
  });
  it("keeps the player on a short drag", () => {
    expect(shouldDismissSwipe(SWIPE_DISMISS_PX - 1)).toBe(false);
    expect(shouldDismissSwipe(0)).toBe(false);
  });
  it("never dismisses on an upward drag or a bad number", () => {
    expect(shouldDismissSwipe(-500)).toBe(false);
    expect(shouldDismissSwipe(Number.NaN)).toBe(false);
  });
});
