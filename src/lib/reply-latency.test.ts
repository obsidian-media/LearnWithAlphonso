import { describe, expect, it } from "vitest";
import { createReplyLatencyTracker } from "./reply-latency";

const clock = () => {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};

describe("the reply latency tracker", () => {
  it("times from the end of the partner's audio to the learner starting", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioStarted();
    c.tick(3000); // the partner speaks: not counted
    tr.partnerAudioEnded();
    c.tick(4200);
    tr.learnerStarted();
    tr.partnerAudioStarted();
    c.tick(1000);
    tr.partnerAudioEnded();
    c.tick(900);
    tr.learnerStarted();
    expect(tr.latencies()).toEqual([4200, 900]);
  });

  it("a learner who starts before any audio ended gives no number", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.learnerStarted();
    expect(tr.latencies()).toBeNull();
    tr.partnerAudioStarted();
    c.tick(500);
    tr.learnerStarted(); // talking over the partner
    expect(tr.latencies()).toBeNull();
  });

  it("a second start in the same turn (a retry after a failed turn) is not timed again", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(2000);
    tr.learnerStarted();
    c.tick(9000);
    tr.learnerStarted();
    expect(tr.latencies()).toEqual([2000]);
  });

  it("a new partner audio forgets an unanswered end", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(2000);
    tr.partnerAudioStarted();
    c.tick(2000);
    tr.learnerStarted();
    expect(tr.latencies()).toBeNull();
  });

  it("caps a long wait at a minute and keeps integers", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    tr.partnerAudioEnded();
    c.tick(500_000);
    tr.learnerStarted();
    expect(tr.latencies()).toEqual([60000]);
    tr.partnerAudioEnded();
    c.tick(1234.6);
    tr.learnerStarted();
    expect(tr.latencies()).toEqual([60000, 1235]);
  });

  it("keeps at most 60 timings", () => {
    const c = clock();
    const tr = createReplyLatencyTracker(c.now);
    for (let i = 0; i < 70; i++) {
      tr.partnerAudioEnded();
      c.tick(10);
      tr.learnerStarted();
    }
    expect(tr.latencies()).toHaveLength(60);
  });
});
