import { describe, expect, it, vi } from "vitest";
import {
  SFX_EVENTS,
  SFX_FILES,
  createSfxPlayer,
  finishCues,
  readSoundEffectsOn,
  writeSoundEffectsOn,
  SOUND_EFFECTS_STORAGE_KEY,
  type SfxEvent,
} from "./sfx";

function harness(opts: { on?: boolean; voice?: boolean } = {}) {
  const played: string[] = [];
  let on = opts.on ?? true;
  let voice = opts.voice ?? false;
  const player = createSfxPlayer({
    isEnabled: () => on,
    isVoiceActive: () => voice,
    backend: { play: (src) => played.push(src) },
  });
  return {
    player,
    played,
    setOn: (v: boolean) => (on = v),
    setVoice: (v: boolean) => (voice = v),
  };
}

describe("sound effects player", () => {
  it("plays each event's own file", () => {
    const expected: Record<SfxEvent, string> = {
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
    for (const event of SFX_EVENTS) {
      const h = harness();
      h.player.play(event);
      expect(h.played).toEqual([expected[event]]);
    }
    expect(SFX_FILES).toEqual(expected);
  });

  it("plays nothing at all when the Settings switch is off", () => {
    const h = harness({ on: false });
    for (const event of SFX_EVENTS) h.player.play(event);
    expect(h.played).toEqual([]);
  });

  it("reads the switch at play time, so turning it off silences the very next event", () => {
    const h = harness();
    h.player.play("right");
    h.setOn(false);
    h.player.play("wrong");
    expect(h.played).toEqual(["/sfx/sfx-right.mp3"]);
  });

  it("skips an effect while Alphonso or Hector is speaking, and plays again once he stops", () => {
    const h = harness({ voice: true });
    h.player.play("right");
    expect(h.played).toEqual([]);
    h.setVoice(false);
    h.player.play("right");
    expect(h.played).toEqual(["/sfx/sfx-right.mp3"]);
  });

  it("fires once per event key, however often the screen asks", () => {
    const h = harness();
    h.player.play("lessonComplete", "finish:lesson-1");
    h.player.play("lessonComplete", "finish:lesson-1");
    h.player.play("lessonComplete", "finish:lesson-2");
    expect(h.played).toEqual(["/sfx/sfx-lesson-complete.mp3", "/sfx/sfx-lesson-complete.mp3"]);
  });

  it("a skipped event does not use up its key", () => {
    const h = harness({ voice: true });
    h.player.play("right", "q1");
    h.setVoice(false);
    h.player.play("right", "q1");
    expect(h.played).toEqual(["/sfx/sfx-right.mp3"]);
  });

  it("never throws when the audio backend fails", () => {
    const player = createSfxPlayer({
      isEnabled: () => true,
      isVoiceActive: () => false,
      backend: {
        play: () => {
          throw new Error("NotAllowedError");
        },
      },
    });
    expect(() => player.play("tap")).not.toThrow();
  });

  it("never throws when the voice check fails, and stays quiet then", () => {
    const played: string[] = [];
    const player = createSfxPlayer({
      isEnabled: () => true,
      isVoiceActive: () => {
        throw new Error("boom");
      },
      backend: { play: (src) => played.push(src) },
    });
    expect(() => player.play("tap")).not.toThrow();
    expect(played).toEqual([]);
  });
});

describe("the complete screen's cues", () => {
  it("leads with the lesson-complete jingle", () => {
    expect(finishCues({ xp: 0, unlocked: 0 })).toEqual([{ event: "lessonComplete", atMs: 0 }]);
  });

  it("adds the XP blip after the jingle, then the achievement as its card lands", () => {
    expect(finishCues({ xp: 12, unlocked: 1 })).toEqual([
      { event: "lessonComplete", atMs: 0 },
      { event: "xp", atMs: 1200 },
      { event: "achievement", atMs: 1700 },
    ]);
  });
});

describe("the Settings switch's storage", () => {
  it("is on by default", () => {
    const store = new Map<string, string>();
    expect(readSoundEffectsOn(memoryStorage(store))).toBe(true);
  });

  it("remembers off, and on again", () => {
    const store = new Map<string, string>();
    writeSoundEffectsOn(false, memoryStorage(store));
    expect(store.get(SOUND_EFFECTS_STORAGE_KEY)).toBe("off");
    expect(readSoundEffectsOn(memoryStorage(store))).toBe(false);
    writeSoundEffectsOn(true, memoryStorage(store));
    expect(readSoundEffectsOn(memoryStorage(store))).toBe(true);
  });

  it("falls back to on when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readSoundEffectsOn(broken)).toBe(true);
    expect(() => writeSoundEffectsOn(false, broken)).not.toThrow();
  });
});

function memoryStorage(store: Map<string, string>) {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}

describe("the call-start cue and Alphonso's first line", () => {
  it("says how long is left of the call-start sound, so his opening line can wait for it", () => {
    let t = 1000;
    const player = createSfxPlayer({
      isEnabled: () => true,
      isVoiceActive: () => false,
      backend: { play: () => {} },
      now: () => t,
    });
    expect(player.callCueRemainingMs()).toBe(0);
    player.play("callStart");
    t = 1100;
    expect(player.callCueRemainingMs()).toBe(630);
    t = 5000;
    expect(player.callCueRemainingMs()).toBe(0);
  });

  it("has nothing to wait for when the switch is off", () => {
    const player = createSfxPlayer({
      isEnabled: () => false,
      isVoiceActive: () => false,
      backend: { play: () => {} },
      now: () => 0,
    });
    player.play("callStart");
    expect(player.callCueRemainingMs()).toBe(0);
  });
});

describe("is a voice playing?", () => {
  it("counts the lesson's spoken lines (speechSynthesis) as a voice", async () => {
    const { isVoiceActive } = await import("./sfx");
    const g = globalThis as { window?: unknown };
    const had = "window" in g;
    const before = g.window;
    try {
      g.window = { speechSynthesis: { speaking: true } };
      expect(isVoiceActive()).toBe(true);
      g.window = { speechSynthesis: { speaking: false } };
      expect(isVoiceActive()).toBe(false);
    } finally {
      if (had) g.window = before;
      else delete g.window;
    }
  });
});

describe("waitForCallCue", () => {
  it("holds the opening line until the call-start sound is over, and not at all otherwise", async () => {
    vi.useFakeTimers();
    try {
      const { playSfx, waitForCallCue } = await import("./sfx");
      let done = false;
      void waitForCallCue().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(true);

      expect(playSfx("callStart")).toBe(true);
      done = false;
      void waitForCallCue().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(600);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
