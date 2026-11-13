import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";
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

const mod = await import("./staff-users.functions");
const { staffSearchUsers, staffGetUser, staffAddNote, staffGrantPro, staffRevokePro } = asTestFns({
  staffGrantPro: mod.staffGrantPro,
  staffRevokePro: mod.staffRevokePro,
  staffSearchUsers: mod.staffSearchUsers,
  staffGetUser: mod.staffGetUser,
  staffAddNote: mod.staffAddNote,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const LEARNER = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["users.read"] },
  });
});

function adminClient() {
  const admin = createSupabaseMock() as ReturnType<typeof createSupabaseMock> & {
    auth: { admin: { getUserById: ReturnType<typeof vi.fn> } };
  };
  admin.auth = {
    admin: {
      getUserById: vi.fn(async () => ({
        data: {
          user: { id: LEARNER, email: "ada@example.com", created_at: "2026-01-01T00:00:00Z" },
        },
        error: null,
      })),
    },
  };
  admin.rpc.mockResolvedValue({ data: 1, error: null });
  admin.from.mockImplementation((table: string) => {
    switch (table) {
      case "profiles":
        return chainable({ data: [{ id: LEARNER, display_name: "Ada" }], error: null });
      case "content_reports":
        return chainable({ data: null, count: 0, error: null });
      default:
        return chainable({ data: [], error: null });
    }
  });
  return admin;
}

