// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HANDS_FREE_PREFERENCE_KEY,
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
