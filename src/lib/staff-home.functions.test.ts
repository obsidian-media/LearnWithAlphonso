import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable } from "./__testutils__/supabase-mock";
import { setStaff } from "./__testutils__/staff-harness";

vi.mock(
  "./staff-middleware",
  async () => (await import("./__testutils__/staff-harness")).staffMiddlewareMock,
);
vi.mock(
  "@tanstack/react-start",
  async () => (await import("./__testutils__/staff-harness")).startMock,
);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("./staff-rate-limit", async () => {
  const real = await vi.importActual<typeof import("./staff-rate-limit")>("./staff-rate-limit");
  return {
    ...real,
    consumeStaffLimit: (await import("./__testutils__/staff-rate-limit-mock"))
      .fakeConsumeStaffLimit,
  };
});

const collect = vi.fn();
vi.mock("./numbers-core", async () => {
  const real = await vi.importActual<typeof import("./numbers-core")>("./numbers-core");
  return { ...real, collectNumbers: (...a: unknown[]) => collect(...a) };
});
vi.mock("./numbers-sources.server", () => ({
  createSources: () => ({}),
  createOwnFetcher: () => async () => ({}),
}));

const mod = await import("./staff-home.functions");
const { staffNavCounts, staffHomeMetrics, staffHomeMoney, staffHomeFeed } = asTestFns({
  staffNavCounts: mod.staffNavCounts,
  staffHomeMetrics: mod.staffHomeMetrics,
  staffHomeMoney: mod.staffHomeMoney,
  staffHomeFeed: mod.staffHomeFeed,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b2";
const REPORTER = "00000000-0000-4000-8000-0000000000b3";
const NOBODY = "00000000-0000-4000-8000-0000000000b1";

beforeEach(() => {
  collect.mockReset();
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [NOBODY]: { role: "support", scopes: ["users.read"] },
    [SUPPORT]: { role: "support", scopes: ["support.read"] },
    [REPORTER]: { role: "support", scopes: ["reports.manage"] },
  });
});

/** A client whose rpc answers per function name and whose from() answers per table. */
function client(opts: { rpc?: Record<string, unknown>; from?: Record<string, unknown> }) {
  const calls: string[] = [];
  return {
    calls,
    rpc: vi.fn(async (name: string) => {
      calls.push(`rpc:${name}`);
      if (name === "consume_staff_rate_limit") return { data: true, error: null };
      return opts.rpc?.[name] ?? { data: null, error: { message: "boom" } };
    }),
    from: vi.fn((table: string) => {
      calls.push(`from:${table}`);
      return chainable(
        opts.from?.[table] ?? { data: null, count: null, error: { message: "boom" } },
      );
    }),
  };
}

describe("staffNavCounts: only the counts a person's scopes allow", () => {
  it("support.read gets the needs-reply count and is never asked for reports", async () => {
    const admin = client({
      rpc: { staff_support_inbox: { data: { counts: { open: 4 } }, error: null } },
    });
    const out = await staffNavCounts({ context: { supabaseAdmin: admin, userId: SUPPORT } });
    expect(out).toEqual({ support: 4 });
    expect(admin.calls).not.toContain("from:content_reports");
  });

  it("reports.manage gets the open reports and is never asked for tickets", async () => {
    const admin = client({ from: { content_reports: { count: 3, error: null } } });
    const out = await staffNavCounts({ context: { supabaseAdmin: admin, userId: REPORTER } });
    expect(out).toEqual({ reports: 3 });
    expect(admin.calls).not.toContain("rpc:staff_support_inbox");
  });

  it("someone with neither scope still gets an answer (a rail needs no pips) and nothing is read", async () => {
    const admin = client({});
    expect(await staffNavCounts({ context: { supabaseAdmin: admin, userId: NOBODY } })).toEqual({});
    expect(admin.calls).toEqual([]);
  });

  it("a failed read is null, never 0", async () => {
    const admin = client({});
    const out = await staffNavCounts({ context: { supabaseAdmin: admin, userId: OWNER } });
    expect(out).toEqual({ support: null, reports: null });
  });
});

