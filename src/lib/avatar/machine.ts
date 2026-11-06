import { browsAt, visemeAt, type Brows, type LipSyncPlan } from "./lipsync";
import type { Viseme } from "./visemes";

export type Reaction = "happy" | "encouraging";

/** What the reply said about the learner's last turn. Anything unknown reads as "none". */
export type ReplyVerdict = "correct" | "corrected" | "none";

export function parseVerdict(wire: unknown): ReplyVerdict {
  return wire === "correct" || wire === "corrected" ? wire : "none";
}

export type AvatarMode =
  "idle" | "listening" | "thinking" | "speaking" | "reacting:happy" | "reacting:encouraging";

/** The voice session's phase, as on iOS (VoicePhase). `generation` tells two turns apart. */
export type PhaseKind =
  | "idle"
  | "requestingPermission"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "failed";
export type VoicePhase = { kind: PhaseKind; generation?: number };

/** What the avatar's face shows right now. Body motion (breathing, sway, ears, glint) is separate. */
export type AvatarPose = { mouth: Viseme; brows: Brows };

/** Where the reply's audio is, and the plan for its words. */
export type SpeechPosition = { plan: LipSyncPlan; time: number };

/** Brows stay up this long after a loud moment. */
export const LOUD_BROW_HOLD = 0.5;
/** Average input level above which the learner counts as loud, in dBFS. */
export const LOUD_THRESHOLD_DBFS = -20;
/** A reaction (happy or encouraging) lasts about this long. */
export const REACTION_DURATION = 1.2;

function samePhase(a: VoicePhase, b: VoicePhase): boolean {
  return a.kind === b.kind && (a.generation ?? 0) === (b.generation ?? 0);
}

function replyIsInFlight(kind: PhaseKind): boolean {
  return kind === "transcribing" || kind === "thinking" || kind === "speaking";
}

/**
 * The avatar's state machine. It follows the voice session's phase (so interruptions come for free) and turns it
 * plus a few inputs into a face. The learner talking never moves his mouth.
 */
export class AvatarMachine {
  mode: AvatarMode = "idle";
  private lastPhase: VoicePhase | null = null;
  private browsRaisedUntil = -Infinity;
  private reactionUntil = -Infinity;
  /** The reaction waiting for the reply to finish: played when the session goes quiet after it, dropped otherwise. */
  private pendingReaction: Reaction | null = null;

  /** Call every frame with the session's current phase; only a change does anything. */
  update(phase: VoicePhase, now: number): void {
    if (this.lastPhase && samePhase(phase, this.lastPhase)) return;
    this.lastPhase = phase;
    let next: AvatarMode;
    switch (phase.kind) {
      case "idle":
      case "failed":
        next = "idle";
        break;
      case "requestingPermission":
      case "recording":
        next = "listening";
        break;
      case "transcribing":
      case "thinking":
        next = "thinking";
        break;
      case "speaking":
        next = "speaking";
        break;
    }
    this.mode = next;
    if (next !== "listening") this.browsRaisedUntil = -Infinity;
    // The reaction comes after the reply has been spoken (or shown, when it has no audio): the session is quiet
    // again and the reply was a real answer. Any other move (a new press, a failure) drops it.
    if (phase.kind === "idle" && this.pendingReaction) {
      const reaction = this.pendingReaction;
      this.pendingReaction = null;
      this.react(reaction, now);
    } else if (!replyIsInFlight(phase.kind)) {
      this.pendingReaction = null;
    }
  }

  /** A moment of the learner's voice while they speak. */
  heard(levelDBFS: number, now: number): void {
    if (this.mode !== "listening" || !(levelDBFS > LOUD_THRESHOLD_DBFS)) return;
    this.browsRaisedUntil = now + LOUD_BROW_HOLD;
  }

  /** The reply's verdict. Call once, when the reply arrives: right gets a happy face, corrected an encouraging one. */
  replyArrived(verdict: ReplyVerdict): void {
    this.pendingReaction =
      verdict === "correct" ? "happy" : verdict === "corrected" ? "encouraging" : null;
  }

  /** A short reaction to the learner's answer. */
  react(reaction: Reaction, now: number): void {
    this.mode = reaction === "happy" ? "reacting:happy" : "reacting:encouraging";
    this.reactionUntil = now + REACTION_DURATION;
  }

  pose(now: number, speech: SpeechPosition | null): AvatarPose {
    switch (this.mode) {
      case "idle":
        return { mouth: "closed", brows: "neutral" };
      case "listening":
        return { mouth: "closed", brows: now < this.browsRaisedUntil ? "raised" : "neutral" };
      case "thinking":
        return { mouth: "closed", brows: "lowered" };
      case "speaking":
        if (!speech) return { mouth: "closed", brows: "neutral" };
        return {
          mouth: visemeAt(speech.plan, speech.time),
          brows: browsAt(speech.plan, speech.time),
        };
      case "reacting:happy":
        return now < this.reactionUntil
          ? { mouth: "ee", brows: "raised" }
          : { mouth: "closed", brows: "neutral" };
      case "reacting:encouraging":
        return now < this.reactionUntil
          ? { mouth: "talk", brows: "neutral" }
          : { mouth: "closed", brows: "neutral" };
    }
  }
}
