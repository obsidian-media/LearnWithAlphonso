import { describe, expect, it, vi } from "vitest";
import {
  asTestFns,
  chainable,
  createSupabaseMock,
  type ChainCall,
} from "./__testutils__/supabase-mock";

// requireStaff's own gating is covered by admin.functions.test.ts's
// source-scan suite (every createServerFn in this file must carry
// `.middleware([requireStaff(...)])`). Mocked here purely so importing
// admin.functions.ts doesn't pull in the real middleware chain (which
// dynamically imports client.server.ts) just to test these two handlers.
vi.mock("./staff-middleware", () => ({ requireStaff: () => ({}) }));
// eraseSubscriberRecord (called after an admin deletes an account) queues a failed RevenueCat erase through the
// module-level service client; stubbed so no test reaches a real database.
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ upsert: async () => ({ error: null }) }) },
}));
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
  adminResetDisplayName,
  adminRenameTeam,
  adminDisbandTeam,
  adminDismissReport,
} = asTestFns({
  adminListReports: adminModule.adminListReports,
  adminResetDisplayName: adminModule.adminResetDisplayName,
  adminRenameTeam: adminModule.adminRenameTeam,
  adminDisbandTeam: adminModule.adminDisbandTeam,
  adminDismissReport: adminModule.adminDismissReport,
});
const { teamIdForReport } = adminModule;

function ctx(supabaseAdmin: ReturnType<typeof createSupabaseMock>) {
  return { supabaseAdmin, userId: "admin-1", staffRole: "support" };
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
        accountDeletedAt: null,
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

  it("lists a report kept after both accounts were deleted, without looking up a missing id", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") {
        return chainable({
          data: [
            {
              id: "r1",
              kind: "user",
              reporter: null,
              reported: null,
              reason: "spam",
              context: null,
              created_at: "2026-01-01T00:00:00Z",
              account_deleted_at: "2026-02-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await adminListReports({ context: ctx(supabaseAdmin) });

    expect(result).toEqual([
      expect.objectContaining({
        reporterId: null,
        reporterName: "(deleted account)",
        reportedId: null,
        reportedName: "(deleted account)",
        accountDeletedAt: "2026-02-01T00:00:00Z",
      }),
    ]);
  });

  it("names a deleted reported account on a kept report, and only looks up the live reporter", async () => {
    const calls: ChainCall[] = [];
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "content_reports") {
        return chainable({
          data: [
            {
              id: "r1",
              kind: "team_name",
              reporter: "u1",
              reported: null,
              reason: "rude",
              context: null,
              created_at: "2026-01-01T00:00:00Z",
              account_deleted_at: "2026-02-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      if (table === "profiles")
        return chainable({ data: [{ id: "u1", display_name: "Ada" }], error: null }, calls);
      throw new Error(`unexpected table ${table}`);
    });

    const [report] = await adminListReports({ context: ctx(supabaseAdmin) });

    expect(report).toMatchObject({
      reporterName: "Ada",
      reportedId: null,
      reportedName: "(deleted account)",
    });
    expect(calls.find((c) => c.method === "in")?.args).toEqual(["id", ["u1"]]);
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
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("staff_reset_display_name", {
      p_actor: "admin-1",
      p_role: "support",
      p_target: "u2",
      p_report: REPORT,
    });
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
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("staff_rename_team", {
      p_actor: "admin-1",
      p_role: "support",
      p_target: "u2",
      p_report: REPORT,
      p_team: TEAM,
      p_name: "FuckYou",
    });
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  it("disband removes the team the REPORT names through the recording function, then resolves the report", async () => {
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
      .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }));
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: true, error: null }));
    expect(
      await adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).toEqual({ ok: true });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("staff_disband_team", {
      p_actor: "admin-1",
      p_role: "support",
      p_target: "u2",
      p_report: REPORT,
      p_team: TEAM,
    });
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(2);
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("teams");
  });

  it("disband says so when the team is already gone, and does not resolve the report", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockReturnValueOnce(
      chainable({
        data: {
          id: REPORT,
          kind: "team_name",
          reported: "u2",
          reason: "x",
          context: { team_id: TEAM },
        },
        error: null,
      }),
    );
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: false, error: null }));
    await expect(
      adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).rejects.toThrow("That team no longer exists.");
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  it("when the recording function fails the action fails and the report is kept", async () => {
    for (const run of [
      (a: ReturnType<typeof createSupabaseMock>) =>
        adminDisbandTeam({ data: { reportId: REPORT }, context: ctx(a) }),
      (a: ReturnType<typeof createSupabaseMock>) =>
        adminResetDisplayName({ data: { reportId: REPORT }, context: ctx(a) }),
      (a: ReturnType<typeof createSupabaseMock>) =>
        adminRenameTeam({ data: { reportId: REPORT, name: "Fine name" }, context: ctx(a) }),
      (a: ReturnType<typeof createSupabaseMock>) =>
        adminDismissReport({ data: { reportId: REPORT }, context: ctx(a) }),
    ]) {
      const supabaseAdmin = createSupabaseMock();
      supabaseAdmin.from.mockReturnValueOnce(
        chainable({
          data: {
            id: REPORT,
            kind: "team_name",
            reported: "u2",
            reason: "x",
            context: { team_id: TEAM },
          },
          error: null,
        }),
      );
      supabaseAdmin.rpc.mockReturnValueOnce(
        chainable({ data: null, error: { message: "audit down" } }),
      );
      await expect(run(supabaseAdmin)).rejects.toThrow("audit down");
      expect(supabaseAdmin.from).toHaveBeenCalledTimes(1); // only the report lookup: nothing was resolved
    }
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

  it("dismiss removes only that report, through the recording function", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockReturnValueOnce(
      chainable({
        data: { id: REPORT, kind: "user", reported: "u2", reason: "spam", context: null },
        error: null,
      }),
    );
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: true, error: null }));
    expect(
      await adminDismissReport({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).toEqual({ ok: true });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("staff_dismiss_report", {
      p_actor: "admin-1",
      p_role: "support",
      p_target: "u2",
      p_report: REPORT,
    });
  });

  it("dismiss of a report that is already gone says so", async () => {
    const supabaseAdmin = createSupabaseMock();
    supabaseAdmin.from.mockReturnValueOnce(
      chainable({
        data: { id: REPORT, kind: "user", reported: "u2", reason: "spam", context: null },
        error: null,
      }),
    );
    supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: false, error: null }));
    await expect(
      adminDismissReport({ data: { reportId: REPORT }, context: ctx(supabaseAdmin) }),
    ).rejects.toThrow("That report no longer exists.");
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
        .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }));
      supabaseAdmin.rpc.mockReturnValueOnce(chainable({ data: true, error: null }));
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
