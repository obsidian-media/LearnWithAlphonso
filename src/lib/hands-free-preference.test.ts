// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HANDS_FREE_PREFERENCE_KEY,
  readHandsFreeChoice,
  readHandsFreePreference,
  writeHandsFreePreference,
} from "./hands-free-preference";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("hands-free preference", () => {
  it("is off until the learner turns it on", () => {
    expect(readHandsFreePreference()).toBe(false);
  });

  it("remembers on and off", () => {
    writeHandsFreePreference(true);
    expect(readHandsFreePreference()).toBe(true);
    expect(window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY)).toBe("1");
    writeHandsFreePreference(false);
    expect(readHandsFreePreference()).toBe(false);
  });

  it("tells never chosen apart from switched off, so a default-on call respects an explicit off", () => {
    expect(readHandsFreeChoice()).toBe("unset");
    writeHandsFreePreference(true);
    expect(readHandsFreeChoice()).toBe("on");
    writeHandsFreePreference(false);
    expect(readHandsFreeChoice()).toBe("off");
    expect(window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY)).toBe("0");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readHandsFreePreference()).toBe(false);
    expect(() => writeHandsFreePreference(true)).not.toThrow();
  });
});
