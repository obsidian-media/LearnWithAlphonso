import { useQuery } from "@tanstack/react-query";
import { getMyTeam, getTeamMission } from "./teams.functions";

/**
 * The team mission read, and whether its failure is worth telling the learner about. get_team_mission answers null
 * without a team, so a failed read cannot say whether there is one: only then is the team lookup asked (it is cached
 * from the team screens). A learner known to have no team has no mission to miss, so they see no error; one in a
 * team, or one the lookup cannot place either, does.
 */
export function useTeamMission() {
  const missionQuery = useQuery({
    queryKey: ["teamMission"],
    queryFn: () => getTeamMission(),
    retry: false,
    // The rail and the card it opens both read this; a second observer must not reset a failed read to pending.
    retryOnMount: false,
  });
  // A failed refresh of a mission already shown keeps showing it.
  const failed = missionQuery.isError && missionQuery.data === undefined;
  const teamQuery = useQuery({
    queryKey: ["myTeam"],
    queryFn: () => getMyTeam(),
    retry: false,
    enabled: failed,
  });
  const showError = failed && (teamQuery.isError || !!teamQuery.data);
  function retry() {
    void missionQuery.refetch();
    if (teamQuery.isError) void teamQuery.refetch();
  }
  return { mission: missionQuery.data ?? null, showError, retry };
}