describe("staffHomeMetrics", () => {
  it("is refused without numbers.read and reads nothing", async () => {
    const admin = client({});
    await expect(
      staffHomeMetrics({
        data: { range: "today" },
        context: { supabaseAdmin: admin, userId: SUPPORT },
      }),
    ).rejects.toThrow(/^Forbidden: missing scope/);
    expect(admin.calls).toEqual([]);
  });

  it("passes the range to the database and returns what it counted", async () => {
    const admin = client({
      rpc: {
        staff_home_metrics: { data: { newLearners: 9, lessons: 31, activeToday: 12 }, error: null },
      },
    });
    const out = await staffHomeMetrics({
      data: { range: "7" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(out).toMatchObject({ range: "7", newLearners: 9, lessons: 31, activeToday: 12 });
    expect(admin.rpc).toHaveBeenCalledWith("staff_home_metrics", { p_range: "7" });
  });

  it("a field the database did not return is null (not 0); a failed read throws", async () => {
    const partial = client({
      rpc: { staff_home_metrics: { data: { newLearners: 0, lessons: null }, error: null } },
    });
    const out = await staffHomeMetrics({
      data: { range: "today" },
      context: { supabaseAdmin: partial, userId: OWNER },
    });
    expect(out.newLearners).toBe(0); // a real 0 the database counted
    expect(out.lessons).toBeNull();
    expect(out.activeToday).toBeNull();
    await expect(
      staffHomeMetrics({
        data: { range: "today" },
        context: { supabaseAdmin: client({}), userId: OWNER },
      }),
    ).rejects.toThrow("Could not read the numbers.");
  });

  it("refuses a range that is not today, 7 or 30", async () => {
    await expect(
      staffHomeMetrics({
        data: { range: "90" },
        context: { supabaseAdmin: client({}), userId: OWNER },
      }),
    ).rejects.toThrow();
  });
});

describe("staffHomeMoney is the owner's: numbers.revenue", () => {
  it("a support person is refused before any provider is touched", async () => {
    await expect(
      staffHomeMoney({ context: { supabaseAdmin: client({}), userId: SUPPORT } }),
    ).rejects.toThrow(/^Forbidden: missing scope/);
    expect(collect).not.toHaveBeenCalled();
  });

  it("asks only for the three groups and returns each tile's value or its honest state", async () => {
    collect.mockResolvedValue({
      generatedAt: "2026-11-20T10:00:00.000Z",
      groups: [
        {
          key: "aicost",
          state: "ok",
          tiles: [{ id: "spend_today", label: "x", kind: "usd", value: 1.25, note: "today" }],
        },
        {
          key: "revenuecat",
          state: "not_connected",
          tiles: [
            {
              id: "mrr",
              label: "x",
              kind: "money",
              value: null,
              note: "",
              reason: "Not connected",
            },
          ],
        },
      ],
    });
    const out = await staffHomeMoney({ context: { supabaseAdmin: client({}), userId: OWNER } });
    expect(collect.mock.calls[0]![0]).toMatchObject({ only: ["aicost", "revenuecat", "appstore"] });
    expect(out.tiles.map((t) => [t.id, t.value, t.state])).toEqual([
      ["spend_today", 1.25, "ok"],
      ["mrr", null, "not_connected"],
      // appstore was not in the answer: an error with a reason, never a number
      ["downloads", null, "error"],
    ]);
  });
});

describe("staffHomeFeed", () => {
  it("needs audit.read", async () => {
    await expect(
      staffHomeFeed({ context: { supabaseAdmin: client({}), userId: SUPPORT } }),
    ).rejects.toThrow(/^Forbidden: missing scope/);
  });

  it("reads actor, action and time only (no target), leaves out user.view, and names the actor", async () => {
    const admin = client({
      from: {
        staff_audit_log: {
          data: [
            { id: 5, at: "2026-11-20T09:00:00Z", actor_user_id: SUPPORT, action: "support.reply" },
          ],
          error: null,
        },
        profiles: { data: [{ id: SUPPORT, display_name: "Sam" }], error: null },
      },
    });
    const out = await staffHomeFeed({ context: { supabaseAdmin: admin, userId: OWNER } });
    expect(out.rows).toEqual([
      { id: 5, at: "2026-11-20T09:00:00Z", action: "support.reply", actorName: "Sam" },
    ]);
    const log = admin.from.mock.results[0]!.value as {
      calls: { method: string; args: unknown[] }[];
    };
    const select = log.calls.find((c) => c.method === "select")!;
    expect(select.args[0]).not.toMatch(/target/);
    expect(log.calls).toContainEqual({ method: "neq", args: ["action", "user.view"] });
  });
});
