/**
 * Hands-free conversation for Hector and Practice: instead of holding the mic, the learner talks and the turn ends on
 * its own after a pause, then the next turn starts listening once the tutor has finished replying.
 *
 * A line-for-line port of the iOS `HandsFreeLoop` (ios/LearnWithAlphonsoKit/.../HandsFreeLoop.swift), with the same
 * state machine, events, effects and tuning numbers, so every platform behaves the same. Pure and clock-free: the
 * screen feeds it the voice phase and the recorder's level (dBFS) with a timestamp in seconds, and performs the
 * effects through the existing capture (`beginTurn` is a press, `endTurn` a release, `cancelTurn` an interruption).
 * Nothing here touches audio.
 *
 * Safety and privacy rules it enforces (each pauses hands-free; one tap resumes):
 * - a failure, a refused microphone, or the tab or microphone being lost;
 * - a turn in which nobody speaks for `noSpeechTimeout` (cancelled, nothing sent);
 * - a turn still going after `maxTurn` (cancelled, nothing sent: continuous sound for that long is a TV or a crowd
 *   far more often than a learner);
 * - a turn whose transcript came back empty (background noise, not speech);
 * - `maxTurnsWithoutTouch` turns in a row without the learner touching the screen.
 * So a noisy room cannot keep sending bystanders' audio indefinitely.
 */
import type { PhaseKind } from "./avatar/machine";

export type HandsFreeTuning = {
  /** How far above the measured background level counts as speech (dB). */
  speechAboveFloor: number;
  /** The background is measured over the first moment of each turn (the quietest sample wins), in seconds. */
  calibration: number;
  /** The background is never taken as louder than this (dBFS), so speech that starts at once cannot raise the threshold. */
  maximumBackground: number;
  /** Speech must be at least this loud whatever the background (dBFS). */
  minimumSpeechLevel: number;
  /** Loud for this long (seconds) before it counts as speech (filters taps and clicks). */
  speechOnset: number;
  /** Quiet for this long (seconds) after speech ends the turn. */
  endOfTurnSilence: number;
  /** Nothing said for this long (seconds): cancel the turn and pause hands-free. */
  noSpeechTimeout: number;
  /** A turn still going after this (seconds) is cancelled and hands-free pauses. */
  maxTurn: number;
  /** Readings below this are the recorder warming up (it reports -160 before any audio), not the room. */
  ignoreBelow: number;
  /** All-silent readings for this long (seconds; muted or noise-gated from the first frame) stop being warm-up and count as quiet. */
  silentGrace: number;
  /** Turns in a row without a touch before hands-free pauses. */
  maxTurnsWithoutTouch: number;
};

const BASE_TUNING: HandsFreeTuning = {
  speechAboveFloor: 14,
  calibration: 0.3,
  maximumBackground: -35,
  minimumSpeechLevel: -42,
  speechOnset: 0.2,
  endOfTurnSilence: 1.2,
  noSpeechTimeout: 8,
  maxTurn: 30,
  ignoreBelow: -100,
  silentGrace: 1,
  maxTurnsWithoutTouch: 20,
};

/** Hector: a free-form tutor with no stars, so a short pause ends the turn (1.2 s of quiet). */
export const HECTOR_TUNING: HandsFreeTuning = Object.freeze({ ...BASE_TUNING });

/**
 * Practice: a half sentence that gets sent is judged short or wrong and costs stars, and learners pause to find a word,
 * so the turn ends only after 2.5 s of quiet. The no-speech, long-turn and turns-without-touch limits are Hector's.
 */
export const PRACTICE_TUNING: HandsFreeTuning = Object.freeze({
  ...BASE_TUNING,
  endOfTurnSilence: 2.5,
});

