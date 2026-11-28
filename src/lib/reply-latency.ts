/**
 * How long the learner took to start answering, for the rehearsal "pause" note. Pure, no I/O: the call screen tells it
 * when the partner's audio began and ended and when the learner's recorder started, and it keeps one number per
 * learner reply.
 *
 * "Started speaking" is the moment the recorder actually starts (after any permission prompt), not the tap. Hands-free:
 * the loop opens the recorder on the first voice activity. The gap is held PENDING and only enters the list when the
 * reply is sent (`commit`): a failed transcription, an empty capture or a cancelled attempt records nothing, and the
 * retry measures from the same partner end. Typed sends, a partner turn with no audio and a barge-in (the learner cut
 * the partner off) `clear` the clock, so they give no number, never a wrong one. The numbers are sent as
 * `replyLatenciesMs` and the server keeps two counts; nothing here is stored.
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
  /** The recorder started: the gap since the partner's end becomes pending (not yet counted). */
  learnerStarted: () => void;
  /** The reply was sent: the pending gap enters the list and the clock stops. */
  commit: () => void;
  /** Forget the clock and any pending gap (typed send, no-audio turn, barge-in). */
  clear: () => void;
  /** The timings so far, in order; null when there is nothing the server would accept. */
  latencies: () => number[] | null;
};

export function createReplyLatencyTracker(
  now: () => number = () => performance.now(),
): ReplyLatencyTracker {
  let endedAt: number | null = null;
  let pending: number | null = null;
  const out: number[] = [];
  return {
    partnerAudioStarted: () => {
      endedAt = null;
      pending = null;
    },
    partnerAudioEnded: () => {
      endedAt = now();
      pending = null;
    },
    learnerStarted: () => {
      pending =
        endedAt === null
          ? null
          : Math.min(MAX_REPLY_LATENCY_MS, Math.max(0, Math.round(now() - endedAt)));
    },
    commit: () => {
      if (pending !== null && out.length < MAX_REPLY_LATENCIES) out.push(pending);
      pending = null;
      endedAt = null;
    },
    clear: () => {
      endedAt = null;
      pending = null;
    },
    latencies: () => parseReplyLatencies(out),
  };
}
