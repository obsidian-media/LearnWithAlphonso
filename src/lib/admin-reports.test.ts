import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

// requireAdmin's own gating is covered by admin.functions.test.ts's
// source-scan suite (every createServerFn in this file must carry
// `.middleware([requireAdmin])`). Mocked here purely so importing
// admin.functions.ts doesn't pull in the real middleware chain (which
// dynamically imports client.server.ts) just to test these two handlers.
vi.mock("./admin-middleware", () => ({ requireAdmin: {} }));
// admin.functions.ts imports revokeAppleGrantForUser from
// account.functions.ts, which imports requireSupabaseAuth -- same reason
// as above, one level further out.
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

const adminModule = await import("./admin.functions");
const { adminListReports, adminDeleteReportedUser } = asTestFns({
  adminListReports: adminModule.adminListReports,
  adminDeleteReportedUser: adminModule.adminDeleteReportedUser,
});

function ctx(supabaseAdmin: ReturnType<typeof createSupabaseMock>) {
  return { supabaseAdmin, userId: "admin-1" };
}

describe("adminListReports", () => {
  it("joins reporter and reported display names onto each report", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") {
        return chainable({
          data: [
            {
              id: "r1",
              reporter: "u1",
              reported: "u2",
              reason: "spam",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      if (table === "profiles") {
        return chainable({
          data: [
            { id: "u1", display_name: "Ada" },
            { id: "u2", display_name: "Bea" },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await adminListReports({ context: ctx(supabaseAdmin) });

    expect(result).toEqual([
      {
        id: "r1",
        reporterId: "u1",
        reporterName: "Ada",
        reportedId: "u2",
        reportedName: "Bea",
        reason: "spam",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("returns an empty list without querying profiles when there are no reports", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") return chainable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await adminListReports({ context: ctx(supabaseAdmin) });

    expect(result).toEqual([]);
  });

  it("falls back to a placeholder rather than a blank name when a profile is missing", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") {
        return chainable({
          data: [{ id: "r1", reporter: "u1", reported: "u2", reason: "spam", created_at: "now" }],
          error: null,
        });
      }
      if (table === "profiles") return chainable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await adminListReports({ context: ctx(supabaseAdmin) });

    expect(result[0].reporterName).toBe("(deleted account)");
    expect(result[0].reportedName).toBe("(deleted account)");
  });

  it("surfaces a database error instead of returning an empty list", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation(() =>
      chainable({ data: null, error: { message: "connection lost" } }),
    );

    await expect(adminListReports({ context: ctx(supabaseAdmin) })).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("adminDeleteReportedUser", () => {
  it("deletes the reported account, never the reporter's", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const supabaseAdmin = {
      ...createSupabaseMock(),
      auth: { admin: { deleteUser } },
    };
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") return chainable({ data: { reported: "u2" }, error: null });
      // apple_auth_tokens lookup inside revokeAppleGrantForUser -- no
      // stored token, so it short-circuits to "not revoked" without
      // touching the auth API.
      return chainable({ data: null, error: null });
    });

    const result = await adminDeleteReportedUser({
      context: ctx(supabaseAdmin),
      data: { reportId: "11111111-1111-4111-8111-111111111111" },
    });

    expect(result).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith("u2");
  });

  it("throws when the report no longer exists, rather than deleting nothing silently", async () => {
    const deleteUser = vi.fn();
    const supabaseAdmin = {
      ...createSupabaseMock(),
      auth: { admin: { deleteUser } },
    };
    supabaseAdmin.from.mockImplementation(() => chainable({ data: null, error: null }));

    await expect(
      adminDeleteReportedUser({
        context: ctx(supabaseAdmin),
        data: { reportId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toThrow(/no longer exists/);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("throws when the report lookup itself errors", async () => {
    const supabaseAdmin = {
      ...createSupabaseMock(),
      auth: { admin: { deleteUser: vi.fn() } },
    };
    supabaseAdmin.from.mockImplementation(() =>
      chainable({ data: null, error: { message: "connection lost" } }),
    );

    await expect(
      adminDeleteReportedUser({
        context: ctx(supabaseAdmin),
        data: { reportId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toThrow("connection lost");
  });

  it("throws when the auth deletion itself fails", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: new Error("auth service down") });
    const supabaseAdmin = {
      ...createSupabaseMock(),
      auth: { admin: { deleteUser } },
    };
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") return chainable({ data: { reported: "u2" }, error: null });
      return chainable({ data: null, error: null });
    });

    await expect(
      adminDeleteReportedUser({
        context: ctx(supabaseAdmin),
        data: { reportId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toThrow("auth service down");
  });

  it("rejects a malformed reportId before touching the database", async () => {
    const supabaseAdmin = {
      ...createSupabaseMock(),
      auth: { admin: { deleteUser: vi.fn() } },
    };

    await expect(
      adminDeleteReportedUser({ context: ctx(supabaseAdmin), data: { reportId: "not-a-uuid" } }),
    ).rejects.toThrow();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
