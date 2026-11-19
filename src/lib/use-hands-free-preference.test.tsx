// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { HECTOR_TUNING } from "./hands-free-loop";
import { HANDS_FREE_PREFERENCE_KEY } from "./hands-free-preference";

let micDenied: (() => void) | undefined;
vi.mock("./use-speech-capture", () => ({
  useSpeechCapture: (opts: { onMicDenied?: () => void }) => {
    micDenied = opts.onMicDenied;
    return {
      state: "idle",
      starting: false,
      error: null,
      failed: false,
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
      getStream: () => null,
    };
  },
}));

import { useHandsFreeCapture } from "./use-hands-free";

function mount() {
  const onWantedChange = vi.fn();
  const view = renderHook(() =>
    useHandsFreeCapture({
      onTranscript: () => {},
      wanted: false,
      live: true,
      tuning: HECTOR_TUNING,
      replyPhase: "idle",
      failure: null,
      partner: "Hector",
      onWantedChange,
    }),
  );
  return { onWantedChange, view };
}

beforeEach(() => {
  (window as unknown as { AudioContext: unknown }).AudioContext = class {};
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("hands-free preference on a new call", () => {
  it("starts off when nothing was chosen", () => {
    const { onWantedChange } = mount();
    expect(onWantedChange).not.toHaveBeenCalled();
  });

  it("turns on when the learner last left it on", () => {
    window.localStorage.setItem(HANDS_FREE_PREFERENCE_KEY, "1");
    const { onWantedChange } = mount();
    expect(onWantedChange).toHaveBeenCalledWith(true);
  });

  it("stores the learner's switch for the next call", () => {
    const { view } = mount();
    act(() => view.result.current.handsFreeCall!.onChange(true));
    expect(window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY)).toBe("1");
    act(() => view.result.current.handsFreeCall!.onChange(false));
    expect(window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY)).toBeNull();
  });

  it("falls back to hold-to-talk when the microphone is refused, keeping the stored choice", () => {
    window.localStorage.setItem(HANDS_FREE_PREFERENCE_KEY, "1");
    const { onWantedChange } = mount();
    act(() => micDenied!());
    expect(onWantedChange).toHaveBeenLastCalledWith(false);
    expect(window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY)).toBe("1");
  });
});
