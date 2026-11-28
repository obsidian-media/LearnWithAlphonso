import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KNOWN_OPS_EVENTS,
  OPS_EVENT_THRESHOLDS,
  REHEARSAL_USAGE_EVENT_NAMES,
  opsStatus,
  thresholdFor,
} from "./ops-events-config";

const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("./ops-events.server", () => ({
  OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS: 500,
  recordOpsEvent: async (...args: unknown[]) => {
    h.rows.push(args);
  },
}));

const { REHEARSAL_USAGE_EVENTS, recordRehearsalUsage, rehearsalUsageDetail } =
  await import("./rehearsal-usage.server");

beforeEach(() => {
  h.rows = [];
});

describe("rehearsal usage counts", () => {
  it("writes the event and ONE closed-list label, with no account and the short success-path wait", async () => {
    await recordRehearsalUsage("rehearsal_created", { source: "intake" });
    await recordRehearsalUsage("rehearsal_stage_finished", { stage: "hard_moments" });
    await recordRehearsalUsage("rehearsal_outcome", { choice: "moved" });
    await recordRehearsalUsage("rehearsal_paywall", { reason: "free_runs" });
    expect(h.rows).toEqual([
      ["rehearsal_created", { source: "intake" }, null, 500],
      ["rehearsal_stage_finished", { stage: "hard_moments" }, null, 500],
      ["rehearsal_outcome", { choice: "moved" }, null, 500],
      ["rehearsal_paywall", { reason: "free_runs" }, null, 500],
    ]);
  });

  it("drops a label that is not on the closed list, so free text can never be written", async () => {
    expect(rehearsalUsageDetail("rehearsal_created", { source: "my boss Maria" })).toBeNull();
    // @ts-expect-error a value off the list is a type error too
    await recordRehearsalUsage("rehearsal_outcome", { choice: "I was nervous about the salary" });
    // @ts-expect-error the wrong key for the event
    await recordRehearsalUsage("rehearsal_created", { text: "hello" });
    expect(h.rows).toEqual([]);
  });

  it("the names the System health page lists are exactly the ones emitted, and they never alert or turn amber", () => {
    expect([...REHEARSAL_USAGE_EVENTS].sort()).toEqual([...REHEARSAL_USAGE_EVENT_NAMES].sort());
    for (const e of REHEARSAL_USAGE_EVENT_NAMES) {
      expect(KNOWN_OPS_EVENTS).toContain(e);
      expect(OPS_EVENT_THRESHOLDS[e]).toBeDefined();
      expect(opsStatus(e, 1_000_000)).toBe("green");
      expect(thresholdFor(e).alertPerHour).toBeGreaterThan(1_000_000);
    }
  });
});
