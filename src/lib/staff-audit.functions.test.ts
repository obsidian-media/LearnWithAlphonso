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
const { staffListAudit, staffListAuditActors } = asTestFns({
  staffListAudit: mod.staffListAudit,
  staffListAuditActors: mod.staffListAuditActors,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const LEARNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000c1";

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["users.read", "support.read"] },
  });
});

/** `rows` answers the record read; `names` answers the profiles read. The rate limiter allows. */
function clientWith(rows: unknown[], names: unknown[] = []) {
  const admin = createSupabaseMock();
  const calls: ChainCall[] = [];
  const nameCalls: ChainCall[] = [];
  admin.from.mockImplementation((table: string) =>
    table === "profiles"
      ? chainable({ data: names, error: null }, nameCalls)
      : chainable({ data: rows, error: null }, calls),
  );
  admin.rpc.mockResolvedValue({ data: true, error: null });
  return { admin, calls, nameCalls };
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

  it("applies each filter: actor, target, category prefixes, reason search, date range and cursor", async () => {
    const { admin, calls } = clientWith([]);
    await staffListAudit({
      data: {
        actor: OWNER,
        target: LEARNER,
        actions: ["user.", "report."],
        q: "spam",
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
    expect(has("or", "action.ilike.user.%,action.ilike.report.%")).toBe(true);
    expect(has("ilike", "reason", "%spam%")).toBe(true);
    expect(has("gte", "at", "2026-11-01T00:00:00.000Z")).toBe(true);
    expect(has("lte", "at", "2026-11-30T00:00:00.000Z")).toBe(true);
    expect(has("lt", "id", 500)).toBe(true);
  });

  it("LIKE wildcards typed into the reason search are escaped, and it matches anywhere in the reason", async () => {
    const { admin, calls } = clientWith([]);
    await staffListAudit({
      data: { q: "100%_x" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(calls.find((c) => c.method === "ilike")?.args).toEqual(["reason", "%100\\%\\_x%"]);
  });

  it("no category and no search send no action or reason filter, and only the known prefixes are accepted", async () => {
    const { admin, calls } = clientWith([]);
    await staffListAudit({ data: {}, context: { supabaseAdmin: admin, userId: OWNER } });
    expect(calls.some((c) => c.method === "or" || c.method === "ilike")).toBe(false);
    for (const actions of [["user.ban"], ["nope."], ["user.,staff.%"], ["%"]]) {
      await expect(
        staffListAudit({ data: { actions }, context: { supabaseAdmin: admin, userId: OWNER } }),
      ).rejects.toThrow();
    }
  });

  it("resolves actor and target names from profiles in ONE read of display_name only, null when unknown", async () => {
    const { admin, nameCalls } = clientWith(
      [
        row(3),
        { ...row(2), target_user_id: OTHER },
        { ...row(1), actor_user_id: null, target_user_id: null },
      ],
      [
        { id: OWNER, display_name: "Olive" },
        { id: LEARNER, display_name: "  Sam  " },
        { id: OTHER, display_name: null },
      ],
    );
    const page = await staffListAudit({
      data: {},
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(admin.from.mock.calls.filter((c: unknown[]) => c[0] === "profiles")).toHaveLength(1);
    expect(nameCalls.find((c) => c.method === "select")?.args).toEqual(["id, display_name"]);
    expect(nameCalls.find((c) => c.method === "in")?.args).toEqual(["id", [OWNER, LEARNER, OTHER]]);
    const [a, b, c] = page.rows;
    expect(a).toMatchObject({ actorName: "Olive", targetName: "Sam" });
    expect(b).toMatchObject({ actorName: "Olive", targetName: null });
    expect(c).toMatchObject({ actorName: null, targetName: null });
  });

  it("learner names need users.read as well: audit.read alone gets staff names but the short id for learners", async () => {
    const AUDITOR = "00000000-0000-4000-8000-0000000000d1";
    const VIEWER = "00000000-0000-4000-8000-0000000000d2";
    setStaff({
      [AUDITOR]: { role: "support", scopes: ["audit.read"] },
      [VIEWER]: { role: "support", scopes: ["audit.read", "users.read"] },
    });
    const names = [
      { id: OWNER, display_name: "Olive" },
      { id: LEARNER, display_name: "Sam" },
    ];
    const plain = clientWith([row(1)], names);
    const a = await staffListAudit({
      data: {},
      context: { supabaseAdmin: plain.admin, userId: AUDITOR },
    });
    expect(a.rows[0]).toMatchObject({ actorName: "Olive", targetName: null });
    // the learner's id is not even asked for
    expect(plain.nameCalls.find((c) => c.method === "in")?.args).toEqual(["id", [OWNER]]);
    const both = clientWith([row(1)], names);
    const b = await staffListAudit({
      data: {},
      context: { supabaseAdmin: both.admin, userId: VIEWER },
    });
    expect(b.rows[0]).toMatchObject({ actorName: "Olive", targetName: "Sam" });
  });

  it("a failed name read still returns the whole record, with no names", async () => {
    const admin = createSupabaseMock();
    admin.from.mockImplementation((table: string) =>
      table === "profiles"
        ? chainable(Promise.reject(new Error("down")))
        : chainable({ data: [row(1)], error: null }),
    );
    admin.rpc.mockResolvedValue({ data: true, error: null });
    const page = await staffListAudit({
      data: {},
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ actorName: null, targetName: null });
  });

  it("is rate limited, and a refusal reads nothing", async () => {
    const { admin } = clientWith([row(1)]);
    admin.rpc.mockResolvedValue({ data: false, error: null });
    await expect(
      staffListAudit({ data: {}, context: { supabaseAdmin: admin, userId: OWNER } }),
    ).rejects.toThrow(/too many/i);
    expect(admin.from).not.toHaveBeenCalled();
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
    admin.rpc.mockResolvedValue({ data: true, error: null });
    await expect(
      staffListAudit({ data: {}, context: { supabaseAdmin: admin, userId: OWNER } }),
    ).rejects.toThrow(/could not read/i);
  });
});

describe("staffListAuditActors", () => {
  const rpcFor = (actors: unknown, error: unknown = null) =>
    vi.fn(async (name: string) =>
      name === "consume_staff_rate_limit" ? { data: true, error: null } : { data: actors, error },
    );

  it("denies a support user without audit.read, and reads nothing", async () => {
    const admin = { ...createSupabaseMock(), rpc: rpcFor([]) };
    await expect(
      staffListAuditActors({ context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow("Forbidden: missing scope audit.read");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("serves an auditor who is not an owner (audit.read alone is enough)", async () => {
    setStaff({ [SUPPORT]: { role: "support", scopes: ["audit.read"] } });
    const admin = {
      ...createSupabaseMock(),
      rpc: rpcFor([{ user_id: OWNER, display_name: "Olive", role: "owner", disabled: false }]),
    };
    const out = await staffListAuditActors({
      context: { supabaseAdmin: admin, userId: SUPPORT },
    });
    expect(admin.rpc).toHaveBeenCalledWith("staff_audit_actors");
    expect(out).toEqual([{ userId: OWNER, displayName: "Olive", role: "owner", disabled: false }]);
  });

  it("returns exactly the four fields, nothing else the database might send", async () => {
    const admin = {
      ...createSupabaseMock(),
      rpc: rpcFor([
        { user_id: OWNER, display_name: null, role: "owner", disabled: false, email: "x@y.z" },
      ]),
    };
    const out = await staffListAuditActors({ context: { supabaseAdmin: admin, userId: OWNER } });
    expect(Object.keys(out[0]).sort()).toEqual(["disabled", "displayName", "role", "userId"]);
  });

  it("a read error is an error, not an empty list", async () => {
    const admin = { ...createSupabaseMock(), rpc: rpcFor(null, { message: "down" }) };
    await expect(
      staffListAuditActors({ context: { supabaseAdmin: admin, userId: OWNER } }),
    ).rejects.toThrow(/could not read/i);
  });
});
