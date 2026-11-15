// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PhaseKind } from "./avatar/machine";
import { HECTOR_TUNING, PRACTICE_TUNING, type HandsFreeTuning } from "./hands-free-loop";
import { handsFreeSupported, rmsToDBFS, useHandsFree } from "./use-hands-free";

/** What the fake analyser reports as the room's RMS amplitude. */
let amplitude = 0.001;
const QUIET = 0.001; // -60 dBFS
const SPEECH = 0.1; // -20 dBFS

class FakeAnalyser {
  fftSize = 2048;
  getFloatTimeDomainData(out: Float32Array) {
    out.fill(amplitude);
  }
}
/** Every context the hook made, and how the next one behaves. */
const contexts: FakeAudioContext[] = [];
let sourceThrows = false;
let suspended = false;
class FakeAudioContext {
  state = suspended ? "suspended" : "running";
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    contexts.push(this);
  }
  createMediaStreamSource() {
    if (sourceThrows) throw new Error("no source");
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
}

type Props = {
  wanted: boolean;
  live: boolean;
  phase: PhaseKind;
  failure: string | null;
  tuning: HandsFreeTuning;
};

function setup(initial: Partial<Props> = {}) {
  const controls = { begin: vi.fn(), end: vi.fn(), cancel: vi.fn() };
  const trackEnded: (() => void)[] = [];
  const track = {
    addEventListener: (_: string, fn: () => void) => trackEnded.push(fn),
    removeEventListener: () => {},
  };
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  const view = renderHook(
    (p: Props) =>
      useHandsFree({
        ...p,
        getStream: () => stream,
        controls,
      }),
    {
      initialProps: {
        wanted: true,
        live: true,
        phase: "idle",
        failure: null,
        tuning: HECTOR_TUNING,
        ...initial,
      } as Props,
    },
  );
  let lastProps: Props = {
    wanted: true,
    live: true,
    phase: "idle",
    failure: null,
    tuning: HECTOR_TUNING,
    ...initial,
  };
  const update = (next: Partial<Props>) => {
    lastProps = { ...lastProps, ...next };
    view.rerender(lastProps);
  };
  return { ...view, controls, update, trackEnded };
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  amplitude = QUIET;
  contexts.length = 0;
  sourceThrows = false;
  suspended = false;
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"],
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Opens the mic the way the capture does: the loop asked for a turn, so the phase becomes recording. */
async function startRecording(h: ReturnType<typeof setup>) {
  h.update({ phase: "requestingPermission" });
  h.update({ phase: "recording" });
  await advance(0);
}

describe("useHandsFree", () => {
  it("is off by default: with the switch off nothing ever opens the mic", async () => {
    const h = setup({ wanted: false });
    await advance(10_000);
    expect(h.controls.begin).not.toHaveBeenCalled();
    expect(h.result.current.status.kind).toBe("off");
  });

  it("turning the switch on opens the mic once, when the call is idle", () => {
    const h = setup({ wanted: false });
    h.update({ wanted: true });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("does not open the mic while the call is not live (a result between scenes)", () => {
    const h = setup({ wanted: true, live: false });
    expect(h.controls.begin).not.toHaveBeenCalled();
    h.update({ live: true });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("half-duplex: the mic opens only after the reply has finished playing", () => {
    const h = setup({ wanted: true, phase: "speaking" });
    expect(h.controls.begin).not.toHaveBeenCalled();
    h.update({ phase: "thinking" });
    expect(h.controls.begin).not.toHaveBeenCalled();
    h.update({ phase: "idle" });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("Hector ends the turn after 1.2 s of quiet, not before", async () => {
    const h = setup({ tuning: HECTOR_TUNING });
    await startRecording(h);
    amplitude = QUIET;
    await advance(500);
    amplitude = SPEECH;
    await advance(1500);
    expect(h.result.current.status.kind).toBe("hearing");
    amplitude = QUIET;
    await advance(1000);
    expect(h.controls.end).not.toHaveBeenCalled();
    await advance(400);
    expect(h.controls.end).toHaveBeenCalledTimes(1);
  });

  it("Practice waits 2.5 s of quiet before ending the turn", async () => {
    const h = setup({ tuning: PRACTICE_TUNING });
    await startRecording(h);
    await advance(500);
    amplitude = SPEECH;
    await advance(1500);
    amplitude = QUIET;
    await advance(2300);
    expect(h.controls.end).not.toHaveBeenCalled();
    await advance(400);
    expect(h.controls.end).toHaveBeenCalledTimes(1);
  });

  it("cancels and pauses when nobody speaks for 8 s", async () => {
    const h = setup();
    await startRecording(h);
    await advance(7500);
    expect(h.controls.cancel).not.toHaveBeenCalled();
    await advance(1000);
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    expect(h.controls.end).not.toHaveBeenCalled();
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "noSpeech" });
    // The cancelled turn comes back idle: the mic must not reopen by itself.
    h.update({ phase: "idle" });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("cancels, sends nothing and pauses after a 30 s turn", async () => {
    const h = setup();
    await startRecording(h);
    amplitude = SPEECH;
    await advance(30_500);
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    expect(h.controls.end).not.toHaveBeenCalled();
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "longTurn" });
  });

  it("pauses after 20 turns without a touch, and a tap resumes", () => {
    const h = setup();
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
    for (let turn = 1; turn < 25; turn++) {
      h.update({ phase: "recording" });
      h.update({ phase: "transcribing" });
      h.update({ phase: "idle" });
    }
    expect(h.controls.begin).toHaveBeenCalledTimes(20);
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "turnLimit" });
    act(() => h.result.current.togglePause());
    expect(h.controls.begin).toHaveBeenCalledTimes(21);
  });

  it("an empty transcript pauses instead of listening again", () => {
    const h = setup();
    h.update({ phase: "recording" });
    h.update({ phase: "transcribing" });
    act(() => h.result.current.noWords());
    h.update({ phase: "idle" });
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "noWords" });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("a failed reply pauses and never retries by itself", () => {
    const h = setup();
    h.update({ phase: "recording" });
    h.update({ phase: "transcribing" });
    // The call reports its error in the same render in which the turn comes back idle.
    h.update({ phase: "idle", failure: "Something went wrong." });
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "failure" });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
  });

  it("pausing while recording throws the clip away; Resume opens a new turn", () => {
    const h = setup();
    h.update({ phase: "recording" });
    act(() => h.result.current.togglePause());
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    h.update({ phase: "idle" });
    expect(h.controls.begin).toHaveBeenCalledTimes(1);
    act(() => h.result.current.togglePause());
    expect(h.controls.begin).toHaveBeenCalledTimes(2);
  });

  it("a hidden tab pauses and drops an open recording", async () => {
    const h = setup();
    await startRecording(h);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "interrupted" });
  });

  it("turning the switch off closes an open mic and sends nothing", async () => {
    const h = setup();
    await startRecording(h);
    h.update({ wanted: false });
    expect(h.controls.cancel).toHaveBeenCalled();
    expect(h.controls.end).not.toHaveBeenCalled();
    expect(h.result.current.status.kind).toBe("off");
  });

  it("leaving the call closes the mic", async () => {
    const h = setup();
    await startRecording(h);
    h.controls.cancel.mockClear();
    h.unmount();
    expect(h.controls.cancel).toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("reads amplitude as dBFS, and silence as the recorder's -160", () => {
    expect(rmsToDBFS(0.1)).toBeCloseTo(-20, 5);
    expect(rmsToDBFS(1)).toBeCloseTo(0, 5);
    expect(rmsToDBFS(0)).toBe(-160);
  });

  it("is supported only where there is an AudioContext", () => {
    expect(handsFreeSupported()).toBe(true);
    vi.stubGlobal("AudioContext", undefined);
    expect(handsFreeSupported()).toBe(false);
  });
});

describe("the mic is never left on", () => {
  it("turning hands-free off cancels the capture in every phase, also while a permission prompt is open", () => {
    const h = setup({ phase: "idle" });
    h.update({ phase: "requestingPermission" });
    h.controls.cancel.mockClear();
    h.update({ wanted: false });
    // not recording yet: a stream granted after this must still be dropped
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
  });

  it("the call stopping being live (a scene result) cancels too", () => {
    const h = setup({ phase: "idle" });
    h.update({ phase: "requestingPermission" });
    h.controls.cancel.mockClear();
    h.update({ live: false });
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
  });

  it("an analyser that throws stops the recording and pauses, instead of leaving it recording", async () => {
    sourceThrows = true;
    const h = setup();
    await startRecording(h);
    await advance(300);
    expect(h.controls.cancel).toHaveBeenCalled();
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "failure" });
  });

  it("a microphone that ends (unplugged) stops the recording and pauses", async () => {
    const h = setup();
    await startRecording(h);
    await advance(300);
    expect(h.trackEnded.length).toBeGreaterThan(0);
    h.controls.cancel.mockClear();
    act(() => h.trackEnded.forEach((fn) => fn()));
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "interrupted" });
  });

  it("a silent analyser (reads below the cut-off forever) still ends a no-speech turn at 8 s", async () => {
    amplitude = 0; // -160 dBFS, which the loop ignores as warm-up
    const h = setup();
    await startRecording(h);
    await advance(7000);
    expect(h.controls.cancel).not.toHaveBeenCalled();
    await advance(2500);
    expect(h.controls.cancel).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toEqual({ kind: "paused", reason: "noSpeech" });
  });

  it("with no stream at all the turn still ends on the wall clock", async () => {
    const controls = { begin: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    const view = renderHook(
      (p: { phase: PhaseKind }) =>
        useHandsFree({
          wanted: true,
          live: true,
          tuning: HECTOR_TUNING,
          phase: p.phase,
          failure: null,
          getStream: () => null,
          controls,
        }),
      { initialProps: { phase: "idle" as PhaseKind } },
    );
    view.rerender({ phase: "recording" });
    await advance(9500);
    expect(controls.cancel).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toEqual({ kind: "paused", reason: "noSpeech" });
  });

  it("the AudioContext is made in the tap, resumed, reused, and closed when hands-free stops", async () => {
    const h = setup({ wanted: false });
    act(() => h.result.current.prime());
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalled();
    h.update({ wanted: true });
    await startRecording(h);
    await advance(300);
    expect(contexts).toHaveLength(1);
    h.update({ wanted: false });
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it("the AudioContext is closed when the call is left", async () => {
    const h = setup({ wanted: false });
    act(() => h.result.current.prime());
    h.unmount();
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });
});
