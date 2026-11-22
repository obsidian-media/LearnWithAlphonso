import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveProbes, readHealth, timedProbe, type ProbeResult, type Probes } from "./health.server";

const NOW = new Date("2026-11-21T12:00:00Z");
const ok = (ms: number): ProbeResult => ({ ok: true, ms });
const probes = (database: ProbeResult, auth: ProbeResult): Probes => ({
  database: async () => database,
  auth: async () => auth,
});

type Rpc = Record<string, { data?: unknown; error?: { message: string } | null }>;
function fakeDb(opts: { rpc?: Rpc; aiSwitch?: { enabled: boolean } | null; opsFails?: boolean }) {
  const rpc = opts.rpc ?? {};
  return {
    rpc: async (name: string) => {
      if (name === "ops_events_summary")
        return opts.opsFails
          ? { data: null, error: { message: "boom" } }
          : { data: [], error: null };
      const r = rpc[name];
      return r ? { data: r.data ?? null, error: r.error ?? null } : { data: [], error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: opts.aiSwitch ?? null, error: null }) }),
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
        limit: async () => ({ data: [], error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const goodRpc: Rpc = {
  staff_sweep_status: {
    data: [
      {
        scheduled: true,
        last_run_at: "2026-11-21T11:55:00Z",
        last_status: "succeeded",
        runs_24h: 90,
        failed_24h: 1,
      },
    ],
  },
  staff_health_history: {
    data: [{ service: "database", day: "2026-11-21", checks: 3, ok_checks: 3 }],
  },
  staff_health_summary: { data: [{ service: "database", first_at: "2026-11-21T00:05:00Z" }] },
};
const ENV = {
  OPENROUTER_API_KEY: "sk-or-secret-value",
  REVENUECAT_METRICS_KEY: "rc-secret-value",
  REVENUECAT_PROJECT_ID: "proj-secret-id",
  LLM_CHAT_MODELS: "anthropic/claude-haiku-5.5, other/model",
};
const find = (d: Awaited<ReturnType<typeof readHealth>>, key: string) =>
  d.services.find((s) => s.key === key)!;

describe("timedProbe", () => {
  it("a probe that never answers is a timeout, with a reason", async () => {
    vi.useFakeTimers();
    const p = timedProbe(() => new Promise(() => {}), 50);
    await vi.advanceTimersByTimeAsync(60);
    const r = await p;
    vi.useRealTimers();
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("No answer within") });
  });
  it("an error answer and a throw are both failures with a reason, never the error text", async () => {
    expect(await timedProbe(async () => ({ failed: true }), 50, "bad")).toEqual({
      ok: false,
      reason: "bad",
    });
    expect(
      await timedProbe(
        async () => {
          throw new Error("secret detail");
        },
        50,
        "bad",
      ),
    ).toEqual({ ok: false, reason: "bad" });
  });
  it("a prompt answer is ok", async () => {
    expect((await timedProbe(async () => ({ failed: false }), 50)).ok).toBe(true);
  });
});

describe("liveProbes read through the service client", () => {
  it("database fails on an error answer; auth fails when listUsers errors", async () => {
    const db = {
      from: () => ({ select: () => ({ limit: async () => ({ error: { message: "x" } }) }) }),
      auth: { admin: { listUsers: async () => ({ error: { message: "x" } }) } },
    } as unknown as SupabaseClient;
    const p = liveProbes(db);
    expect((await p.database()).ok).toBe(false);
    expect((await p.auth()).ok).toBe(false);
  });
});

