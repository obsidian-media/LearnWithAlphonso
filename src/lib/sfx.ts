/**
 * Short sound effects (Kenney.nl, CC0; see NOTICE.md) for a right or wrong answer, a finished lesson, XP, a lost heart,
 * a primary-button tap, a call starting or ending, and an achievement.
 *
 * Owner rules, all enforced here rather than at each call site:
 * - The Settings switch (stored on this device, on by default) is read at play time; off is completely silent.
 * - An effect never talks over Alphonso or Hector: while a voice is playing the effect is skipped, and nothing here
 *   ever pauses or interrupts the voice.
 * - An event with a key plays once per key, so a re-render cannot double it.
 * - Audio failing (autoplay policy, no audio device, old browser) never throws into the screen.
 * Sounds are never the only signal: every event already has its visual.
 */
import { useSyncExternalStore } from "react";

export const SFX_EVENTS = [
  "right",
  "wrong",
  "lessonComplete",
  "xp",
  "heartLost",
  "tap",
  "callStart",
  "callEnd",
  "achievement",
] as const;
export type SfxEvent = (typeof SFX_EVENTS)[number];

export const SFX_FILES: Record<SfxEvent, string> = {
  right: "/sfx/sfx-right.mp3",
  wrong: "/sfx/sfx-wrong.mp3",
  lessonComplete: "/sfx/sfx-lesson-complete.mp3",
  xp: "/sfx/sfx-xp.mp3",
  heartLost: "/sfx/sfx-heart-lost.mp3",
  tap: "/sfx/sfx-tap.mp3",
  callStart: "/sfx/sfx-call-start.mp3",
  callEnd: "/sfx/sfx-call-end.mp3",
  achievement: "/sfx/sfx-achievement.mp3",
};

/** How long each effect lasts, rounded up: the call-start cue must be over before Alphonso's first line. */
export const SFX_DURATION_MS: Record<SfxEvent, number> = {
  right: 480,
  wrong: 320,
  lessonComplete: 1160,
  xp: 70,
  heartLost: 180,
  tap: 70,
  callStart: 730,
  callEnd: 720,
  achievement: 300,
};

export type SfxBackend = { play: (src: string) => void };

export function createSfxPlayer(deps: {
  isEnabled: () => boolean;
  isVoiceActive: () => boolean;
  backend: SfxBackend;
  now?: () => number;
}) {
  const now = deps.now ?? (() => Date.now());
  const playedKeys = new Set<string>();
  let callCueEndsAt = 0;
  return {
    /** How long the call-start sound still has to play: Alphonso's opening line waits this long. */
    callCueRemainingMs(): number {
      return Math.max(0, callCueEndsAt - now());
    },
    /** Plays the event's effect, unless the switch is off, a voice is playing, or this key already played. */
    play(event: SfxEvent, key?: string): boolean {
      try {
        if (!deps.isEnabled()) return false;
        if (key !== undefined && playedKeys.has(key)) return false;
        if (deps.isVoiceActive()) return false;
        if (key !== undefined) playedKeys.add(key);
        if (event === "callStart") callCueEndsAt = now() + SFX_DURATION_MS.callStart;
        deps.backend.play(SFX_FILES[event]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type SfxCue = { event: SfxEvent; atMs: number };

/**
 * The complete screen's effects: the jingle with the confetti, the XP blip once the jingle is over, and the
 * achievement chime as its card lands (the card's own delay, 1.7 s).
 */
export function finishCues({ xp, unlocked }: { xp: number; unlocked: number }): SfxCue[] {
  const cues: SfxCue[] = [{ event: "lessonComplete", atMs: 0 }];
  if (xp > 0) cues.push({ event: "xp", atMs: 1200 });
  if (unlocked > 0) cues.push({ event: "achievement", atMs: 1700 });
  return cues;
}

// The Settings switch: stored on this device only.

export const SOUND_EFFECTS_STORAGE_KEY = "alphonso.soundEffects.v1";
type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const browserStorage = (): KeyValue | undefined => globalThis.localStorage ?? undefined;

export function readSoundEffectsOn(storage: KeyValue | undefined = browserStorage()): boolean {
  try {
    return storage?.getItem(SOUND_EFFECTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

export function writeSoundEffectsOn(on: boolean, storage: KeyValue | undefined = browserStorage()) {
  try {
    storage?.setItem(SOUND_EFFECTS_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode: the switch just does not persist */
  }
  listeners.forEach((l) => l());
}

/** The switch's value for a React screen, kept in step when it changes. */
export function useSoundEffectsOn(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => readSoundEffectsOn(),
    () => true,
  );
  return [on, (next: boolean) => writeSoundEffectsOn(next)];
}

// Is Alphonso or Hector speaking? The lesson speaks through speechSynthesis; a call registers its own probe.

const voiceProbes = new Set<() => boolean>();

/** A screen that plays a voice tells the effects about it; returns the unregister. */
export function registerVoiceProbe(probe: () => boolean): () => void {
  voiceProbes.add(probe);
  return () => voiceProbes.delete(probe);
}

export function isVoiceActive(): boolean {
  if (typeof window !== "undefined" && window.speechSynthesis?.speaking) return true;
  for (const probe of voiceProbes) if (probe()) return true;
  return false;
}

/** One preloaded element per effect, made on first use; replays rewind it. */
function htmlAudioBackend(): SfxBackend {
  const pool = new Map<string, HTMLAudioElement>();
  return {
    play(src) {
      if (typeof Audio === "undefined") return;
      let audio = pool.get(src);
      if (!audio) {
        audio = new Audio(src);
        audio.preload = "auto";
        pool.set(src, audio);
      }
      audio.currentTime = 0;
      void audio.play()?.catch(() => {});
    },
  };
}

const appPlayer = createSfxPlayer({
  isEnabled: () => readSoundEffectsOn(),
  isVoiceActive,
  backend: htmlAudioBackend(),
});

/** Plays an effect in the app. Safe to call anywhere: it never throws. */
export function playSfx(event: SfxEvent, key?: string): boolean {
  return appPlayer.play(event, key);
}

/** Plays a timed sequence (each cue keyed under `key`); returns a cancel for the screen's cleanup. */
export function playSfxCues(cues: SfxCue[], key: string): () => void {
  const timers = cues.map((cue) =>
    setTimeout(() => playSfx(cue.event, `${key}:${cue.event}`), cue.atMs),
  );
  return () => timers.forEach(clearTimeout);
}

/**
 * Resolves once the call-start sound is over (at once when it did not play). A call's opening line awaits this, so
 * the cue never plays under Alphonso's first words.
 */
export function waitForCallCue(): Promise<void> {
  const ms = appPlayer.callCueRemainingMs();
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
