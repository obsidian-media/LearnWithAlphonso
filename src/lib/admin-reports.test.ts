import { describe, expect, it, vi } from "vitest";
import {
  asTestFns,
  chainable,
  createSupabaseMock,
  type ChainCall,
} from "./__testutils__/supabase-mock";

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
const {
  adminListReports,
  adminDeleteReportedUser,
  adminResetDisplayName,
  adminRenameTeam,
  adminDisbandTeam,
  adminDismissReport,
} = asTestFns({
  adminListReports: adminModule.adminListReports,
  adminDeleteReportedUser: adminModule.adminDeleteReportedUser,
  adminResetDisplayName: adminModule.adminResetDisplayName,
  adminRenameTeam: adminModule.adminRenameTeam,
  adminDisbandTeam: adminModule.adminDisbandTeam,
  adminDismissReport: adminModule.adminDismissReport,
});
const { teamIdForReport } = adminModule;

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
              kind: "user",
              reporter: "u1",
              reported: "u2",
              reason: "spam",
              context: null,
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
        kind: "user",
        reporterId: "u1",
        reporterName: "Ada",
        reportedId: "u2",
        reportedName: "Bea",
        reason: "spam",
        context: null,
        teamId: null,
        teamName: null,
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
      auth: {
        admin: {
          deleteUser,
          getUserById: vi.fn().mockResolvedValue({ data: { user: { identities: [{ provider: "email" }] } }, error: null }),
        },
      },
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
      auth: {
        admin: {
          deleteUser,
          getUserById: vi.fn().mockResolvedValue({ data: { user: { identities: [{ provider: "email" }] } }, error: null }),
        },
      },
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
      auth: {
        admin: {
          deleteUser,
          getUserById: vi.fn().mockResolvedValue({ data: { user: { identities: [{ provider: "email" }] } }, error: null }),
        },
      },
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

describe("teamIdForReport", () => {
  it("reads context.team_id, then the legacy reason prefix, else null", () => {
    const id = "5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b";
    expect(teamIdForReport({ reason: "spam", context: { team_id: id } })).toBe(id);
    expect(teamIdForReport({ reason: `team_name:${id}:spam`, context: null })).toBe(id);
    expect(teamIdForReport({ reason: "spam", context: { team_id: "not-a-uuid" } })).toBeNull();
    expect(teamIdForReport({ reason: "spam", context: null })).toBeNull();
  });
});