describe("readHealth", () => {
  it("a probe timeout is a degraded row with its reason, not an omitted one", async () => {
    const d = await readHealth(
      fakeDb({ rpc: goodRpc, aiSwitch: { enabled: true } }),
      ENV,
      NOW,
      probes({ ok: false, reason: "No answer within 3 seconds" }, ok(40)),
    );
    expect(find(d, "database")).toMatchObject({
      state: "degraded",
      reason: "No answer within 3 seconds",
      latencyMs: null,
    });
    expect(d.services.map((s) => s.key)).toEqual(["database", "auth", "payments", "ai", "jobs"]);
  });

  it("with no keys the AI provider and payments are not_connected, never healthy", async () => {
    const d = await readHealth(
      fakeDb({ rpc: goodRpc, aiSwitch: { enabled: true } }),
      {},
      NOW,
      probes(ok(5), ok(9)),
    );
    expect(find(d, "ai").state).toBe("not_connected");
    expect(find(d, "payments").state).toBe("not_connected");
  });

  it("with keys they are configured (no live test exists); the AI row names the model; the switch off is degraded; an unreadable switch is unknown", async () => {
    const run = (aiSwitch: { enabled: boolean } | null) =>
      readHealth(fakeDb({ rpc: goodRpc, aiSwitch }), ENV, NOW, probes(ok(5), ok(9)));
    const on = await run({ enabled: true });
    expect(find(on, "ai").state).toBe("configured");
    expect(find(on, "ai").detail).toBe("OpenRouter · anthropic/claude-haiku-5.5");
    expect(find(on, "payments").state).toBe("configured");
    expect(find(await run({ enabled: false }), "ai").state).toBe("degraded");
    expect(find(await run(null), "ai").state).toBe("unknown");
  });

  it("never returns an environment value, only presence and the model name", async () => {
    const d = await readHealth(
      fakeDb({ rpc: goodRpc, aiSwitch: { enabled: true } }),
      ENV,
      NOW,
      probes(ok(5), ok(9)),
    );
    const json = JSON.stringify(d);
    for (const secret of ["sk-or-secret-value", "rc-secret-value", "proj-secret-id"])
      expect(json).not.toContain(secret);
  });

  it("reports the two-step flag: enforced unless ADMIN_REQUIRE_AAL2 is exactly false", async () => {
    const run = (env: Record<string, string>) =>
      readHealth(fakeDb({ rpc: goodRpc }), env, NOW, probes(ok(1), ok(1)));
    expect((await run({})).aal2Enforced).toBe(true);
    expect((await run({ ADMIN_REQUIRE_AAL2: "true" })).aal2Enforced).toBe(true);
    const off = await run({ ADMIN_REQUIRE_AAL2: "false" });
    expect(off.aal2Enforced).toBe(false);
    expect(find(off, "auth").detail).toBe("Two-step (AAL2) not enforced");
  });

  it("history: stored days become bars with the real percentage; unreadable history is uptimeError, not zero", async () => {
    const d = await readHealth(fakeDb({ rpc: goodRpc }), {}, NOW, probes(ok(1), ok(1)));
    expect(find(d, "database").uptime?.percent).toBe(100);
    expect(find(d, "database").uptime?.daysWithData).toBe(1);
    expect(find(d, "auth").uptime?.percent).toBeNull();
    const broken = await readHealth(
      fakeDb({ rpc: { ...goodRpc, staff_health_history: { error: { message: "x" } } } }),
      {},
      NOW,
      probes(ok(1), ok(1)),
    );
    expect(find(broken, "database").uptime).toBeNull();
    expect(find(broken, "database").uptimeError).toBe(true);
  });

  it("the jobs row comes from the job log: failures in 24 h and the last run", async () => {
    const d = await readHealth(fakeDb({ rpc: goodRpc }), {}, NOW, probes(ok(1), ok(1)));
    expect(find(d, "jobs").state).toBe("healthy");
    expect(find(d, "jobs").jobs).toEqual({
      lastRunAt: "2026-11-21T11:55:00Z",
      runs24h: 90,
      failed24h: 1,
    });
    const unreadable = await readHealth(
      fakeDb({ rpc: { ...goodRpc, staff_sweep_status: { error: { message: "x" } } } }),
      {},
      NOW,
      probes(ok(1), ok(1)),
    );
    expect(find(unreadable, "jobs").state).toBe("unknown");
  });

  it("the ops events are still read; when they cannot be, the rest still answers", async () => {
    const good = await readHealth(fakeDb({ rpc: goodRpc }), {}, NOW, probes(ok(1), ok(1)));
    expect(good.ops?.events.length).toBeGreaterThan(0);
    expect(good.opsError).toBeNull();
    const bad = await readHealth(
      fakeDb({ rpc: goodRpc, opsFails: true }),
      {},
      NOW,
      probes(ok(1), ok(1)),
    );
    expect(bad.ops).toBeNull();
    expect(bad.opsError).toBe("Could not read the events.");
    expect(bad.services).toHaveLength(5);
  });

  it("stamps checkedAt with the time of the read", async () => {
    const d = await readHealth(fakeDb({ rpc: goodRpc }), {}, NOW, probes(ok(1), ok(1)));
    expect(d.checkedAt).toBe("2026-11-21T12:00:00.000Z");
  });
});