export type HandsFreeEvent =
  | { type: "enable" }
  | { type: "disable" }
  /** The learner tapped pause or resume. */
  | { type: "togglePause" }
  /** The voice engine moved to a new phase. */
  | { type: "voicePhase"; phase: PhaseKind }
  /** One recorder level sample while recording. */
  | { type: "level"; dBFS: number; at: number }
  /** The finished turn's transcript was empty: it was noise, not speech. */
  | { type: "turnHadNoWords" }
  /** The tab was hidden, or the microphone was lost: nothing may listen until the learner resumes. */
  | { type: "audioInterrupted" };

export type HandsFreeEffect = "beginTurn" | "endTurn" | "cancelTurn";

export type PauseReason =
  "byLearner" | "noSpeech" | "failure" | "longTurn" | "noWords" | "turnLimit" | "interrupted";

export type HandsFreeStatus =
  | { kind: "off" }
  /** Waiting for the tutor, or for the voice engine to be ready. */
  | { kind: "waiting" }
  | { kind: "listening" }
  /** Speech detected in this turn. */
  | { kind: "hearing" }
  /** Paused by the learner, after a failure, or after nobody spoke. */
  | { kind: "paused"; reason: PauseReason };

const OFF: HandsFreeStatus = { kind: "off" };
const WAITING: HandsFreeStatus = { kind: "waiting" };
const LISTENING: HandsFreeStatus = { kind: "listening" };
const HEARING: HandsFreeStatus = { kind: "hearing" };
const paused = (reason: PauseReason): HandsFreeStatus => ({ kind: "paused", reason });

export class HandsFreeLoop {
  readonly tuning: HandsFreeTuning;
  status: HandsFreeStatus = OFF;
  private phase: PhaseKind = "idle";
  private turnStartedAt: number | null = null;
  private backgroundLevel: number | null = null;
  private loudSince: number | null = null;
  private lastLoudAt: number | null = null;
  private heardSpeech = false;
  /** True once a real (above ignoreBelow) reading has arrived this turn; before that, sub-floor readings are warm-up. */
  private warmedUp = false;
  /** When the first reading of the turn arrived (real or not): the silent grace counts from it. */
  private firstLevelAt: number | null = null;
  private turnEnding = false;
  private turnsWithoutTouch = 0;

  constructor(tuning: HandsFreeTuning = HECTOR_TUNING) {
    this.tuning = tuning;
  }

  get isOn(): boolean {
    return this.status.kind !== "off";
  }

  get isPaused(): boolean {
    return this.status.kind === "paused";
  }

