import type { PlayOutcome, VoicePlayback } from "./voice-playback";

/**
 * What the call screen needs to know about a spoken reply.
 *  - `speaking`: Hector's voice is on (the clip or the device voice), or he is about to be heard.
 *  - `awaitingTap`: the reply could not be played by itself (the browser wants a tap). The "Tap to hear Hector"
 *    button shows, and hands-free must NOT open the mic until the reply was heard or skipped.
 */
export type ReplyVoiceState = { speaking: boolean; awaitingTap: boolean };

/** A device voice that neither starts nor fails within this long is treated as failed. */
export const DEVICE_VOICE_START_MS = 3000;

export type ReplyVoiceDeps = {
  playback: VoicePlayback;
  /** Speaks with the device voice; returns false where the device cannot speak. */
  speakDevice: (
    text: string,
    lang: string,
    cb: { onStart?: () => void; onEnd: () => void; onError: (reason?: string) => void },
  ) => boolean;
  cancelDevice: () => void;
  /** Reports a failed playback (no text, no user data: a surface name, a reason and an error name). */
  report: (failure: { surface: string; reason: string; errorName?: string }) => void;
  onChange: (state: ReplyVoiceState) => void;
  surface: string;
};

export type Reply = {
  text: string;
  lang: string;
  /** The spoken reply; null when the server could not make audio (the device voice then speaks). */
  clip: Blob | null;
  /**
   * The reply in order, when it is made in pieces (the first sentence, then the rest): each piece's clip is already
   * being fetched, and the first one plays as soon as it is ready while the next is still on its way. A clip that
   * resolves to null or rejects counts as "no audio" and the device voice reads that piece and the ones after it.
   * Replaces `clip` when present.
   */
  parts?: { text: string; clip: Promise<Blob | null> }[];
};

/**
 * Plays a reply so it is ALWAYS heard when the device can make a sound, and so the call never moves on over a reply
 * that was not:
 *  1. the clip plays on the persistent, already unlocked element;
 *  2. if the browser refuses (or the clip breaks), the device voice reads it, and a "Tap to hear" button stays
 *     until the learner has heard it (the tap is a gesture, so it works where the automatic start did not);
 *  3. `awaitingTap` holds hands-free shut for that whole time; `skip()` (a press on the mic, a typed message)
 *     releases it.
 */
export function createReplyVoice(deps: ReplyVoiceDeps) {
  let generation = 0;
  let pending: Reply | null = null;
  let state: ReplyVoiceState = { speaking: false, awaitingTap: false };

  const set = (next: Partial<ReplyVoiceState>) => {
    state = { ...state, ...next };
    deps.onChange(state);
  };

  const heard = (gen: number) => {
    if (gen !== generation) return;
    pending = null;
    set({ speaking: false, awaitingTap: false });
  };

  let startTimer: ReturnType<typeof setTimeout> | null = null;
  const clearStartTimer = () => {
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
  };

  /**
   * The clip could not play (or there is none): the device voice reads the line from piece `from` on, and the "Tap
   * to hear" button shows, because a tap is what lets a browser play. A tap can only help if there is a clip to
   * replay (`hasClip`), or if the browser refused the device voice for want of a gesture ("not-allowed"). A device
   * that simply cannot speak, with no clip, releases the call instead of holding hands-free shut for a reply nothing
   * can say.
   */
  const fallback = (reply: Reply, gen: number, from: number, hasClip: boolean) => {
    // Visible at once: even a device voice that the browser also refuses leaves the learner a way to hear him.
    set({ speaking: true, awaitingTap: true });
    const failed = (reason?: string) => {
      clearStartTimer();
      if (gen !== generation) return;
      if (hasClip || reason === "not-allowed") set({ speaking: false, awaitingTap: true });
      else heard(gen);
    };
    clearStartTimer();
    const rest = reply.parts
      ? reply.parts
          .slice(from)
          .map((p) => p.text)
          .join(" ")
      : reply.text;
    const started = deps.speakDevice(rest, reply.lang, {
      onStart: clearStartTimer,
      onEnd: () => {
        clearStartTimer();
        heard(gen);
      },
      onError: failed,
    });
    if (!started) return failed();
    startTimer = setTimeout(() => failed("no-start"), DEVICE_VOICE_START_MS);
  };

  const run = async (reply: Reply, gen: number, fromTap: boolean) => {
    const parts = reply.parts ?? [{ text: reply.text, clip: Promise.resolve(reply.clip) }];
    let hasClip = false;
    for (let i = 0; i < parts.length; i += 1) {
      const clip = await parts[i]!.clip.catch(() => null);
      if (gen !== generation) return;
      if (!clip) {
        if (!fromTap) deps.report({ surface: deps.surface, reason: "no_audio" });
        return fallback(reply, gen, i, hasClip);
      }
      hasClip = true;
      const outcome: PlayOutcome = await deps.playback.play(clip, {
        onPlaying: () => {
          if (gen === generation) set({ speaking: true, awaitingTap: false });
        },
      });
      if (gen !== generation) return;
      if (outcome.result === "stopped") return heard(gen);
      if (outcome.result !== "ended") {
        deps.report({
          surface: deps.surface,
          reason: outcome.result === "blocked" ? "play_blocked" : "play_error",
          errorName: outcome.errorName,
        });
        return fallback(reply, gen, i, hasClip);
      }
    }
    heard(gen);
  };

  return {
    /** Speaks a reply. Never rejects. */
    async say(reply: Reply): Promise<void> {
      generation += 1;
      clearStartTimer();
      deps.playback.stop();
      deps.cancelDevice();
      pending = reply;
      set({ speaking: true, awaitingTap: false });
      await run(reply, generation, false);
    },

    /** The "Tap to hear Hector" button. Must run synchronously inside the tap. */
    replay(): void {
      const reply = pending;
      if (!reply) return;
      generation += 1;
      clearStartTimer();
      deps.playback.stop();
      deps.cancelDevice();
      set({ speaking: true, awaitingTap: false });
      void run(reply, generation, true);
    },

    /** The learner moved on (pressed the mic, sent a message, skipped): the reply counts as heard. */
    skip(): void {
      generation += 1;
      clearStartTimer();
      deps.playback.stop();
      deps.cancelDevice();
      pending = null;
      set({ speaking: false, awaitingTap: false });
    },

    /** Whether a reply is waiting for a tap (for the button's label). */
    hasPending: () => pending !== null,
  };
}

export type ReplyVoice = ReturnType<typeof createReplyVoice>;
