// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSpeechCapture } from "./use-speech-capture";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({}) }));

type RecorderInstance = {
  start: ReturnType<typeof vi.fn>;
  stop: () => void;
  state: string;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

let lastRecorder: RecorderInstance | null = null;

function installMediaMocks({ blobSize = 4096 } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });

  class FakeRecorder {
    start = vi.fn(() => {
      this.state = "recording";
      this.ondataavailable?.({ data: new Blob(["x".repeat(blobSize)]) });
    });
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor() {
      lastRecorder = this as unknown as RecorderInstance;
    }
    static isTypeSupported() {
      return true;
    }
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  return { track };
}

beforeEach(() => {
  lastRecorder = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSpeechCapture", () => {
  it("reports a transcript and its confidence after a successful capture", async () => {
    installMediaMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ text: "She's a doctor.", confidence: 0.94 }),
      })),
    );
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("She's a doctor.", 0.94));
    expect(result.current.error).toBeNull();
  });

  it("surfaces a denied microphone as an error and never reports a transcript", async () => {
    // A refused or broken recording must not reach the caller at all. If it
    // did, a player would grade "nothing" as a wrong answer and take a heart
    // for a microphone problem the learner cannot do anything about.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toMatch(/microphone/i);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("surfaces a transcription failure and never reports a transcript", async () => {
    installMediaMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("treats an empty transcript as nothing captured, not as an answer", async () => {
    installMediaMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ text: "   ", confidence: null }) })),
    );
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports canRecord false where the browser has no microphone API", async () => {
    // getUserMedia is absent in insecure contexts and some embedded browsers.
    // Callers need to know BEFORE rendering a control that cannot work.
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));
    expect(result.current.canRecord).toBe(false);
  });

  it("releases the microphone when the learner lets go before permission resolves", async () => {
    // getUserMedia is async, so a release can land before the recorder exists.
    // Without this the mic stays hot with no way to stop it -- the converse
    // route documents this exact race, and the extraction must keep it.
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    let resolveMedia: ((s: unknown) => void) | null = null;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise((res) => (resolveMedia = res))),
      },
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported() {
          return true;
        }
      },
    );
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));

    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      resolveMedia?.(stream);
      await started!;
    });

    expect(track.stop).toHaveBeenCalled();
  });

  it("treats hesitation noise as nothing captured, not as an answer", async () => {
    // Deepgram returns "Um." as real text. It is non-empty, but it normalises
    // to nothing at the grading site -- so a raw-text gate handed it to the
    // caller as an answer and the learner lost a heart for clearing their
    // throat.
    installMediaMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ text: "Um.", confidence: 0.2 }) })),
    );
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports a sticky failure so a caller can offer a way that is not the microphone", async () => {
    // canRecord only says the browser HAS the API. A denied permission leaves a
    // learner staring at a mic button that can never produce an answer, on a
    // question with no skip -- which makes the lesson unfinishable.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));
    expect(result.current.failed).toBe(false);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.failed).toBe(true);
  });
});

