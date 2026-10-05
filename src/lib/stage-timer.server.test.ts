import { describe, expect, it, vi } from "vitest";
import { createStageTimer } from "./stage-timer.server";

/** A clock the test drives by hand, so durations are exact, not "roughly". */
function fakeClock(start = 1000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createStageTimer", () => {
  it("records how long each awaited stage took", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    const result = await timer.time("llm", async () => {
      clock.advance(250);
      return "reply";
    });
    expect(result).toBe("reply");
    expect(timer.stages()).toEqual({ llm: 250 });
  });

  it("still records a stage whose callback throws, and rethrows", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    await expect(
      timer.time("tts", async () => {
        clock.advance(40);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(timer.stages()).toEqual({ tts: 40 });
  });

  it("measures total from creation, not from the sum of stages", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    clock.advance(30); // unmeasured gap between stages
    await timer.time("llm", async () => clock.advance(100));
    clock.advance(20);
    expect(timer.totalMs()).toBe(150);
  });

  it("renders a Server-Timing header with a total entry and rounded durations", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    await timer.time("auth", async () => clock.advance(12.4));
    await timer.time("llm", async () => clock.advance(1500.6));
    expect(timer.serverTiming()).toBe("auth;dur=12, llm;dur=1501, total;dur=1513");
  });

  it("sums a stage that runs more than once instead of overwriting it", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    await timer.time("rpc", async () => clock.advance(10));
    await timer.time("rpc", async () => clock.advance(15));
    expect(timer.stages()).toEqual({ rpc: 25 });
  });

  it("logs one parseable line naming the route, status and every stage", async () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.now);
    await timer.time("llm", async () => clock.advance(900));
    const sink = vi.fn();
    timer.log("hector-respond", 200, sink);
    expect(sink).toHaveBeenCalledTimes(1);
    const line = String(sink.mock.calls[0][0]);
    expect(line).toBe("[ai-timing] route=hector-respond status=200 total=900ms llm=900ms");
  });
});
