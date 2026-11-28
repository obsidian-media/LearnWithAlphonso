import { describe, expect, it } from "vitest";
import { createReplyLatencyTracker } from "./reply-latency";

const clock = () => {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};

describe("the reply latency tracker", () => {
  it("times from the end of the partner's audio to the recorder starting, once the reply is sent", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioStarted();
    c.tick(3000); // the partner speaks: not counted
    tr.partnerAudioEnded();
    c.tick(4200);
    tr.learnerStarted();
    expect(tr.latencies()).toBeNull(); // pending only: nothing sent yet
    tr.commit();
    tr.partnerAudioStarted();
    c.tick(1000);
    tr.partnerAudioEnded();
    c.tick(900);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toEqual([4200, 900]);
  });

  it("a failed or empty attempt records nothing, and the retry measures from the same partner end", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(2000);
    tr.learnerStarted(); // attempt 1: transcription fails, never committed
    c.tick(7000);
    tr.learnerStarted(); // attempt 2 (retry)
    expect(tr.latencies()).toBeNull();
    tr.commit();
    expect(tr.latencies()).toEqual([9000]);
  });

  it("a commit with no recorder start adds nothing", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(5000);
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("a typed send clears the clock: a later voice start gives no number", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(5000);
    tr.learnerStarted(); // a failed voice attempt ...
    tr.clear(); // ... then the learner types
    c.tick(5000);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("a partner turn with no audio clears the clock", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(5000);
    tr.clear(); // the next partner turn arrived with no audio (TTS off, fetch failed)
    c.tick(5000);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("barge-in (skip clears the clock and the audio end is swallowed) never makes a gap, even through fail and retry", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioStarted();
    c.tick(1500);
    tr.clear(); // the mic tap calls skipReply(); the screen then swallows the audio "end"
    c.tick(40);
    tr.learnerStarted(); // recording starts a moment later
    c.tick(3000);
    tr.learnerStarted(); // transcription failed; retry
    expect(tr.latencies()).toBeNull();
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("a talking-over start (before any audio ended) gives no number", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.learnerStarted();
    tr.commit();
    tr.partnerAudioStarted();
    c.tick(500);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("a new partner audio forgets an unanswered end", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(2000);
    tr.partnerAudioStarted();
    c.tick(2000);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toBeNull();
  });

  it("caps a long wait at a minute and keeps integers", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(500_000);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toEqual([60000]);
    tr.partnerAudioEnded();
    c.tick(1234.6);
    tr.learnerStarted();
    tr.commit();
    expect(tr.latencies()).toEqual([60000, 1235]);
  });

  it("never holds more timings than replies sent, and at most 60", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    let sent = 0;
    for (let i = 0; i < 70; i++) {
      tr.partnerAudioEnded();
      c.tick(10);
      tr.learnerStarted();
      if (i % 3 === 0) continue; // a failed attempt: no send
      tr.commit();
      sent++;
      expect(tr.latencies()?.length ?? 0).toBeLessThanOrEqual(sent);
    }
    expect(tr.latencies()).toHaveLength(Math.min(60, sent));
  });
});