  handle(event: HandsFreeEvent): HandsFreeEffect[] {
    switch (event.type) {
      case "enable": {
        if (this.status.kind !== "off") return [];
        this.status = WAITING;
        this.turnsWithoutTouch = 0;
        return this.startIfReady();
      }

      case "disable": {
        const wasRecording = this.isRecording;
        this.status = OFF;
        this.resetTurn();
        return wasRecording ? ["cancelTurn"] : [];
      }

      case "togglePause": {
        switch (this.status.kind) {
          case "off":
            return [];
          case "paused":
            this.status = WAITING;
            this.turnsWithoutTouch = 0;
            return this.startIfReady();
          default: {
            const wasRecording = this.isRecording;
            this.status = paused("byLearner");
            this.resetTurn();
            return wasRecording ? ["cancelTurn"] : [];
          }
        }
      }

      case "turnHadNoWords": {
        if (!this.isOn) return [];
        if (this.isPaused) return [];
        this.status = paused("noWords");
        return [];
      }

      case "audioInterrupted": {
        if (!this.isOn) return [];
        if (this.isPaused) return [];
        // The capture is cancelled by the caller; this only stops the next turn.
        this.status = paused("interrupted");
        this.resetTurn();
        return [];
      }

      case "voicePhase": {
        // Always recorded, even while off, so turning hands-free on mid-reply waits for the reply to end.
        const previous = this.phase;
        this.phase = event.phase;
        if (!this.isOn) return [];
        switch (event.phase) {
          case "recording":
            if (this.isPaused) return ["cancelTurn"];
            this.resetTurn();
            this.status = LISTENING;
            return [];
          case "failed":
            this.resetTurn();
            this.status = paused("failure");
            return [];
          case "idle":
            this.resetTurn();
            if (this.isPaused) return [];
            // Permission refused or the recorder never started: asking again would loop forever.
            if (previous === "requestingPermission") {
              this.status = paused("failure");
              return [];
            }
            // A turn just finished (reply played, or no reply audio): listen again.
            if (previous !== "idle") this.status = WAITING;
            return this.startIfReady();
          case "requestingPermission":
          case "transcribing":
          case "thinking":
          case "speaking":
            if (this.isPaused) return [];
            this.status = WAITING;
            return [];
        }
        return [];
      }

      case "level": {
        const { dBFS, at } = event;
        const t = this.tuning;
        if (!this.isRecording) return [];
        if (this.status.kind !== "listening" && this.status.kind !== "hearing") return [];
        if (this.turnEnding) return [];
        // Sub-floor readings are warm-up only until the first real reading; after that they are digital silence
        // (noise-gated headset, muted route): quiet, and the time checks must still run.
        const silent = !(dBFS >= t.ignoreBelow);
        if (this.firstLevelAt === null) this.firstLevelAt = at;
        if (silent && !this.warmedUp) {
          // Warm-up is ignored for the grace period; still silent after it is a quiet turn that began at the first frame.
          if (at - this.firstLevelAt < t.silentGrace) return [];
          this.turnStartedAt = this.firstLevelAt;
        }
        this.warmedUp = true;
        if (this.turnStartedAt === null) this.turnStartedAt = at;
        const started = this.turnStartedAt;

        // The background is the quietest level heard: during calibration, and afterwards only while nobody has
        // spoken. It can fall but never rise, and is capped, so the learner's own voice never becomes the floor.
        if (!silent && (at - started < t.calibration || !this.heardSpeech)) {
          this.backgroundLevel = Math.min(this.backgroundLevel ?? dBFS, dBFS, t.maximumBackground);
        }
        const threshold = Math.max(
          t.minimumSpeechLevel,
          (this.backgroundLevel ?? t.maximumBackground) + t.speechAboveFloor,
        );
        if (at - started < t.calibration) {
          // Still measuring the room: nothing counts as speech yet.
          this.loudSince = null;
        } else if (!silent && dBFS >= threshold) {
          if (this.loudSince === null) this.loudSince = at;
          this.lastLoudAt = at;
          if (at - this.loudSince >= t.speechOnset) {
            this.heardSpeech = true;
            this.status = HEARING;
          }
        } else {
          this.loudSince = null;
        }

        if (at - started >= t.maxTurn) {
          this.turnEnding = true;
          this.status = paused(this.heardSpeech ? "longTurn" : "noSpeech");
          return ["cancelTurn"];
        }
        if (
          this.heardSpeech &&
          this.lastLoudAt !== null &&
          at - this.lastLoudAt >= t.endOfTurnSilence
        ) {
          this.turnEnding = true;
          return ["endTurn"];
        }
        if (!this.heardSpeech && at - started >= t.noSpeechTimeout) {
          this.turnEnding = true;
          this.status = paused("noSpeech");
          return ["cancelTurn"];
        }
        return [];
      }
    }
  }

  private get isRecording(): boolean {
    return this.phase === "recording";
  }

  private startIfReady(): HandsFreeEffect[] {
    if (this.status.kind !== "waiting") return [];
    // The voice engine accepts a new press from idle or after a failure.
    if (this.phase !== "idle" && this.phase !== "failed") return [];
    this.turnsWithoutTouch += 1;
    if (this.turnsWithoutTouch > this.tuning.maxTurnsWithoutTouch) {
      this.status = paused("turnLimit");
      return [];
    }
    return ["beginTurn"];
  }

  private resetTurn(): void {
    this.turnStartedAt = null;
    this.backgroundLevel = null;
    this.loudSince = null;
    this.lastLoudAt = null;
    this.heardSpeech = false;
    this.warmedUp = false;
    this.firstLevelAt = null;
    this.turnEnding = false;
  }
}
