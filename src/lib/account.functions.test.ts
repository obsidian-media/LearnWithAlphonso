import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      validator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) => {
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context: opts.context ?? {} });
        },
    };
    return builder;
  },
}));

const deleteUser = vi.fn();
const supabaseAdminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom, auth: { admin: { deleteUser } } },
}));

const { exportMyData, deleteMyAccount } = asTestFns(await import("./account.functions"));

const USER_ID = "user-1";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

beforeEach(() => {
  deleteUser.mockReset();
  supabaseAdminFrom.mockReset();
  supabaseAdminFrom.mockReturnValue(chainable({}));
});

describe("exportMyData", () => {
  it("bundles every user-scoped table plus the profile row into one export", async () => {
    const supabase = createSupabaseMock();
    // 9 USER_ID_TABLES selects (order doesn't affect the merged shape) + profiles.
    supabase.from.mockImplementation((table: string) => {
      if (table === "review_items") return chainable({ data: [{ item_key: "u1l1:q1" }] });
      if (table === "profiles") return chainable({ data: { display_name: "Ada" } });
      return chainable({ data: [] });
    });

    const result = await exportMyData({ context: ctx(supabase) });

    expect(result.user_id).toBe(USER_ID);
    expect(typeof result.exported_at).toBe("string");
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([{ item_key: "u1l1:q1" }]);
    expect(tables.profiles).toEqual({ display_name: "Ada" });
    // language_progress and ai_rate_limits were the tables a past bug
    // silently dropped from the export -- assert they're present.
    expect(tables).toHaveProperty("language_progress");
    expect(tables).toHaveProperty("ai_rate_limits");
  });

  it("falls back to an empty array/object when a table has no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: null }));
    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([]);
    expect(tables.profiles).toEqual([]);
  });
});

describe("deleteMyAccount", () => {
  it("rejects a confirmation value other than the literal 'DELETE'", async () => {
    const supabase = createSupabaseMock();
    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "delete" } }),
    ).rejects.toThrow();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes every owned row, orphaned friendships, and the auth user", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    deleteUser.mockResolvedValue({ error: null });

    const result = await deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } });

    expect(result).toEqual({ deleted: true });
    expect(supabaseAdminFrom).toHaveBeenCalledWith("friendships");
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("throws when the admin deleteUser call fails", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    deleteUser.mockResolvedValue({ error: new Error("auth service down") });

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow("auth service down");
  });
});
