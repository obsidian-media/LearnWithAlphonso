import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asTestFns,
  chainable,
  createSupabaseMock,
  type ChainCall,
} from "./__testutils__/supabase-mock";
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

const mod = await import("./staff-audit.functions");
const { staffListAudit } = asTestFns({ staffListAudit: mod.staffListAudit });

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const LEARNER = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["users.read", "support.read"] },
  });
});

function clientWith(rows: unknown[]) {
  const admin = createSupabaseMock();
  const calls: ChainCall[] = [];
  admin.from.mockReturnValue(chainable({ data: rows, error: null }, calls));
  return { admin, calls };
}
const row = (id: number) => ({
  id,
  at: "2026-11-13T10:00:00Z",
  actor_user_id: OWNER,
  actor_role: "owner",
  action: "user.block",
  target_user_id: LEARNER,
  reason: "because",
  before: null,
  after: null,
});

describe("staffListAudit", () => {
  it("audit page denies a support user without audit.read, and reads nothing", async () => {
    const { admin } = clientWith([]);
    await expect(
      staffListAudit({ data: {}, context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow("Forbidden: missing scope audit.read");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("reads the action record newest first, 50 per page", async () => {
    const { admin, calls } = clientWith([row(9), row(8)]);
    const page = await staffListAudit({
      data: {},
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(admin.from).toHaveBeenCalledWith("staff_audit_log");
    expect(calls.find((c) => c.method === "order")?.args).toEqual(["id", { ascending: false }]);
    expect(calls.find((c) => c.method === "limit")?.args).toEqual([51]);
    expect(page.rows.map((r: { id: number }) => r.id)).toEqual([9, 8]);
    expect(page.nextCursor).toBeNull();
  });

  it("a full page returns a cursor that continues after its last row", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => row(100 - i));
    const { admin } = clientWith(rows);
    const page = await staffListAudit({
      data: {},
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(page.rows).toHaveLength(50);
    expect(page.nextCursor).toBe(51);
  });

  it("applies each filter: actor, target, action prefix, date range and cursor", async () => {
    const { admin, calls } = clientWith([]);
    await staffListAudit({
      data: {
        actor: OWNER,
        target: LEARNER,
        action: "user.ba",
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-30T00:00:00.000Z",
        cursor: 500,
      },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    const has = (method: string, ...args: unknown[]) =>
      calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args));
    expect(has("eq", "actor_user_id", OWNER)).toBe(true);
    expect(has("eq", "target_user_id", LEARNER)).toBe(true);
    expect(has("ilike", "action", "user.ba%")).toBe(true);
    expect(has("gte", "at", "2026-11-01T00:00:00.000Z")).toBe(true);
    expect(has("lte", "at", "2026-11-30T00:00:00.000Z")).toBe(true);
    expect(has("lt", "id", 500)).toBe(true);
  });

  it("LIKE wildcards typed into the action filter are escaped", async () => {
    const { admin, calls } = clientWith([]);
    await staffListAudit({
      data: { action: "100%_x" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(calls.find((c) => c.method === "ilike")?.args).toEqual(["action", "100\\%\\_x%"]);
  });

  it("rejects a malformed actor, target or date before querying", async () => {
    const { admin } = clientWith([]);
    for (const data of [{ actor: "nope" }, { target: "nope" }, { from: "yesterday" }]) {
      await expect(
        staffListAudit({ data, context: { supabaseAdmin: admin, userId: OWNER } }),
      ).rejects.toThrow();
    }
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("a read error is an error, not an empty record", async () => {
    const admin = createSupabaseMock();
    admin.from.mockReturnValue(chainable({ data: null, error: { message: "down" } }));
    await expect(
      staffListAudit({ data: {}, context: { supabaseAdmin: admin, userId: OWNER } }),
    ).rejects.toThrow(/could not read/i);
  });
});
