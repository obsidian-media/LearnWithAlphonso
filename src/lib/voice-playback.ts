import { claimAudioSession, registerAudioOwner } from "./audio-session";
import { suspendAudioContext } from "./shared-audio-context";

/**
 * How one clip ended.
 *  - "ended": played to its end.
 *  - "stopped": cut off (replaced, stopped, paused by the system, e.g. a locked screen). The learner is not blocked.
 *  - "blocked": the browser refused to start it (iOS Safari without a tap). Nothing was heard.
 *  - "error": the clip is broken or stalled. Nothing, or not all of it, was heard.
 */
export type PlayOutcome = {
  result: "ended" | "stopped" | "blocked" | "error";
  /** The DOMException name of a rejected play() (NotAllowedError, ...), for the failure event. */
  errorName?: string;
};

export type PlayOptions = {
  /** Called when the sound actually starts. */
  onPlaying?: () => void;
};

export type VoicePlayback = {
  /**
   * Plays a tiny silent clip on the shared element. Call it SYNCHRONOUSLY inside a tap or press handler: iOS Safari
   * lets only an element that a gesture has played start sound later, after an await, which is every reply.
   */
  unlock(): void;
  /** Plays a clip (a Blob or a URL) on the shared element. Resolves once the clip has settled, never rejects. */
  play(source: Blob | string, options?: PlayOptions): Promise<PlayOutcome>;
  /** Stops what plays; its play() resolves "stopped". */
  stop(): void;
  /** The one element (the avatar reads its clock for lip-sync), or null where there is none. */
  element(): HTMLAudioElement | null;
  isPlaying(): boolean;
  /** Unlocks on the first tap or key anywhere. Returns the remover. */
  installGestureUnlock(target?: Document): () => void;
};

/** If the sound has not begun, or stops advancing, for this long, the clip counts as failed. */
export const STALL_MS = 12_000;

/** 0.1 s of silence as a WAV data URI: the smallest thing that makes the element count as played by a gesture. */
function silentWav(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(0x80, 44);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

type Deps = {
  createAudio?: () => HTMLAudioElement;
  /** Runs when a clip is about to play: stops the podcast. */
  claim?: () => void;
  /** Runs when a clip is about to play: frees the audio session from the microphone readers. */
  beforePlay?: () => void;
  stallMs?: number;
};

export function createVoicePlayback(deps: Deps = {}): VoicePlayback {
  let el: HTMLAudioElement | null = null;
  let unlocked = false;
  let current: { settle: (o: PlayOutcome) => void } | null = null;
  const stallMs = deps.stallMs ?? STALL_MS;

  const ensure = (): HTMLAudioElement | null => {
    if (el) return el;
    try {
      if (deps.createAudio) el = deps.createAudio();
      else if (typeof Audio !== "undefined") el = new Audio();
      if (el) {
        el.preload = "auto";
        el.setAttribute?.("playsinline", "");
      }
    } catch {
      el = null;
    }
    return el;
  };

  const unlock = () => {
    const audio = ensure();
    // Never over a clip that is playing: the silent one would cut it off.
    if (!audio || current) return;
    try {
      audio.src = silentWav();
      const started = audio.play() as Promise<void> | undefined;
      if (started && typeof started.then === "function") {
        started.then(
          () => {
            unlocked = true;
          },
          () => {},
        );
      } else {
        unlocked = true;
      }
    } catch {
      /* a browser with no audio: nothing to unlock */
    }
  };

  return {
    unlock,

    play(source, options) {
      const audio = ensure();
      if (!audio) return Promise.resolve({ result: "error", errorName: "NoAudio" });
      current?.settle({ result: "stopped" });
      deps.claim?.();
      deps.beforePlay?.();
      const owned = typeof source !== "string";
      let url: string;
      try {
        url = typeof source === "string" ? source : URL.createObjectURL(source);
      } catch {
        return Promise.resolve({ result: "error", errorName: "BadClip" });
      }

      return new Promise<PlayOutcome>((resolve) => {
        let done = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const run = {
          settle: (outcome: PlayOutcome) => {
            if (done) return;
            done = true;
            if (timer) clearTimeout(timer);
            audio.onended = audio.onerror = audio.onpause = audio.onstalled = null;
            audio.onplaying = audio.ontimeupdate = null;
            if (current === run) current = null;
            if (owned) URL.revokeObjectURL(url);
            resolve(outcome);
          },
        };
        current = run;
        const watch = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            run.settle({ result: "error", errorName: "Stalled" });
            audio.pause();
          }, stallMs);
        };
        audio.onended = () => run.settle({ result: "ended" });
        audio.onerror = () => run.settle({ result: "error", errorName: "MediaError" });
        // The browser fires pause just before ended; a pause before the end is a stop (a locked screen, a call).
        audio.onpause = () => run.settle({ result: audio.ended ? "ended" : "stopped" });
        audio.onstalled = watch;
        audio.onplaying = () => {
          if (timer) clearTimeout(timer);
          timer = null;
          options?.onPlaying?.();
        };
        audio.ontimeupdate = () => {
          if (timer) watch();
        };
        watch();
        const fail = (err: unknown) => {
          const name = (err as { name?: string } | null)?.name ?? "Error";
          run.settle({
            result:
              name === "NotAllowedError" ? "blocked" : name === "AbortError" ? "stopped" : "error",
            errorName: name,
          });
        };
        try {
          audio.src = url;
          audio.playbackRate = 1;
          const started = audio.play() as Promise<void> | undefined;
          started?.catch?.(fail);
        } catch (err) {
          fail(err);
        }
      });
    },

    stop() {
      if (!current) return;
      current.settle({ result: "stopped" });
      try {
        el?.pause();
      } catch {
        /* already gone */
      }
    },

    element: () => el,
    isPlaying: () => current !== null,

    installGestureUnlock(target) {
      const doc = target ?? (typeof document === "undefined" ? undefined : document);
      if (!doc) return () => {};
      const events = ["touchend", "pointerup", "click", "keydown"] as const;
      const onGesture = () => {
        unlock();
        // Kept until a gesture has really played the element (a first tap can land before the silence resolves).
        if (unlocked) remove();
      };
      const remove = () => events.forEach((e) => doc.removeEventListener(e, onGesture, true));
      events.forEach((e) => doc.addEventListener(e, onGesture, true));
      return remove;
    },
  };
}

let singleton: VoicePlayback | null = null;

/** The app's one voice player (one persistent element, so one unlock covers every reply). */
export function voicePlayback(): VoicePlayback {
  if (!singleton) {
    const playback: VoicePlayback = createVoicePlayback({
      claim: () => claimAudioSession("voice"),
      beforePlay: suspendAudioContext,
    });
    registerAudioOwner("voice", () => playback.stop());
    singleton = playback;
  }
  return singleton;
}

/** Tests only: forgets the shared player, so the next use builds a fresh element (from a stubbed `Audio`). */
export function __resetVoicePlaybackForTests(): void {
  singleton?.stop();
  singleton = null;
}
