import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

// The deletion steps are the existing, separately tested ones; the order they are called in is what this file pins.
const order: string[] = [];
const revokeApple = vi.fn();
const eraseRecord = vi.fn();
const cancelWeb = vi.fn();
vi.mock("./account.functions", () => ({
  revokeAppleGrantForUser: (...a: unknown[]) => revokeApple(...a),
  eraseSubscriberRecord: (...a: unknown[]) => eraseRecord(...a),
}));
vi.mock("./revenuecat-entitlement", () => ({
  revenueCatConfigFromEnv: () => ({ secretApiKey: "k" }),
  cancelAccountWebSubscriptions: (...a: unknown[]) => cancelWeb(...a),
}));

const mod = await import("./staff-users.functions");
const { staffDeleteUser } = asTestFns({ staffDeleteUser: mod.staffDeleteUser });

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUPPORT = "00000000-0000-4000-8000-0000000000b1";
const LEARNER = "00000000-0000-4000-8000-000000000001";
const EMAIL = "Ada@Example.com";
const HASH = createHash("sha256").update(EMAIL.toLowerCase()).digest("hex");

function adminClient(deleteError: { message: string } | null = null) {
  const admin = createSupabaseMock() as ReturnType<typeof createSupabaseMock> & {
    auth: {
      admin: { getUserById: ReturnType<typeof vi.fn>; deleteUser: ReturnType<typeof vi.fn> };
    };
  };
  admin.auth = {
    admin: {
      getUserById: vi.fn(async () => ({
        data: { user: { id: LEARNER, email: EMAIL } },
        error: null,
      })),
      deleteUser: vi.fn(async () => {
        order.push("delete_user");
        return { data: {}, error: deleteError };
      }),
    },
  };
  admin.rpc.mockImplementation(async (name: string, args: { p_action?: string }) => {
    order.push(name === "staff_record" ? `record:${args.p_action}` : name);
    return { data: 1, error: null };
  });
  return admin;
}

const del = (admin: ReturnType<typeof adminClient>, over = {}, userId = OWNER) =>
  staffDeleteUser({
    data: {
      id: LEARNER,
      reason: "requested by the learner by email",
      confirmEmail: "ada@example.com",
      ...over,
    },
    context: { supabaseAdmin: admin, userId },
  });
const recorded = (admin: ReturnType<typeof adminClient>, action: string) =>
  admin.rpc.mock.calls.filter(
    (c) => c[0] === "staff_record" && (c[1] as { p_action: string }).p_action === action,
  );

beforeEach(() => {
  order.length = 0;
  revokeApple.mockReset().mockImplementation(async () => {
    order.push("apple");
    return "revoked";
  });
  eraseRecord.mockReset().mockImplementation(async () => {
    order.push("erase");
  });
  cancelWeb.mockReset().mockImplementation(async () => {
    order.push("cancel_web");
    return "none";
  });
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SUPPORT]: { role: "support", scopes: ["users.read", "user.block", "reports.manage"] },
  });
});

describe("staffDeleteUser", () => {
  it("the requested row is written before any external call, with an email hash and no email", async () => {
    const admin = adminClient();
    await del(admin);
    expect(order[0]).toBe("record:user.delete.requested");
    const requested = recorded(admin, "user.delete.requested")[0]![1] as {
      p_after: unknown;
      p_target: string;
      p_reason: string;
    };
    expect(requested.p_target).toBe(LEARNER);
    expect(requested.p_reason).toBe("requested by the learner by email");
    expect(JSON.stringify(requested.p_after)).toContain(HASH);
    expect(JSON.stringify(admin.rpc.mock.calls)).not.toContain("example.com");
  });

  it("runs web cancel, Apple revocation, Auth delete, then the subscriber erase, in that order", async () => {
    const admin = adminClient();
    const result = await del(admin);
    expect(order).toEqual([
      "record:user.delete.requested",
      "cancel_web",
      "apple",
      "delete_user",
      "erase",
      "record:user.delete.completed",
    ]);
    expect(result).toEqual({ ok: true, failedSteps: [] });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(LEARNER);
  });

  it("Apple revocation fails: the account is still deleted and failed-at-apple is recorded", async () => {
    revokeApple.mockResolvedValue("failed");
    const admin = adminClient();
    const result = await del(admin);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, failedSteps: ["apple"] });
    const failed = recorded(admin, "user.delete.failed");
    expect(failed).toHaveLength(1);
    expect((failed[0]![1] as { p_after: unknown }).p_after).toEqual({
      step: "apple",
      accountDeleted: true,
    });
    const completed = recorded(admin, "user.delete.completed")[0]![1] as { p_after: unknown };
    expect(completed.p_after).toEqual({ failedSteps: ["apple"] });
  });

  it("a web subscription that could not be cancelled is recorded, and the erase still queues its retry", async () => {
    cancelWeb.mockResolvedValue("failed");
    const admin = adminClient();
    const result = await del(admin);
    expect(result.failedSteps).toEqual(["web_subscription"]);
    expect(eraseRecord).toHaveBeenCalledWith(LEARNER);
  });

  it("deleteUser fails: it stops, records failed at delete_user, and throws", async () => {
    const admin = adminClient({ message: "db down" });
    await expect(del(admin)).rejects.toThrow(/could not be deleted/i);
    const failed = recorded(admin, "user.delete.failed");
    expect(failed).toHaveLength(1);
    expect((failed[0]![1] as { p_after: unknown }).p_after).toEqual({
      step: "delete_user",
      accountDeleted: false,
    });
    expect(eraseRecord).not.toHaveBeenCalled();
    expect(recorded(admin, "user.delete.completed")).toHaveLength(0);
  });

  it("nothing at all happens without a matching confirmEmail", async () => {
    const admin = adminClient();
    await expect(del(admin, { confirmEmail: "other@example.com" })).rejects.toThrow(
      "Type the learner's email to confirm.",
    );
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it("support is Forbidden (user.delete is owner-only), and nobody deletes themselves", async () => {
    const admin = adminClient();
    await expect(del(admin, {}, SUPPORT)).rejects.toThrow("Forbidden: missing scope user.delete");
    await expect(del(admin, { id: OWNER })).rejects.toThrow(/own account/i);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("a requested row that cannot be written stops everything before any external call", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(del(admin)).rejects.toThrow(/action record/i);
    expect(cancelWeb).not.toHaveBeenCalled();
    expect(revokeApple).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe("the reports page", () => {
  it("no longer references adminDeleteReportedUser anywhere, and calls staffDeleteUser", () => {
    const page = readFileSync("admin/routes/reports.tsx", "utf8");
    expect(page).not.toContain("adminDeleteReportedUser");
    expect(page).toContain("staffDeleteUser");
    const fns = readFileSync("src/lib/admin.functions.ts", "utf8");
    expect(fns).not.toContain("adminDeleteReportedUser");
  });
});
