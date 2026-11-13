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

const mod = await import("./staff-users.functions");
const { staffBanUser, staffUnbanUser } = asTestFns({
  staffBanUser: mod.staffBanUser,
  staffUnbanUser: mod.staffUnbanUser,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const LEARNER = "00000000-0000-4000-8000-000000000001";
const EMAIL = "Ada@Example.com";

function adminClient() {
  const admin = createSupabaseMock() as ReturnType<typeof createSupabaseMock> & {
    auth: {
      admin: { getUserById: ReturnType<typeof vi.fn>; updateUserById: ReturnType<typeof vi.fn> };
    };
  };
  admin.auth = {
    admin: {
      getUserById: vi.fn(async () => ({
        data: { user: { id: LEARNER, email: EMAIL } },
        error: null,
      })),
      updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    },
  };
  admin.rpc.mockResolvedValue({ data: 1, error: null });
  return admin;
}
const rpcNames = (a: ReturnType<typeof adminClient>) => a.rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["user.block", "users.read"] },
  });
});

const ban = (admin: ReturnType<typeof adminClient>, over = {}, userId = OWNER) =>
  staffBanUser({
    data: {
      id: LEARNER,
      reason: "repeated abuse of other learners",
      confirmEmail: "ada@example.com",
      ...over,
    },
    context: { supabaseAdmin: admin, userId },
  });

describe("staffBanUser", () => {
  it("ban without a matching confirmEmail is refused and changes nothing", async () => {
    const admin = adminClient();
    for (const confirmEmail of ["", "someone@else.com", "ada@example.co"]) {
      await expect(ban(admin, { confirmEmail })).rejects.toThrow(
        "Type the learner's email to confirm.",
      );
    }
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("ban records the restriction, bans in Auth with ban_duration, and revokes sessions", async () => {
    const admin = adminClient();
    const result = await ban(admin, { confirmEmail: "  ADA@example.COM " });
    expect(result).toEqual({ ok: true, partial: [] });
    expect(rpcNames(admin)).toEqual(["staff_set_restriction", "staff_revoke_sessions"]);
    expect(admin.rpc.mock.calls[0]![1]).toMatchObject({
      p_actor: OWNER,
      p_role: "owner",
      p_target: LEARNER,
      p_kind: "ban",
      p_reason: "repeated abuse of other learners",
    });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(LEARNER, {
      ban_duration: "876000h",
    });
    expect(admin.rpc.mock.calls[1]![1]).toEqual({ p_target: LEARNER });
  });

  it("a failed Auth ban or session revoke is recorded as user.ban.partial with the failed step", async () => {
    const admin = adminClient();
    admin.auth.admin.updateUserById.mockResolvedValue({ data: null, error: { message: "x" } });
    admin.rpc.mockImplementation(async (name: string) =>
      name === "staff_revoke_sessions"
        ? { data: null, error: { message: "y" } }
        : { data: 1, error: null },
    );
    const result = await ban(admin);
    expect(result).toEqual({ ok: true, partial: ["auth_ban", "revoke_sessions"] });
    const partial = admin.rpc.mock.calls.find(
      (c) =>
        c[0] === "staff_record" && (c[1] as { p_action: string }).p_action === "user.ban.partial",
    );
    expect(partial).toBeDefined();
    expect((partial![1] as { p_after: unknown }).p_after).toEqual({
      failedSteps: ["auth_ban", "revoke_sessions"],
    });
  });

  it("when the restriction cannot be written nothing else is done", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    await expect(ban(admin)).rejects.toThrow("That learner is already banned.");
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("support (user.block only) is Forbidden; and nobody bans themselves", async () => {
    const admin = adminClient();
    await expect(ban(admin, {}, SUPPORT)).rejects.toThrow("Forbidden: missing scope user.ban");
    await expect(ban(admin, { id: OWNER })).rejects.toThrow(/own account/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("staffUnbanUser", () => {
  it("lifts the restriction and sets ban_duration none", async () => {
    const admin = adminClient();
    const result = await staffUnbanUser({
      data: { id: LEARNER, reason: "appeal accepted by the owner" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(result).toEqual({ ok: true, partial: [] });
    expect(admin.rpc).toHaveBeenCalledWith("staff_lift_restriction", {
      p_actor: OWNER,
      p_role: "owner",
      p_target: LEARNER,
      p_kind: "ban",
      p_reason: "appeal accepted by the owner",
    });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(LEARNER, { ban_duration: "none" });
  });

  it("a failed Auth unban is recorded as user.unban.partial", async () => {
    const admin = adminClient();
    admin.auth.admin.updateUserById.mockResolvedValue({ data: null, error: { message: "x" } });
    const result = await staffUnbanUser({
      data: { id: LEARNER, reason: "appeal accepted by the owner" },
      context: { supabaseAdmin: admin, userId: OWNER },
    });
    expect(result).toEqual({ ok: true, partial: ["auth_unban"] });
    expect(
      admin.rpc.mock.calls.some(
        (c) =>
          c[0] === "staff_record" &&
          (c[1] as { p_action: string }).p_action === "user.unban.partial",
      ),
    ).toBe(true);
  });

  it("is Forbidden without user.unban", async () => {
    const admin = adminClient();
    await expect(
      staffUnbanUser({
        data: { id: LEARNER, reason: "appeal accepted" },
        context: { supabaseAdmin: admin, userId: SUPPORT },
      }),
    ).rejects.toThrow("Forbidden: missing scope user.unban");
  });
});
