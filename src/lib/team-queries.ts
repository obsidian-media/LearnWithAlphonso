import type { QueryClient } from "@tanstack/react-query";

/** Reads that belong to one particular team: after a switch their cached data is the OLD team's. */
export const TEAM_SCOPED_QUERY_KEYS = [["teamMembers"], ["teamMission"]] as const;
/** Reads that change when the learner joins or leaves, but are not about one team only. */
export const TEAM_MEMBERSHIP_QUERY_KEYS = [["myTeam"], ["teamLeaderboard"]] as const;

/**
 * Call after joining, creating or leaving a team. Refreshing only ["myTeam"] showed the old team's members and mission
 * on the next team's page until they refetched; those two are reset (cached data dropped, refetched if on screen), the
 * rest are refetched.
 */
export async function invalidateTeamQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    ...TEAM_SCOPED_QUERY_KEYS.map((queryKey) =>
      queryClient.resetQueries({ queryKey: [...queryKey] }),
    ),
    ...TEAM_MEMBERSHIP_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] }),
    ),
  ]);
}
