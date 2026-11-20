// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { SayItRight } from "./SayItRight";
import { useProgress } from "@/lib/progress";
import { getCourse } from "@/data/courses";
import { SLOW_RATE } from "@/lib/use-say-it-right-audio";
import { WAVE_BARS } from "@/lib/waveform";

/**
 * "Hear you vs Alphonso": the real audio hook under the real screen, with the recorder, the decoder, the TTS fetch
 * and the Audio element all injected.
 */
const h = vi.hoisted(() => ({
  capture: {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    canRecord: true,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    onTranscript: null as ((t: string, c: number | null) => void) | null,
    onClip: null as ((b: Blob) => void) | null,
  },
}));

vi.mock("@/lib/use-speech-capture", () => ({
  useSpeechCapture: (o: {
    onTranscript: (t: string, c: number | null) => void;
    onClip?: (b: Blob) => void;
  }) => {
    h.capture.onTranscript = o.onTranscript;
    h.capture.onClip = o.onClip ?? null;
    return h.capture;
  },
}));

class FakeAudio {
  playbackRate = 1;
  preservesPitch = false;
  duration = 2;
  currentTime = 0;
  onended: (() => void) | null = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor(public src: string) {}
}
const made: FakeAudio[] = [];
let urls = 0;
const samples = [0.1, -0.4, 0.9, -0.2, 0.3, -0.7, 0.05, 0.6];
const fetchModel = vi.fn(async () => new Blob(["tts"]));
const decode = vi.fn(async () => samples);
const deps = () => ({
  fetchModel,
  decode,
  createAudio: (src: string) => {
    const a = new FakeAudio(src);
    made.push(a);
    return a as unknown as HTMLAudioElement;
  },
});

const lessonIds = () =>
  getCourse("en")
    .curriculum.flatMap((u) => u.lessons)
    .map((l) => l.id);
const flush = () => act(async () => {});
const shownWord = () => document.querySelector("p[lang]")?.textContent ?? "";
const view = () =>
  render(
    withAiConsent(
      <SayItRight course="en" onExit={() => {}} pick={() => 0} audioDeps={deps()} />,
      fakeConsentApi(),
    ),
  );
/** A first attempt that misses: the clip arrives, then the transcript. */
const miss = async () => {
  act(() => h.capture.onClip?.(new Blob(["you"])));
  act(() => h.capture.onTranscript?.("zzzz", 0.99));
  await flush();
};
const you = () => screen.getByRole("button", { name: "Play your recording" });
const alphonso = () => screen.getByRole("button", { name: "Play Alphonso's version" });
const barHeights = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>("[data-bar]")].map((b) => b.style.height);

beforeEach(() => {
  made.length = 0;
  urls = 0;
  fetchModel.mockClear();
  decode.mockReset();
  decode.mockImplementation(async () => samples);
  URL.createObjectURL = vi.fn(() => `blob:clip-${++urls}`);
  URL.revokeObjectURL = vi.fn();
  useProgress.setState({ completedLessons: lessonIds().slice(0, 12) });
  Object.assign(h.capture, { state: "idle", error: null, canRecord: true });
  h.capture.cancel.mockClear();
  h.capture.start.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Say it right: hear you next to Alphonso", () => {
  it("shows nothing to compare before an attempt, then both waveforms after one", async () => {
    view();
    expect(screen.queryByTestId("sir-compare")).toBeNull();
    await miss();
    expect(you()).toBeTruthy();
    expect(alphonso()).toBeTruthy();
  });

  it("draws bars from the decoded samples, WAVE_BARS of them, tallest at full height", async () => {
    view();
    await miss();
    const heights = barHeights(you());
    expect(heights).toHaveLength(WAVE_BARS);
    expect(heights).toContain("100%");
    expect(you().getAttribute("data-flat")).toBe("false");
    // Alphonso's bars come from the model audio the miss already fetched: no extra TTS call.
    expect(alphonso().getAttribute("data-flat")).toBe("false");
    expect(fetchModel).toHaveBeenCalledTimes(1);
  });

  it("when decoding fails both rows stay flat and play still works", async () => {
    decode.mockImplementation(async () => Promise.reject(new Error("no decode")));
    view();
    await miss();
    expect(you().getAttribute("data-flat")).toBe("true");
    expect(new Set(barHeights(you())).size).toBe(1);
    const before = made.length;
    fireEvent.click(you());
    await flush();
    expect(made.length).toBe(before + 1);
    expect(you().getAttribute("aria-pressed")).toBe("true");
  });

  it("tapping a waveform plays that clip, announces it, and stops the other", async () => {
    view();
    await miss();
    fireEvent.click(you());
    await flush();
    expect(you().getAttribute("aria-pressed")).toBe("true");
    expect(alphonso().getAttribute("aria-pressed")).toBe("false");
    const youAudio = made.at(-1)!;

    fireEvent.click(alphonso());
    await flush();
    expect(youAudio.pause).toHaveBeenCalled();
    expect(alphonso().getAttribute("aria-pressed")).toBe("true");
    expect(you().getAttribute("aria-pressed")).toBe("false");
  });

  it("playing a clip while a retry is recording throws that recording away", async () => {
    view();
    await miss();
    // The retry's recording is under way (the screen re-renders as the state changes).
    h.capture.state = "recording";
    fireEvent.click(you());
    await flush();
    fireEvent.click(alphonso());
    await flush();
    expect(h.capture.cancel).toHaveBeenCalled();
    expect(h.capture.stop).not.toHaveBeenCalled();
  });

  it("Say it slower replays the same audio at a slower rate with no second TTS call", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    await flush();
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(made.at(-1)!.playbackRate).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Say it slower" }));
    await flush();
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(made.at(-1)!.playbackRate).toBe(SLOW_RATE);
    expect(made.at(-1)!.preservesPitch).toBe(true);
    expect(screen.getByRole("button", { name: "Say it slower" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("frees the attempt's audio when the word changes", async () => {
    view();
    const first = shownWord();
    await miss();
    fireEvent.click(you());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Skip this word" }));
    await flush();
    expect(shownWord()).not.toBe(first);
    expect(screen.queryByTestId("sir-compare")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("frees the audio on exit (unmount)", async () => {
    const { unmount } = view();
    await miss();
    fireEvent.click(you());
    await flush();
    const revoked = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      revoked,
    );
  });

  it("the waveforms stack at large text (rem breakpoint) and sit side by side otherwise", async () => {
    view();
    await miss();
    const cls = screen.getByTestId("sir-compare").className;
    expect(cls).toContain("grid-cols-1");
    expect(cls).toContain("min-[24rem]:grid-cols-2");
  });

  it("Reduce Motion: a playing waveform is highlighted whole, with no sweep", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: q.includes("reduce"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    view();
    await miss();
    expect(you().querySelectorAll('[data-lit="true"]')).toHaveLength(0);
    fireEvent.click(you());
    await flush();
    const lit = you().querySelectorAll('[data-lit="true"]').length;
    expect(lit).toBe(WAVE_BARS);
  });

  it("without Reduce Motion a playing waveform starts unlit and sweeps with progress", async () => {
    view();
    await miss();
    fireEvent.click(you());
    await flush();
    expect(you().querySelectorAll('[data-lit="true"]').length).toBeLessThan(WAVE_BARS);
  });
});
