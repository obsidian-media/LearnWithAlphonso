import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeamJoinResult = { ok: boolean; reason: string | null; teamId: string | null };
export type TeamLeaderboardEntry = { teamId: string; name: string; weeklyXp: number };
export type MyTeam = {
  teamId: string;
  name: string;
  joinCode: string;
  joinedAt: string;
  switchLockedUntil: string;
  thisWeekXp: number;
} | null;

function toJoinResult(
  row: { ok: boolean; reason: string | null; team_id: string | null } | undefined,
): TeamJoinResult {
  // "unknown-error" is the fallback for a MISSING row (the RPC returned
  // nothing, so we have no idea why) -- not a default for a null `reason`.
  // Applying `row?.reason ?? "unknown-error"` unconditionally meant a
  // *successful* join came back reporting reason: "unknown-error", since
  // the RPC correctly returns reason: null on success. Nothing surfaced it
  // (both web `teams.tsx` and iOS `TeamsView` read `reason` only when
  // `ok` is false), so this was latent rather than user-visible -- but it
  // also made this port disagree with the Swift one, which does a plain
  // `row["reason"] as? String` and returns nil on success.
  if (!row) return { ok: false, reason: "unknown-error", teamId: null };
  return { ok: row.ok, reason: row.reason, teamId: row.team_id };
}

export const joinTeamByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<TeamJoinResult> => {
    const { data: rows } = await context.supabase.rpc("join_team", { _code: data.code });
    return toJoinResult(rows?.[0]);
  });

export const joinPublicTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TeamJoinResult> => {
    const { data: rows } = await context.supabase.rpc("join_public_team", {
      _team_id: data.teamId,
    });
    return toJoinResult(rows?.[0]);
  });

export const autoJoinTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamJoinResult> => {
    const { data: rows } = await context.supabase.rpc("auto_join_team");
    return toJoinResult(rows?.[0]);
  });

export const leaveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; reason: string | null }> => {
    const { data: rows } = await context.supabase.rpc("leave_team");
    const row = rows?.[0];
    return { ok: row?.ok ?? false, reason: row?.reason ?? null };
  });

export const getTeamLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamLeaderboardEntry[]> => {
    const { data: rows } = await context.supabase.rpc("get_team_leaderboard");
    return (rows ?? []).map((r) => ({
      teamId: r.team_id,
      name: r.name,
      weeklyXp: r.weekly_xp ?? 0,
    }));
  });

export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTeam> => {
    const { data: rows } = await context.supabase.rpc("get_my_team");
    const row = rows?.[0];
    if (!row) return null;
    return {
      teamId: row.team_id,
      name: row.name,
      joinCode: row.join_code,
      joinedAt: row.joined_at,
      switchLockedUntil: row.switch_locked_until,
      thisWeekXp: row.this_week_xp ?? 0,
    };
  });
