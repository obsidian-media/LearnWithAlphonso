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
