import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoicePlayback } from "./voice-playback";

/** A stand-in for HTMLAudioElement whose events the test fires by hand. */
class FakeAudio {
  src = "";
  preload = "";
  playbackRate = 1;
  paused = true;
  ended = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onstalled: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  playCalls: string[] = [];
  /** What the next play() does: resolve, or reject with a DOMException-like name. */
  nextPlay: { reject?: string } = {};
  setAttribute() {}
  play() {
    this.playCalls.push(this.src);
    const { reject } = this.nextPlay;
    this.nextPlay = {};
    if (reject) return Promise.reject(Object.assign(new Error(reject), { name: reject }));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    const was = !this.paused;
    this.paused = true;
    if (was) this.onpause?.();
  }
}

let urls: string[];
beforeEach(() => {
  urls = [];
  let n = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => {
      const u = `blob:clip-${++n}`;
      urls.push(u);
      return u;
    },
    revokeObjectURL: (u: string) => {
      urls = urls.filter((x) => x !== u);
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(deps: Parameters<typeof createVoicePlayback>[0] = {}) {
  const audio = new FakeAudio();
  const claim = vi.fn();
  const beforePlay = vi.fn();
  const playback = createVoicePlayback({
    createAudio: () => audio as unknown as HTMLAudioElement,
    claim,
    beforePlay,
    ...deps,
  });
  return { audio, playback, claim, beforePlay };
}

const clip = () => new Blob(["x"]);

describe("voice playback: one persistent element", () => {
  it("reuses the same element for every clip and revokes each object URL", async () => {
    const { audio, playback } = setup();
    const first = playback.play(clip());
    await Promise.resolve();
    audio.paused = false;
    audio.ended = true;
    audio.onended?.();
    expect((await first).result).toBe("ended");
    const second = playback.play(clip());
    audio.onended?.();
    expect((await second).result).toBe("ended");
    expect(audio.playCalls).toEqual(["blob:clip-1", "blob:clip-2"]);
    expect(playback.element()).toBe(audio);
    expect(urls).toEqual([]);
  });

  it("unlocks by playing a silent clip, never over a clip that is playing", async () => {
    const { audio, playback } = setup();
    playback.unlock();
    expect(audio.playCalls).toHaveLength(1);
    expect(audio.playCalls[0]).toMatch(/^data:audio\/wav;base64,/);
    const playing = playback.play(clip());
    playback.unlock();
    expect(audio.playCalls).toHaveLength(2); // only the clip: unlock did not cut it off
    playback.stop();
    await playing;
  });

  it("claims the audio session and frees the microphone context before a clip plays", async () => {
    const { audio, playback, claim, beforePlay } = setup();
    const p = playback.play(clip());
    expect(claim).toHaveBeenCalledOnce();
    expect(beforePlay).toHaveBeenCalledOnce();
    audio.onended?.();
    await p;
  });
});

describe("voice playback: every way a clip ends settles", () => {
  it("settles on ended", async () => {
    const { audio, playback } = setup();
    const p = playback.play(clip());
    audio.onended?.();
    expect(await p).toEqual({ result: "ended" });
  });

  it("settles on error", async () => {
    const { audio, playback } = setup();
    const p = playback.play(clip());
    audio.onerror?.();
    expect((await p).result).toBe("error");
    expect(urls).toEqual([]);
  });

  it("settles on pause that is not the end (a locked screen), and reads the pause before ended as the end", async () => {
    const a = setup();
    const p = a.playback.play(clip());
    a.audio.onpause?.();
    expect((await p).result).toBe("stopped");

    const b = setup();
    const q = b.playback.play(clip());
    b.audio.ended = true;
    b.audio.onpause?.();
    expect((await q).result).toBe("ended");
  });

  it("settles a stalled clip that never recovers", async () => {
    vi.useFakeTimers();
    const { audio, playback } = setup({ stallMs: 5000 });
    const p = playback.play(clip());
    audio.onstalled?.();
    vi.advanceTimersByTime(5001);
    expect(await p).toMatchObject({ result: "error", errorName: "Stalled" });
  });

  it("does not settle a clip that starts in time", async () => {
    vi.useFakeTimers();
    const { audio, playback } = setup({ stallMs: 5000 });
    const onPlaying = vi.fn();
    const p = playback.play(clip(), { onPlaying });
    audio.onplaying?.();
    vi.advanceTimersByTime(60_000);
    expect(onPlaying).toHaveBeenCalledOnce();
    audio.onended?.();
    expect((await p).result).toBe("ended");
  });

  it("settles blocked when the browser refuses to play (iOS without a tap), with the error name", async () => {
    const { audio, playback } = setup();
    audio.nextPlay = { reject: "NotAllowedError" };
    expect(await playback.play(clip())).toEqual({
      result: "blocked",
      errorName: "NotAllowedError",
    });
    expect(urls).toEqual([]);
  });

  it("settles error for any other play() rejection", async () => {
    const { audio, playback } = setup();
    audio.nextPlay = { reject: "NotSupportedError" };
    expect(await playback.play(clip())).toEqual({
      result: "error",
      errorName: "NotSupportedError",
    });
  });

  it("a new clip stops the one before it, and the old one revokes its URL", async () => {
    const { audio, playback } = setup();
    const first = playback.play(clip());
    const second = playback.play(clip());
    expect((await first).result).toBe("stopped");
    audio.onended?.();
    expect((await second).result).toBe("ended");
    expect(urls).toEqual([]);
  });

  it("stop() settles the clip as stopped and pauses the element", async () => {
    const { audio, playback } = setup();
    const p = playback.play(clip());
    await Promise.resolve();
    playback.stop();
    expect((await p).result).toBe("stopped");
    expect(audio.paused).toBe(true);
    expect(playback.isPlaying()).toBe(false);
  });

  it("a URL source is not revoked (the caller owns it)", async () => {
    const { audio, playback } = setup();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const p = playback.play("https://files.example/rec.mp3");
    audio.onended?.();
    await p;
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe("gesture unlock", () => {
  it("unlocks on the first tap and stops listening once a gesture played the element", async () => {
    const { audio, playback } = setup();
    const listeners = new Map<string, () => void>();
    const doc = {
      addEventListener: (e: string, fn: () => void) => listeners.set(e, fn),
      removeEventListener: (e: string) => listeners.delete(e),
    } as unknown as Document;
    playback.installGestureUnlock(doc);
    expect(listeners.size).toBe(4);
    listeners.get("touchend")!();
    expect(audio.playCalls).toHaveLength(1);
    await Promise.resolve();
    await Promise.resolve();
    // The next gesture sees the element unlocked and removes the listeners.
    audio.playCalls.length = 0;
    listeners.get("click")?.();
    expect(listeners.size).toBe(0);
  });
});
