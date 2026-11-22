import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, createSupabaseMock } from "./__testutils__/supabase-mock";
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

const mod = await import("./staff-admin.functions");
const { staffListStaff, staffAddStaff, staffUpdateStaff } = asTestFns({
  staffListStaff: mod.staffListStaff,
  staffAddStaff: mod.staffAddStaff,
  staffUpdateStaff: mod.staffUpdateStaff,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OWNER2 = "00000000-0000-4000-8000-0000000000a2";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const HIRE = "00000000-0000-4000-8000-0000000000c1";

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [OWNER2]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["users.read", "staff.manage"] }, // a row that should be impossible
  });
});

function adminClient() {
  const admin = createSupabaseMock();
  admin.rpc.mockImplementation(async (name: string) =>
    name === "staff_search_users"
      ? {
          data: [{ id: HIRE, email: "hire@example.com", display_name: "Hire", created_at: "x" }],
          error: null,
        }
      : { data: null, error: null },
  );
  return admin;
}
const writes = (a: ReturnType<typeof adminClient>) =>
  a.rpc.mock.calls.filter((c) => c[0] !== "staff_search_users");

const add = (admin: ReturnType<typeof adminClient>, over = {}, userId = OWNER) =>
  staffAddStaff({
    data: {
      email: "Hire@Example.com",
      role: "support",
      reason: "joining the support team",
      ...over,
    },
    context: { supabaseAdmin: admin, userId },
  });
const update = (admin: ReturnType<typeof adminClient>, over = {}, userId = OWNER) =>
  staffUpdateStaff({
    data: { userId: HIRE, reason: "adjusting what they can do", ...over },
    context: { supabaseAdmin: admin, userId },
  });

describe("staffAddStaff", () => {
  it("add writes admin_users, staff_roles and one audit row in a single database call", async () => {
    const admin = adminClient();
    await add(admin, { scopes: ["users.read", "users.notes"] });
    expect(writes(admin)).toHaveLength(1);
    expect(writes(admin)[0]).toEqual([
      "staff_add_member",
      {
        p_actor: OWNER,
        p_actor_role: "owner",
        p_user: HIRE,
        p_role: "support",
        p_scopes: ["users.read", "users.notes"],
        p_reason: "joining the support team",
      },
    ]);
    // the person is found by their exact email, case-insensitively
    expect(admin.rpc.mock.calls[0]).toEqual(["staff_search_users", { p_q: "Hire@Example.com" }]);
  });

  it("a support role with no scopes given gets the default support scopes", async () => {
    const admin = adminClient();
    await add(admin);
    expect((writes(admin)[0]![1] as { p_scopes: string[] }).p_scopes).toContain("users.read");
    expect((writes(admin)[0]![1] as { p_scopes: string[] }).p_scopes).not.toContain("pro.grant");
  });

  it("support_ai cannot be added as a login", async () => {
    const admin = adminClient();
    await expect(add(admin, { role: "support_ai" })).rejects.toThrow(
      "support_ai is not a login role.",
    );
    expect(writes(admin)).toHaveLength(0);
  });

  it("granting staff.manage to a non-owner is refused", async () => {
    const admin = adminClient();
    await expect(add(admin, { scopes: ["users.read", "staff.manage"] })).rejects.toThrow(
      /staff\.manage/,
    );
    expect(writes(admin)).toHaveLength(0);
  });

  it("an unknown scope is refused", async () => {
    const admin = adminClient();
    await expect(add(admin, { scopes: ["root.everything"] })).rejects.toThrow();
    expect(writes(admin)).toHaveLength(0);
  });

  it("the person must already have an account, found by exact email only", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({
      data: [
        { id: HIRE, email: "someone.else@example.com", display_name: "Hire", created_at: "x" },
      ],
      error: null,
    });
    await expect(add(admin)).rejects.toThrow(/no account with that email/i);
    expect(writes(admin)).toHaveLength(0);
  });

  it("cannot add yourself, and requires a reason", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({
      data: [{ id: OWNER, email: "hire@example.com", display_name: "Me", created_at: "x" }],
      error: null,
    });
    await expect(add(admin)).rejects.toThrow(/own account/i);
    await expect(add(adminClient(), { reason: "no" })).rejects.toThrow(/reason/i);
  });

  it("only staff.manage may add: a support member (even one with a stored scope) is not an owner", async () => {
    const admin = adminClient();
    // SUPPORT's stored scopes include staff.manage, but getStaffRole treats a non-owner row's scopes as stored;
    // the function must still not let a non-owner create an owner.
    await expect(add(admin, { role: "owner" }, SUPPORT)).rejects.toThrow(/only an owner/i);
    expect(writes(admin)).toHaveLength(0);
  });
});

