/**
 * Learner-facing copy for hands-free mode. The same words as iOS (`HandsFreeCopy`), except the one clause that is
 * true on iOS and not here: the web works only while this page is open and awake, so the first-use note says so
 * instead of "also with the screen locked".
 */
import type { HandsFreeStatus } from "./hands-free-loop";

export const HANDS_FREE_TOGGLE = "Hands-free";
export const HANDS_FREE_FIRST_USE_TITLE = "Talk without holding the button";
/** Remembers that the once-per-device note was shown (the same key as iOS and Android). Hector and Practice share it. */
export const HANDS_FREE_NOTE_SEEN_KEY = "handsFree.safetyNoteSeen.v2";
export const HANDS_FREE_FIRST_USE_CONFIRM = "Turn on hands-free";
export const HANDS_FREE_FIRST_USE_CANCEL = "Cancel";
export const HANDS_FREE_PAUSE = "Pause";
export const HANDS_FREE_RESUME = "Resume";

export function handsFreeFirstUseBody(partner: string): string {
  return `${partner} listens after each reply and answers when you pause, while this page stays open. It pauses after 8 seconds of quiet, after background noise, and after 20 turns, and anything it hears is sent for transcription like a held recording. Don't use it while driving or anywhere you need your full attention. Best with earbuds or a quiet room.`;
}

const LINES = {
  listening: "Listening. Just talk.",
  hearing: "Hearing you...",
  pausedByLearner: "Hands-free is paused.",
  pausedNoSpeech: "Paused because nobody spoke. Tap Resume to keep talking.",
  pausedFailure: "Paused after a problem. Tap Resume to try again.",
  pausedLongTurn: "Paused after a very long turn. Tap Resume to keep talking.",
  pausedNoWords: "Paused because it only heard background noise. Tap Resume to keep talking.",
  pausedTurnLimit: "Paused after 20 turns. Tap Resume to keep talking.",
  pausedInterrupted: "Paused because the audio was interrupted. Tap Resume to keep talking.",
} as const;

export function handsFreeStatusLine(status: HandsFreeStatus, partner = "Hector"): string | null {
  switch (status.kind) {
    case "off":
      return null;
    case "waiting":
      return `${partner} is replying...`;
    case "listening":
      return LINES.listening;
    case "hearing":
      return LINES.hearing;
    case "paused":
      switch (status.reason) {
        case "byLearner":
          return LINES.pausedByLearner;
        case "noSpeech":
          return LINES.pausedNoSpeech;
        case "failure":
          return LINES.pausedFailure;
        case "longTurn":
          return LINES.pausedLongTurn;
        case "noWords":
          return LINES.pausedNoWords;
        case "turnLimit":
          return LINES.pausedTurnLimit;
        case "interrupted":
          return LINES.pausedInterrupted;
      }
  }
}
