// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { SLOW_RATE, useSayItRightAudio } from "./use-say-it-right-audio";
import { WAVE_BARS, waveformPeaks } from "./waveform";

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

const samples = Array.from({ length: 960 }, (_, i) => (i < 480 ? 0.1 : 0.9) * Math.sin(i));
let urls = 0;
const made: FakeAudio[] = [];

const setup = (over: Partial<Parameters<typeof useSayItRightAudio>[0]> = {}, key = "0:0") => {
  const fetchModel = vi.fn(async () => new Blob(["tts"]));
  const decode = vi.fn(async () => samples);
  const onPlayStart = vi.fn();
  const hook = renderHook(
    ({ resetKey }: { resetKey: string }) =>
      useSayItRightAudio({
        course: "en",
        resetKey,
        fetchModel,
        decode,
        onPlayStart,
        createAudio: (src) => {
          const a = new FakeAudio(src);
          made.push(a);
          return a as unknown as HTMLAudioElement;
        },
        ...over,
      }),
    { initialProps: { resetKey: key } },
  );
  return { ...hook, fetchModel, decode, onPlayStart };
};

const flush = () => act(async () => {});

beforeEach(() => {
  urls = 0;
  made.length = 0;
  URL.createObjectURL = vi.fn(() => `blob:clip-${++urls}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("useSayItRightAudio", () => {
  it("draws the learner's waveform from the decoded samples", async () => {
    const { result } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await flush();
    expect(result.current.hasYou).toBe(true);
    expect(result.current.youPeaks).toEqual(waveformPeaks(samples, WAVE_BARS));
    expect(result.current.youPeaks).toHaveLength(WAVE_BARS);
  });

  it("draws Alphonso's waveform from the same audio Hear it fetched", async () => {
    const { result, fetchModel, decode } = setup();
    await act(async () => result.current.playModel("bike"));
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result.current.modelPeaks).toEqual(waveformPeaks(samples, WAVE_BARS));
  });

  it("tapping a waveform plays that clip and stops the other one", async () => {
    const { result, onPlayStart } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await act(async () => result.current.toggleYou());
    expect(result.current.playing).toEqual({ kind: "you", slow: false });
    expect(made[0].src).toBe("blob:clip-1");
    expect(made[0].play).toHaveBeenCalled();

    await act(async () => result.current.toggleModel("bike"));
    expect(made[0].pause).toHaveBeenCalled();
    expect(result.current.playing).toEqual({ kind: "model", slow: false });

    await act(async () => result.current.toggleYou());
    expect(made.at(-1)!.src).toBe("blob:clip-1");
    expect(result.current.playing?.kind).toBe("you");
    // Each start told the screen to drop any recording.
    expect(onPlayStart).toHaveBeenCalledTimes(3);
  });

  it("tapping the clip that is playing stops it", async () => {
    const { result } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await act(async () => result.current.toggleYou());
    await act(async () => result.current.toggleYou());
    expect(result.current.playing).toBeNull();
    expect(made[0].pause).toHaveBeenCalled();
  });

  it("a clip that ends clears the playing state", async () => {
    const { result } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await act(async () => result.current.toggleYou());
    act(() => made[0].onended?.());
    expect(result.current.playing).toBeNull();
  });

  it("Say it slower sets the playback rate on the SAME audio, with no second TTS call", async () => {
    const { result, fetchModel } = setup();
    await act(async () => result.current.playModel("bike"));
    expect(made[0].playbackRate).toBe(1);
    await act(async () => result.current.toggleModel("bike", true));
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(made[1].playbackRate).toBe(SLOW_RATE);
    expect(made[1].preservesPitch).toBe(true);
    expect(made[1].src).toBe(made[0].src);
    expect(result.current.playing).toEqual({ kind: "model", slow: true });
  });

  it("a clip that will not decode keeps a flat row (null peaks) and still plays", async () => {
    const { result } = setup({ decode: vi.fn(async () => Promise.reject(new Error("bad"))) });
    act(() => result.current.setYouClip(new Blob(["you"])));
    await flush();
    expect(result.current.youPeaks).toBeNull();
    await act(async () => result.current.toggleYou());
    expect(result.current.playing?.kind).toBe("you");
  });

  it("a newer attempt replaces the last one and frees its audio", async () => {
    const { result } = setup();
    act(() => result.current.setYouClip(new Blob(["one"])));
    await act(async () => result.current.toggleYou());
    act(() => result.current.setYouClip(new Blob(["two"])));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-1");
    expect(result.current.playing).toBeNull();
  });

  it("frees every clip when the word changes", async () => {
    const { result, rerender } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await act(async () => result.current.toggleYou());
    await act(async () => result.current.playModel("bike"));
    expect(result.current.modelPeaks).not.toBeNull();
    rerender({ resetKey: "0:1" });
    await flush();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-2");
    expect(result.current.hasYou).toBe(false);
    expect(result.current.youPeaks).toBeNull();
    expect(result.current.modelPeaks).toBeNull();
    expect(result.current.playing).toBeNull();
    // The new word fetches its own model audio.
    const before = made.length;
    await act(async () => result.current.playModel("car"));
    expect(made.length).toBe(before + 1);
  });

  it("frees every clip when the screen closes", async () => {
    const { result, unmount } = setup();
    act(() => result.current.setYouClip(new Blob(["you"])));
    await act(async () => result.current.toggleYou());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-1");
    expect(made[0].pause).toHaveBeenCalled();
  });

  it("a model fetch that lands after the word changed is dropped, not played", async () => {
    let resolve: (b: Blob) => void = () => {};
    const slowFetch = vi.fn(() => new Promise<Blob>((r) => (resolve = r)));
    const { result, rerender } = setup({ fetchModel: slowFetch });
    let p: Promise<void> = Promise.resolve();
    act(() => {
      p = result.current.playModel("bike");
    });
    rerender({ resetKey: "0:1" });
    await act(async () => {
      resolve(new Blob(["late"]));
      await p;
    });
    expect(made).toHaveLength(0);
  });
});
