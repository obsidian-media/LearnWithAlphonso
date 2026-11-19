import { describe, expect, it, vi } from "vitest";
import { sweepOpsAlerts, type OpsAlertDb, type OpsAlertDeps } from "./ops-alert-sweep.server";
import { OPS_EVENT_THRESHOLDS, opsStatus } from "./ops-events-config";

const NOW = new Date("2026-11-20T12:00:00Z");
const HOUR = 3_600_000;

type Sum = { event: string; count_1h: number; count_24h: number };

/** An in-memory ops_event_alerts with the same claim semantics as the real table (primary key on event). */
function make(opts: {
  summary: Sum[];
  alerts?: Record<string, string>;
  send?: () => Promise<void>;
  ownerEmail?: string;
  from?: string;
}) {
  const alerts: Record<string, string> = { ...(opts.alerts ?? {}) };
  const sent: { subject: string; text: string }[] = [];
  const db: OpsAlertDb = {
    rpc: async () => ({ data: opts.summary, error: null }),
    from: () => ({
      select: () => ({
        eq: (_c, event) => ({
          maybeSingle: async () => ({
            data: alerts[event] ? { last_alert_at: alerts[event]! } : null,
            error: null,
          }),
        }),
      }),
      insert: async (row) => {
        if (alerts[row.event]) return { error: { message: "duplicate key", code: "23505" } };
        alerts[row.event] = row.last_alert_at;
        return { error: null };
      },
      update: (row) => ({
        eq: (_c, event) => ({
          eq: (_c2, prev) => ({
            select: async () => {
              if (alerts[event] !== prev) return { data: [], error: null };
              alerts[event] = row.last_alert_at;
              return { data: [{ event }], error: null };
            },
          }),
        }),
      }),
      delete: () => ({
        eq: async (_c, event) => {
          delete alerts[event];
        },
      }),
    }),
  };
  const deps: OpsAlertDeps = {
    db,
    now: () => NOW,
    send: async (m) => {
      if (opts.send) await opts.send();
      sent.push(m);
    },
    ownerEmail: opts.ownerEmail ?? "owner@example.com",
    from: opts.from ?? "Alphonso <a@example.com>",
  };
  return { deps, alerts, sent };
}

const over = (event = "hearts_settlement_failed"): Sum => ({
  event,
  count_1h: OPS_EVENT_THRESHOLDS[event]!.alertPerHour,
  count_24h: 9,
});

describe("sweepOpsAlerts", () => {
  it("emails once when an event crosses its hourly threshold, and names counts only", async () => {
    const t = make({ summary: [over()] });
    const r = await sweepOpsAlerts(t.deps);
    expect(r.alerted).toEqual(["hearts_settlement_failed"]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.text).toContain(
      "hearts_settlement_failed: 3 in the last hour, 9 in the last 24",
    );
    expect(t.alerts.hearts_settlement_failed).toBe(NOW.toISOString());
  });

  it("does not email below the threshold", async () => {
    const t = make({ summary: [{ event: "hearts_settlement_failed", count_1h: 2, count_24h: 2 }] });
    expect((await sweepOpsAlerts(t.deps)).alerted).toEqual([]);
    expect(t.sent).toHaveLength(0);
  });

  it("de-dupes: a second pass within 24 hours stays quiet, then after 24 hours it alerts again", async () => {
    const t = make({ summary: [over()] });
    await sweepOpsAlerts(t.deps);
    await sweepOpsAlerts(t.deps);
    expect(t.sent).toHaveLength(1);
    // 23 hours after the first alert: still quiet.
    const recent = make({
      summary: [over()],
      alerts: { hearts_settlement_failed: new Date(NOW.getTime() - 23 * HOUR).toISOString() },
    });
    await sweepOpsAlerts(recent.deps);
    expect(recent.sent).toHaveLength(0);
    // 25 hours after: alerts again and moves the clock.
    const old = make({
      summary: [over()],
      alerts: { hearts_settlement_failed: new Date(NOW.getTime() - 25 * HOUR).toISOString() },
    });
    expect((await sweepOpsAlerts(old.deps)).alerted).toEqual(["hearts_settlement_failed"]);
    expect(old.sent).toHaveLength(1);
    expect(old.alerts.hearts_settlement_failed).toBe(NOW.toISOString());
  });

  it("de-dupes per event: one quiet event does not silence another", async () => {
    const t = make({
      summary: [over("hearts_settlement_failed"), over("lesson_result_finalize_failed")],
      alerts: { hearts_settlement_failed: new Date(NOW.getTime() - HOUR).toISOString() },
    });
    expect((await sweepOpsAlerts(t.deps)).alerted).toEqual(["lesson_result_finalize_failed"]);
  });

  it("a failed send releases the claim so the next pass retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = make({
      summary: [over()],
      send: async () => {
        throw new Error("resend down");
      },
    });
    const r = await sweepOpsAlerts(t.deps);
    expect(r.alerted).toEqual([]);
    expect(t.alerts).toEqual({});
    // and a failed re-alert restores the previous time instead of deleting it
    const prev = new Date(NOW.getTime() - 30 * HOUR).toISOString();
    const t2 = make({
      summary: [over()],
      alerts: { hearts_settlement_failed: prev },
      send: async () => {
        throw new Error("resend down");
      },
    });
    await sweepOpsAlerts(t2.deps);
    expect(t2.alerts.hearts_settlement_failed).toBe(prev);
  });

  it("with no owner email it logs and does not claim", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = make({ summary: [over()], ownerEmail: "" });
    const r = await sweepOpsAlerts(t.deps);
    expect(r.skipped).toBe(true);
    expect(t.alerts).toEqual({});
    expect(t.sent).toHaveLength(0);
  });
});

describe("opsStatus", () => {
  it("is green, amber, red by the 24 hour count, from the one config", () => {
    const t = OPS_EVENT_THRESHOLDS.hearts_settlement_failed!;
    expect(opsStatus("hearts_settlement_failed", 0)).toBe("green");
    expect(opsStatus("hearts_settlement_failed", t.amberAt)).toBe("amber");
    expect(opsStatus("hearts_settlement_failed", t.redAt)).toBe("red");
    expect(opsStatus("some_new_event", 0)).toBe("green");
    expect(opsStatus("some_new_event", 1)).toBe("amber");
  });
});