describe("staffSearchUsers", () => {
  it("search by exact email returns that user", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({
      data: [
        { id: LEARNER, email: "ada@example.com", display_name: "Ada", created_at: "2026-01-01" },
      ],
      error: null,
    });
    const rows = await staffSearchUsers({
      data: { q: "ADA@example.com" },
      context: { supabaseAdmin: admin, userId: SUPPORT },
    });
    expect(admin.rpc).toHaveBeenCalledWith("staff_search_users", { p_q: "ADA@example.com" });
    expect(rows).toEqual([
      { id: LEARNER, email: "ada@example.com", displayName: "Ada", createdAt: "2026-01-01" },
    ]);
  });

  it("search by 1 char is rejected before anything is queried", async () => {
    const admin = adminClient();
    await expect(
      staffSearchUsers({ data: { q: "a" }, context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("is limited to 30 searches a minute per staff member", async () => {
    const BUSY = "00000000-0000-4000-8000-0000000000b9";
    setStaff({
      [OWNER]: { role: "owner", scopes: [] },
      [BUSY]: { role: "support", scopes: ["users.read"] },
    });
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: [], error: null });
    const call = () =>
      staffSearchUsers({ data: { q: "ada" }, context: { supabaseAdmin: admin, userId: BUSY } });
    for (let i = 0; i < 30; i++) await call();
    await expect(call()).rejects.toThrow(/too many searches/i);
    // another staff member is unaffected
    await expect(
      staffSearchUsers({ data: { q: "ada" }, context: { supabaseAdmin: admin, userId: OWNER } }),
    ).resolves.toEqual([]);
  });

  it("a caller without users.read is Forbidden and a non-staff caller is Unauthorized", async () => {
    setStaff({ [SUPPORT]: { role: "support", scopes: ["support.read"] } });
    const admin = adminClient();
    await expect(
      staffSearchUsers({ data: { q: "ada" }, context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow("Forbidden: missing scope users.read");
    await expect(
      staffSearchUsers({
        data: { q: "ada" },
        context: { supabaseAdmin: admin, userId: "stranger" },
      }),
    ).rejects.toThrow(/^Unauthorized: Invalid token$/);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("staffGetUser", () => {
  it("records a user.view audit row", async () => {
    const admin = adminClient();
    const facts = await staffGetUser({
      data: { id: LEARNER },
      context: { supabaseAdmin: admin, userId: SUPPORT },
    });
    expect(facts.email).toBe("ada@example.com");
    expect(admin.rpc).toHaveBeenCalledWith(
      "staff_record",
      expect.objectContaining({
        p_action: "user.view",
        p_actor: SUPPORT,
        p_role: "support",
        p_target: LEARNER,
        p_reason: null,
      }),
    );
  });

  it("does not return the facts when the view could not be recorded", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(
      staffGetUser({ data: { id: LEARNER }, context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow(/action record/i);
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it("facts never include keys named like payment|card|messages|answers", async () => {
    const admin = adminClient();
    const facts = await staffGetUser({
      data: { id: LEARNER },
      context: { supabaseAdmin: admin, userId: SUPPORT },
    });
    expect(JSON.stringify(facts)).not.toMatch(/"[^"]*(payment|card|messages|answers)[^"]*":/i);
  });

  it("viewing is a read, not a write action, so it is not subject to the own-account refusal", async () => {
    const admin = adminClient();
    await expect(
      staffGetUser({ data: { id: SUPPORT }, context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).resolves.toBeDefined();
  });
});

describe("staffAddNote", () => {
  it("support with users.read but not users.notes cannot add a note", async () => {
    const admin = adminClient();
    await expect(
      staffAddNote({
        data: { id: LEARNER, body: "hello" },
        context: { supabaseAdmin: admin, userId: SUPPORT },
      }),
    ).rejects.toThrow("Forbidden: missing scope users.notes");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("writes the note through staff_add_note with the actor and role", async () => {
    setStaff({ [SUPPORT]: { role: "support", scopes: ["users.notes"] } });
    const admin = adminClient();
    await staffAddNote({
      data: { id: LEARNER, body: "  asked about refunds  " },
      context: { supabaseAdmin: admin, userId: SUPPORT },
    });
    expect(admin.rpc).toHaveBeenCalledWith("staff_add_note", {
      p_actor: SUPPORT,
      p_role: "support",
      p_target: LEARNER,
      p_body: "asked about refunds",
    });
  });

  it("refuses an empty note and one over 2000 characters", async () => {
    const admin = adminClient();
    for (const body of ["   ", "x".repeat(2001)]) {
      await expect(
        staffAddNote({
          data: { id: LEARNER, body },
          context: { supabaseAdmin: admin, userId: OWNER },
        }),
      ).rejects.toThrow();
    }
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("refuses a note about yourself", async () => {
    const admin = adminClient();
    await expect(
      staffAddNote({
        data: { id: OWNER, body: "me" },
        context: { supabaseAdmin: admin, userId: OWNER },
      }),
    ).rejects.toThrow(/own account/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

// ---- Gift Pro and revoke (Task 5) ----
describe("staffGrantPro and staffRevokePro", () => {
  const DAY = 86_400_000;
  type Call = { url: string; method: string; body: unknown };
  let calls: Call[];
  let grantStatus = 200;

  beforeEach(() => {
    calls = [];
    grantStatus = 200;
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === "GET") {
          return new Response(JSON.stringify({ subscriber: { entitlements: {} } }), {
            status: 200,
          });
        }
        return new Response("{}", { status: url.endsWith("/promotional") ? grantStatus : 200 });
      }),
    );
    setStaff({
      [OWNER]: { role: "owner", scopes: [] },
      [SUPPORT]: { role: "support", scopes: ["users.read", "user.block"] },
    });
  });

  const grant = (userId: string, admin: ReturnType<typeof adminClient>, over = {}) =>
    staffGrantPro({
      data: { id: LEARNER, days: 30, reason: "goodwill after outage", ...over },
      context: { supabaseAdmin: admin, userId },
    });
  const rpcNames = (admin: ReturnType<typeof adminClient>) =>
    admin.rpc.mock.calls.map((c) => c[0] as string);

  it("grant posts end_time_ms = now + days*86400000 to the promotional endpoint", async () => {
    const admin = adminClient();
    const before = Date.now();
    await grant(OWNER, admin);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(
      `https://api.revenuecat.com/v1/subscribers/${LEARNER}/entitlements/pro/promotional`,
    );
    const end = (post.body as { end_time_ms: number }).end_time_ms;
    expect(end).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(end).toBeLessThanOrEqual(Date.now() + 30 * DAY);
    expect(rpcNames(admin)).toEqual(["staff_record_pro_grant"]);
    expect(admin.rpc.mock.calls[0]![1]).toMatchObject({
      p_actor: OWNER,
      p_role: "owner",
      p_target: LEARNER,
      p_reason: "goodwill after outage",
    });
  });

  it("days 0 and 366 (and a fraction) are rejected before anything is called", async () => {
    const admin = adminClient();
    for (const days of [0, 366, 1.5, -3])
      await expect(grant(OWNER, admin, { days })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const admin = adminClient();
    await expect(grant(OWNER, admin, { reason: "  " })).rejects.toThrow(/reason/i);
    expect(calls).toHaveLength(0);
  });

  it("a support caller is Forbidden, nothing is sent to RevenueCat and no audit row is written", async () => {
    const admin = adminClient();
    await expect(grant(SUPPORT, admin)).rejects.toThrow("Forbidden: missing scope pro.grant");
    await expect(
      staffRevokePro({
        data: { id: LEARNER, reason: "mistake" },
        context: { supabaseAdmin: admin, userId: SUPPORT },
      }),
    ).rejects.toThrow("Forbidden: missing scope pro.revoke");
    expect(calls).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("granting to yourself is refused", async () => {
    const admin = adminClient();
    await expect(grant(OWNER, admin, { id: OWNER })).rejects.toThrow(/own account/i);
    expect(calls).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("RevenueCat 500 records pro.grant.failed, writes no grant, and throws", async () => {
    grantStatus = 500;
    const admin = adminClient();
    await expect(grant(OWNER, admin)).rejects.toThrow(
      "RevenueCat refused the gift; nothing changed.",
    );
    expect(rpcNames(admin)).toEqual(["staff_record"]);
    expect(admin.rpc.mock.calls[0]![1]).toMatchObject({
      p_action: "pro.grant.failed",
      p_target: LEARNER,
    });
  });

  it("revoke calls revoke_promotionals then records pro.revoke", async () => {
    const admin = adminClient();
    await staffRevokePro({
      data: { id: LEARNER, reason: "given by mistake" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/revoke_promotionals"))).toBe(
      true,
    );
    expect(rpcNames(admin)).toEqual(["staff_record_pro_revoke"]);
  });

  it("revoke refuses yourself and a failing RevenueCat records pro.revoke.failed", async () => {
    const admin = adminClient();
    await expect(
      staffRevokePro({
        data: { id: OWNER, reason: "for myself" },
        context: { supabaseAdmin: admin, userId: OWNER },
      }),
    ).rejects.toThrow(/own account/i);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (_u: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response("x", { status: 500 })
          : new Response(JSON.stringify({ subscriber: { entitlements: {} } })),
    );
    await expect(
      staffRevokePro({
        data: { id: LEARNER, reason: "mistake" },
        context: { supabaseAdmin: admin, userId: OWNER },
      }),
    ).rejects.toThrow("RevenueCat refused the change; nothing changed.");
    expect(rpcNames(admin)).toEqual(["staff_record"]);
    expect(admin.rpc.mock.calls[0]![1]).toMatchObject({ p_action: "pro.revoke.failed" });
  });
});