describe("moderation actions", () => {
  const REPORT = "8a0c7d0e-6a8f-4f41-9d3c-2f0f6a7b1c11";
  const TEAM = "5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b";

  it("adminListReports keeps an AI report with no reported account", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) =>
      table === "content_reports"
        ? chainable({
            data: [
              {
                id: "r1",
                kind: "ai_response",
                reporter: "u1",
                reported: null,
                reason: "other",
                context: { source: "hector", course: "fr", message: "m" },
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            error: null,
          })
        : chainable({ data: [{ id: "u1", display_name: "Ada" }], error: null }),
    );
    const [row] = await adminListReports({ context: ctx(supabaseAdmin) });
    expect(row).toMatchObject({
      kind: "ai_response",
      reportedId: null,
      reportedName: null,
      teamId: null,
      reporterName: "Ada",
    });
  });

  it("reset name calls the RPC for the REPORTED user and resolves the report", async () => {
    const supabaseAdmin = createSupabaseMock();
    const deletes: ChainCall[] = [];
    supabaseAdmin.from
      .mockReturnValueOnce(
        chainable({
          data: { id: REPORT, kind: "user", reported: "u2", reason: "spam", context: null },
          error: null,
        }),
      )
      .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }, deletes));
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: "Learner-1A2B", error: null }));
    const result = await adminResetDisplayName({
      data: { reportId: REPORT },
      context: ctx(supabaseAdmin),
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("admin_reset_display_name", { _user_id: "u2" });
    expect(result).toEqual({ ok: true, newName: "Learner-1A2B" });
    expect(deletes.some((c) => c.method === "delete")).toBe(true);
  });

  it("rename refuses a blocked name with the shared copy and keeps the report", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockReturnValueOnce(
      chainable({
        data: {
          id: REPORT,
          kind: "team_name",
          reported: "u2",
          reason: "spam",
          context: { team_id: TEAM },
        },
        error: null,
      }),
    );
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: "blocked-content", error: null }));
    await expect(
      adminRenameTeam({ data: { reportId: REPORT, name: "FuckYou" }, context: ctx(supabaseAdmin) }),
    ).rejects.toThrow("That name isn't allowed. Try another.");
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("admin_rename_team", {
      _team_id: TEAM,
      _name: "FuckYou",
    });
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  it("disband deletes the team the REPORT names, then resolves the report", async () => {
    const supabaseAdmin = createSupabaseMock();
    const teamCalls: ChainCall[] = [];
    supabaseAdmin.from
      .mockReturnValueOnce(
        chainable({
          data: {
            id: REPORT,
            kind: "team_name",
            reported: "u2",
            reason: "spam",
            context: { team_id: TEAM },
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }, teamCalls))
      .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }));
    expect(
      await adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).toEqual({ ok: true });
    expect(supabaseAdmin.from).toHaveBeenNthCalledWith(2, "teams");
    expect(teamCalls.find((c) => c.method === "eq")?.args).toEqual(["id", TEAM]);
  });

  it("team actions refuse a report that names no team", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockReturnValueOnce(
      chainable({
        data: { id: REPORT, kind: "user", reported: "u2", reason: "spam", context: null },
        error: null,
      }),
    );
    await expect(
      adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).rejects.toThrow("This report is not about a team.");
  });

  it("deleting the account refuses an AI report", async () => {
    const deleteUser = vi.fn();
    const supabaseAdmin = { ...createSupabaseMock(), auth: { admin: { deleteUser } } };
    supabaseAdmin.from.mockReturnValueOnce(chainable({ data: { reported: null }, error: null }));
    await expect(
      adminDeleteReportedUser({ data: { reportId: REPORT }, context: ctx(supabaseAdmin as never) }),
    ).rejects.toThrow("This report has no account to delete.");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("dismiss deletes only that report", async () => {
    const supabaseAdmin = createSupabaseMock();
    const calls: ChainCall[] = [];
    supabaseAdmin.from.mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }, calls));
    expect(
      await adminDismissReport({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).toEqual({ ok: true });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["id", REPORT]);
  });

  it("names the reported team, read from the team the report points at", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") {
        return chainable({
          data: [
            {
              id: "r1",
              kind: "team_name",
              reporter: "u1",
              reported: "u2",
              reason: "spam",
              context: { team_id: TEAM },
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      if (table === "teams")
        return chainable({ data: [{ id: TEAM, name: "Swift Falcons" }], error: null });
      return chainable({ data: [{ id: "u1", display_name: "Ada" }], error: null });
    });
    const [row] = await adminListReports({ context: ctx(supabaseAdmin) });
    expect(row).toMatchObject({ teamId: TEAM, teamName: "Swift Falcons" });
  });

  it("says the action happened when only resolving the report failed", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from
      .mockReturnValueOnce(
        chainable({
          data: { id: REPORT, kind: "user", reported: "u2", reason: "spam", context: null },
          error: null,
        }),
      )
      .mockReturnValueOnce(chainable({ data: null, error: { message: "connection lost" } }));
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: "Learner-1A2B", error: null }));
    await expect(
      adminResetDisplayName({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).rejects.toThrow("Action done, but the report wasn't dismissed. Refresh the list.");
    expect(supabaseAdmin.rpc).toHaveBeenCalledOnce();
  });

  it("logs one structured line per action with ids only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const supabaseAdmin = createSupabaseMock();
      supabaseAdmin.from
        .mockReturnValueOnce(
          chainable({
            data: {
              id: REPORT,
              kind: "team_name",
              reported: "u2",
              reason: "spam",
              context: { team_id: TEAM },
            },
            error: null,
          }),
        )
        .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }))
        .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }));
      await adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) });
      expect(info).toHaveBeenCalledOnce();
      expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
        event: "admin_action",
        action: "disband_team",
        reportId: REPORT,
        targetId: TEAM,
        adminId: "admin-1",
      });
    } finally {
      info.mockRestore();
    }
  });
});
