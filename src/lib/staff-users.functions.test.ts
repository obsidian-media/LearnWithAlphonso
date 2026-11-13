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
const { staffSearchUsers, staffGetUser, staffAddNote } = asTestFns({
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