describe("staffUpdateStaff", () => {
  it("owner cannot disable or demote self", async () => {
    const admin = adminClient();
    await expect(update(admin, { userId: OWNER, disabled: true })).rejects.toThrow(/own account/i);
    await expect(update(admin, { userId: OWNER, role: "support" })).rejects.toThrow(/own account/i);
    expect(writes(admin)).toHaveLength(0);
  });

  it("a staff member cannot grant themselves a scope (any change to their own row is refused)", async () => {
    setStaff({
      [OWNER]: { role: "owner", scopes: [] },
      [SUPPORT]: { role: "support", scopes: ["staff.manage"] },
    });
    const admin = adminClient();
    await expect(
      update(admin, { userId: SUPPORT, scopes: ["users.read", "pro.grant"] }, SUPPORT),
    ).rejects.toThrow(/own account|only an owner/i);
    expect(writes(admin)).toHaveLength(0);
  });

  it("granting staff.manage to support is refused (it is impossible for a non-owner)", async () => {
    const admin = adminClient();
    await expect(update(admin, { scopes: ["users.read", "staff.manage"] })).rejects.toThrow(
      /staff\.manage/,
    );
    expect(writes(admin)).toHaveLength(0);
  });

  it("an owner can disable another staff member, with before and after recorded by the database call", async () => {
    const admin = adminClient();
    await update(admin, { disabled: true });
    expect(writes(admin)).toEqual([
      [
        "staff_update_member",
        {
          p_actor: OWNER,
          p_actor_role: "owner",
          p_user: HIRE,
          p_role: null,
          p_scopes: null,
          p_disabled: true,
          p_reason: "adjusting what they can do",
        },
      ],
    ]);
  });

  it("a staff member who is not an owner (and holds no staff.manage in practice) is Forbidden", async () => {
    setStaff({
      [OWNER]: { role: "owner", scopes: [] },
      [SUPPORT]: { role: "support", scopes: ["users.read"] },
    });
    const admin = adminClient();
    await expect(update(admin, { disabled: true }, SUPPORT)).rejects.toThrow(
      "Forbidden: missing scope staff.manage",
    );
    await expect(add(admin, {}, SUPPORT)).rejects.toThrow("Forbidden: missing scope staff.manage");
    expect(writes(admin)).toHaveLength(0);
  });

  it("a change that touches nothing is refused", async () => {
    const admin = adminClient();
    await expect(update(admin)).rejects.toThrow(/nothing to change/i);
  });

  it("a missing staff member reads as not found", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "x" } });
    await expect(update(admin, { disabled: true })).rejects.toThrow("That person is not staff.");
  });
});

describe("database refusals reach the screen in plain words", () => {
  const failing = (code: string, message: string) => {
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: null, error: { code, message } });
    return admin;
  };
  it("the last active owner cannot be demoted or disabled", async () => {
    await expect(
      update(failing("23514", "the last active owner cannot be demoted or disabled"), {
        disabled: true,
      }),
    ).rejects.toThrow("That would leave no active owner, so nothing was changed.");
  });
  it("an actor the database does not know as an active owner is told only an owner can do this", async () => {
    await expect(
      update(failing("42501", "only an active owner may change staff"), { disabled: true }),
    ).rejects.toThrow("Only an owner can manage staff.");
  });
});

describe("staffListStaff", () => {
  const dbRow = (over = {}) => ({
    user_id: HIRE,
    display_name: "Hire",
    email: "hire@example.com",
    role: "support",
    scopes: ["users.read", "bogus"],
    disabled_at: null,
    added_at: "t",
    last_sign_in_at: "2026-11-20T09:00:00Z",
    ...over,
  });

  it("lists staff with name, email, last sign-in and effective scopes from ONE database call, owner only", async () => {
    const admin = createSupabaseMock();
    admin.rpc.mockResolvedValue({
      data: [dbRow({ user_id: OWNER, role: "owner", scopes: [], last_sign_in_at: null }), dbRow()],
      error: null,
    });
    const rows = await staffListStaff({ context: { supabaseAdmin: admin, userId: OWNER } });
    expect(admin.rpc).toHaveBeenCalledWith("staff_list_members", { p_actor: OWNER });
    expect(admin.from).not.toHaveBeenCalled();
    expect(rows.find((r: { userId: string }) => r.userId === HIRE)).toMatchObject({
      role: "support",
      scopes: ["users.read"],
      displayName: "Hire",
      email: "hire@example.com",
      lastSignInAt: "2026-11-20T09:00:00Z",
      disabled: false,
    });
    // never signed in stays null (the screen says so), never a made-up date
    expect(rows.find((r: { userId: string }) => r.userId === OWNER)?.lastSignInAt).toBeNull();
    await expect(
      staffListStaff({ context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow(/only an owner/i);
  });

  it("a support person never reaches the database (refused before the call)", async () => {
    const admin = createSupabaseMock();
    await expect(
      staffListStaff({ context: { supabaseAdmin: admin, userId: SUPPORT } }),
    ).rejects.toThrow(/only an owner/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("a failed read is an error, not an empty list", async () => {
    const admin = createSupabaseMock();
    admin.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(
      staffListStaff({ context: { supabaseAdmin: admin, userId: OWNER } }),
    ).rejects.toThrow("Could not read the staff list.");
  });
});
