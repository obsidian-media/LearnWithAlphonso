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

const mod = await import("./staff-home.functions");
const { staffHomeSupport, staffHomeReports, staffHomeNumbers } = asTestFns({
  staffHomeSupport: mod.staffHomeSupport,
  staffHomeReports: mod.staffHomeReports,
  staffHomeNumbers: mod.staffHomeNumbers,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const NOBODY = "00000000-0000-4000-8000-0000000000b1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b2";
const REPORTER = "00000000-0000-4000-8000-0000000000b3";

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [NOBODY]: { role: "support", scopes: ["users.read"] },
    [SUPPORT]: { role: "support", scopes: ["support.read"] },
    [REPORTER]: { role: "support", scopes: ["reports.manage"] },
  });
});

function client(result: unknown) {
  const calls: { name: string; args: unknown[] }[] = [];
  return {
    calls,
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ name, args: [args] });
      return result;
    }),
    from: vi.fn((table: string) => {
      calls.push({ name: `from:${table}`, args: [] });
      return chainable(result);
    }),
  };
}

describe("startOfUtcDay", () => {
  it("is midnight UTC of the same UTC date", () => {
    expect(mod.startOfUtcDay(new Date("2026-11-15T23:59:59Z"))).toBe("2026-11-15T00:00:00.000Z");
    expect(mod.startOfUtcDay(new Date("2026-11-16T00:00:01Z"))).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("the landing page counts are scope-gated on the server", () => {
  it("refuses each count to someone without that scope, and reads nothing", async () => {
    for (const [fn, who] of [
      [staffHomeSupport, NOBODY],
      [staffHomeReports, SUPPORT],
      [staffHomeNumbers, REPORTER],
    ] as const) {
      const admin = client({ data: null, count: 5, error: null });
      await expect(fn({ context: { supabaseAdmin: admin, userId: who } })).rejects.toThrow(
        /^Forbidden: missing scope/,
      );
      expect(admin.calls).toEqual([]);
    }
  });

  it("support: open and unassigned come from the inbox counts", async () => {
    const admin = client({
      data: { counts: { open: 4, unassigned: 2, waiting: 1, solved: 9, all: 14 }, tickets: [] },
      error: null,
    });
    const out = await staffHomeSupport({ context: { supabaseAdmin: admin, userId: SUPPORT } });
    expect(out).toEqual({ open: 4, unassigned: 2 });
    expect(admin.rpc).toHaveBeenCalledWith(
      "staff_support_inbox",
      expect.objectContaining({ p_actor: SUPPORT, p_filter: "open" }),
    );
  });

  it("reports: the number of open reports", async () => {
    const admin = client({ count: 3, error: null });
    expect(await staffHomeReports({ context: { supabaseAdmin: admin, userId: REPORTER } })).toEqual(
      { open: 3 },
    );
  });

  it("numbers: new learners since the start of today, owner holds numbers.read", async () => {
    const admin = client({ count: 23, error: null });
    expect(await staffHomeNumbers({ context: { supabaseAdmin: admin, userId: OWNER } })).toEqual({
      newLearnersToday: 23,
    });
  });

  it("a failed read throws instead of returning 0", async () => {
    const admin = client({ count: null, data: null, error: { message: "boom" } });
    await expect(
      staffHomeReports({ context: { supabaseAdmin: admin, userId: REPORTER } }),
    ).rejects.toThrow("Could not read the reports.");
    await expect(
      staffHomeSupport({ context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow("Could not read the tickets.");
  });
});
