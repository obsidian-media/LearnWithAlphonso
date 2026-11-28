/**
 * How long the learner took to start answering, for the rehearsal "pause" note. Pure, no I/O: the call screen tells it
 * three things (the partner's audio began, the partner's audio ended, the learner started speaking) and it keeps one
 * number per learner reply.
 *
 * "Started speaking" is the moment the recorder starts. Held press: the tap. Hands-free: the loop opens the recorder on
 * the first voice activity, so it is the first sound. Only a reply that follows partner audio heard to its end is timed:
 * a learner who starts over the partner (before the audio ended), a second try after a failed turn, or a call with the
 * voice switched off give no number, never a wrong one. The numbers are sent as `replyLatenciesMs` and the server
 * keeps two counts; nothing here is stored.
 */
import {
  MAX_REPLY_LATENCIES,
  MAX_REPLY_LATENCY_MS,
  parseReplyLatencies,
} from "./rehearsal-speaking";

export type ReplyLatencyTracker = {
  /** The partner's audio began (a pending end is forgotten). */
  partnerAudioStarted: () => void;
  /** The partner's audio ended: the clock starts. */
  partnerAudioEnded: () => void;
  /** The learner started speaking: stops the clock, once per partner turn. */
  learnerStarted: () => void;
  /** The timings so far, in order; null when there is nothing the server would accept. */
  latencies: () => number[] | null;
};

export function createReplyLatencyTracker(
  now: () => number = () => performance.now(),
): ReplyLatencyTracker {
  let endedAt: number | null = null;
  const out: number[] = [];
  return {
    partnerAudioStarted: () => {
      endedAt = null;
    },
    partnerAudioEnded: () => {
      endedAt = now();
    },
    learnerStarted: () => {
      if (endedAt === null) return;
      const ms = Math.min(MAX_REPLY_LATENCY_MS, Math.max(0, Math.round(now() - endedAt)));
      endedAt = null;
      if (out.length < MAX_REPLY_LATENCIES) out.push(ms);
    },
    latencies: () => parseReplyLatencies(out),
  };
}