describe("useSpeechCapture, hands-free turns", () => {
  const okFetch = (text: string) =>
    vi.fn(async () => ({ ok: true, json: async () => ({ text, confidence: 0.9 }) }));

  /** Starts a recording that lasted `ms` and stops it. */
  async function recordFor(result: { current: ReturnType<typeof useSpeechCapture> }, ms: number) {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    await act(async () => {
      await result.current.start();
    });
    now.mockReturnValue(1_000_000 + ms);
    await act(async () => {
      result.current.stop();
    });
  }

  it("asks for the browser's echo cancellation", async () => {
    installMediaMocks();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));
    await act(async () => {
      await result.current.start();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true },
    });
  });

  it("reports the permission phase while the microphone is being opened", async () => {
    installMediaMocks();
    let resolveMedia: ((s: unknown) => void) | null = null;
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => new Promise((res) => (resolveMedia = res))) },
    });
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));
    expect(result.current.starting).toBe(false);
    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    expect(result.current.starting).toBe(true);
    await act(async () => {
      resolveMedia?.(stream);
      await started!;
    });
    expect(result.current.starting).toBe(false);
    expect(result.current.state).toBe("recording");
  });

  it("drops a clip under 0.4 s in silence, without an error or a transcript", async () => {
    installMediaMocks();
    const fetchMock = okFetch("hello there");
    vi.stubGlobal("fetch", fetchMock);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript, handsFree: true }));
    await recordFor(result, 300);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("idle");
  });

  it("sends a hands-free clip of 0.4 s or more", async () => {
    installMediaMocks();
    vi.stubGlobal("fetch", okFetch("hello there"));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript, handsFree: true }));
    await recordFor(result, 450);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello there", 0.9));
  });

  it("does not drop a short hold-to-talk clip by duration (only by size, as before)", async () => {
    installMediaMocks();
    vi.stubGlobal("fetch", okFetch("hi"));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript }));
    await recordFor(result, 100);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hi", 0.9));
  });

  it("reports an empty hands-free transcript as no words, with no error message", async () => {
    installMediaMocks();
    vi.stubGlobal("fetch", okFetch("Um."));
    const onTranscript = vi.fn();
    const onNoWords = vi.fn();
    const { result } = renderHook(() =>
      useSpeechCapture({ onTranscript, handsFree: true, onNoWords }),
    );
    await recordFor(result, 900);
    await waitFor(() => expect(onNoWords).toHaveBeenCalledTimes(1));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("still shows the error for an empty transcript when hands-free is off", async () => {
    installMediaMocks();
    vi.stubGlobal("fetch", okFetch("   "));
    const onNoWords = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn(), onNoWords }));
    await recordFor(result, 900);
    await waitFor(() => expect(result.current.error).toMatch(/didn't catch/i));
    expect(onNoWords).not.toHaveBeenCalled();
  });

  it("tells the caller about a real failure (denied microphone, transcription error)", async () => {
    const onFailure = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    const denied = renderHook(() => useSpeechCapture({ onTranscript: vi.fn(), onFailure }));
    await act(async () => {
      await denied.result.current.start();
    });
    expect(onFailure).toHaveBeenCalledTimes(1);

    installMediaMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const broken = renderHook(() => useSpeechCapture({ onTranscript: vi.fn(), onFailure }));
    await recordFor(broken.result, 900);
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(2));
  });

  it("cancel throws the clip away: nothing is transcribed, reported or shown", async () => {
    const { track } = installMediaMocks();
    const fetchMock = okFetch("should never be heard");
    vi.stubGlobal("fetch", fetchMock);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript, handsFree: true }));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.cancel();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("idle");
    expect(track.stop).toHaveBeenCalled();
  });

  it("a stream granted after cancel is dropped, and a later start is a clean one (no orphan recorder)", async () => {
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks };
    let grant: ((s: unknown) => void) | null = null;
    const recorders: unknown[] = [];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockImplementationOnce(() => new Promise((res) => (grant = res)))
          .mockImplementation(async () => stream),
      },
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported() {
          return true;
        }
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable: unknown = null;
        onstop: (() => void) | null = null;
        constructor() {
          recorders.push(this);
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.onstop?.();
        }
      },
    );
    const { result } = renderHook(() =>
      useSpeechCapture({ onTranscript: vi.fn(), handsFree: true }),
    );
    let first: Promise<void>;
    act(() => {
      first = result.current.start();
    });
    act(() => result.current.cancel());
    await act(async () => {
      grant?.(stream);
      await first!;
    });
    expect(recorders).toHaveLength(0);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    await act(async () => {
      await result.current.start();
    });
    expect(recorders).toHaveLength(1);
    expect(result.current.state).toBe("recording");
  });

  it("a second start while a recording exists does not open a second stream", async () => {
    installMediaMocks();
    const { result } = renderHook(() => useSpeechCapture({ onTranscript: vi.fn() }));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });
});
