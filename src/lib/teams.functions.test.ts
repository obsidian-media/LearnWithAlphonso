import { describe, expect, it, vi } from "vitest";
import { asTestFns, createSupabaseMock } from "./__testutils__/supabase-mock";

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

const {
  joinTeamByCode,
  joinPublicTeam,
  autoJoinTeam,
  leaveTeam,
  getTeamLeaderboard,
  getMyTeam,
  createTeam,
} = asTestFns(await import("./teams.functions"));

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: "user-1" };
}
function rpcReturning(value: unknown) {
  const supabase = createSupabaseMock();
  supabase.rpc.mockResolvedValue({ data: value, error: null });
  return supabase;
}

describe("joinTeamByCode", () => {
  it("passes the code to the join_team RPC and unwraps the row", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t1" }]);

    const result = await joinTeamByCode({ context: ctx(supabase), data: { code: "ABC123" } });

    expect(supabase.rpc).toHaveBeenCalledWith("join_team", { _code: "ABC123" });
    expect(result).toEqual({ ok: true, reason: null, teamId: "t1" });
  });

  it("fails closed when the RPC returns no rows", async () => {
    // The important half: an empty result must read as a failure with a
    // reason, not as a silent success. The UI branches on `ok`.
    const supabase = rpcReturning([]);

    const result = await joinTeamByCode({ context: ctx(supabase), data: { code: "ABC123" } });

    expect(result).toEqual({ ok: false, reason: "unknown-error", teamId: null });
  });

  it("fails closed when the RPC returns null data", async () => {
    const supabase = rpcReturning(null);
    const result = await joinTeamByCode({ context: ctx(supabase), data: { code: "ABC123" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown-error");
  });

  it("surfaces the server's own refusal reason unchanged", async () => {
    const supabase = rpcReturning([{ ok: false, reason: "switch-locked", team_id: null }]);
    const result = await joinTeamByCode({ context: ctx(supabase), data: { code: "ABC123" } });
    expect(result).toEqual({ ok: false, reason: "switch-locked", teamId: null });
  });

  it("rejects an empty code before hitting the network", async () => {
    const supabase = rpcReturning([]);
    await expect(joinTeamByCode({ context: ctx(supabase), data: { code: "" } })).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("joinPublicTeam", () => {
  it("passes the team id to join_public_team", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t2" }]);
    const teamId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

    const result = await joinPublicTeam({ context: ctx(supabase), data: { teamId } });

    expect(supabase.rpc).toHaveBeenCalledWith("join_public_team", { _team_id: teamId });
    expect(result.teamId).toBe("t2");
  });

  it("rejects a non-uuid team id before hitting the network", async () => {
    const supabase = rpcReturning([]);
    await expect(
      joinPublicTeam({ context: ctx(supabase), data: { teamId: "not-a-uuid" } }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("autoJoinTeam", () => {
  it("calls auto_join_team with no arguments and unwraps the row", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t3" }]);
    const result = await autoJoinTeam({ context: ctx(supabase) });
    expect(supabase.rpc).toHaveBeenCalledWith("auto_join_team");
    expect(result).toEqual({ ok: true, reason: null, teamId: "t3" });
  });
});

describe("leaveTeam", () => {
  it("returns the server's result", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null }]);
    const result = await leaveTeam({ context: ctx(supabase) });
    expect(supabase.rpc).toHaveBeenCalledWith("leave_team");
    expect(result).toEqual({ ok: true, reason: null });
  });

  it("fails closed with a null reason when the RPC returns nothing", async () => {
    // Note this differs from the join helpers, which default reason to
    // "unknown-error". Pinned deliberately: if that divergence is ever
    // unified, this test should be the thing that makes it a decision
    // rather than an accident.
    const supabase = rpcReturning([]);
    const result = await leaveTeam({ context: ctx(supabase) });
    expect(result).toEqual({ ok: false, reason: null });
  });
});

describe("getTeamLeaderboard", () => {
  it("maps snake_case rows to the client shape", async () => {
    const supabase = rpcReturning([
      { team_id: "t1", name: "Alpha", weekly_xp: 300 },
      { team_id: "t2", name: "Beta", weekly_xp: 120 },
    ]);

    const result = await getTeamLeaderboard({ context: ctx(supabase) });

    expect(result).toEqual([
      { teamId: "t1", name: "Alpha", weeklyXp: 300 },
      { teamId: "t2", name: "Beta", weeklyXp: 120 },
    ]);
  });

  it("treats a missing weekly_xp as zero rather than undefined", async () => {
    const supabase = rpcReturning([{ team_id: "t1", name: "Alpha", weekly_xp: null }]);
    const result = await getTeamLeaderboard({ context: ctx(supabase) });
    expect(result[0]!.weeklyXp).toBe(0);
  });

  it("returns an empty list rather than throwing when there are no rows", async () => {
    const supabase = rpcReturning(null);
    await expect(getTeamLeaderboard({ context: ctx(supabase) })).resolves.toEqual([]);
  });
});

describe("createTeam", () => {
  it("passes the name and visibility to create_team and unwraps the row", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t9", join_code: "XYZ999" }]);
    const result = await createTeam({
      context: ctx(supabase),
      data: { name: "Night Owls", visibility: "private" },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("create_team", {
      _name: "Night Owls",
      _visibility: "private",
    });
    expect(result).toEqual({ ok: true, reason: null, teamId: "t9", joinCode: "XYZ999" });
  });

  it("defaults visibility to public", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t9", join_code: "AAA111" }]);
    await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(supabase.rpc).toHaveBeenCalledWith("create_team", {
      _name: "Night Owls",
      _visibility: "public",
    });
  });

  it("trims the name and rejects an empty one before hitting the network", async () => {
    const supabase = rpcReturning([]);
    await expect(createTeam({ context: ctx(supabase), data: { name: "   " } })).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns no rows", async () => {
    const supabase = rpcReturning([]);
    const result = await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(result).toEqual({ ok: false, reason: "unknown-error", teamId: null, joinCode: null });
  });

  it("surfaces the server's own refusal reason unchanged", async () => {
    const supabase = rpcReturning([
      { ok: false, reason: "switch-locked", team_id: null, join_code: null },
    ]);
    const result = await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(result).toEqual({ ok: false, reason: "switch-locked", teamId: null, joinCode: null });
  });
});

describe("getMyTeam", () => {
  it("returns null when the user is in no team", async () => {
    const supabase = rpcReturning([]);
    await expect(getMyTeam({ context: ctx(supabase) })).resolves.toBeNull();
  });

  it("maps the row, defaulting this week's XP to zero", async () => {
    const supabase = rpcReturning([
      {
        team_id: "t1",
        name: "Alpha",
        join_code: "ABC123",
        joined_at: "2026-09-01T00:00:00Z",
        switch_locked_until: "2026-09-08T00:00:00Z",
        this_week_xp: null,
      },
    ]);

    const result = await getMyTeam({ context: ctx(supabase) });

    expect(result).toEqual({
      teamId: "t1",
      name: "Alpha",
      joinCode: "ABC123",
      joinedAt: "2026-09-01T00:00:00Z",
      switchLockedUntil: "2026-09-08T00:00:00Z",
      thisWeekXp: 0,
    });
  });
});
