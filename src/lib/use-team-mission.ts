import { useQuery } from "@tanstack/react-query";
import { getMyTeam, getTeamMission } from "./teams.functions";

/**
 * The team mission read, and whether its failure is worth telling the learner about. get_team_mission answers null
 * without a team, so a failed read cannot say whether there is one: only then is the team lookup asked (it is cached
 * from the team screens). A learner known to have no team has no mission to miss, so they see no error; one in a
 * team, or one the lookup cannot place either, does.
 */
/**
 * `nested`: the reader is the card the rail opens, which sits beside the rail's own reader of the same query. It must not
 * reset a failed read to pending on mount (that would blink the rail card away); the rail itself keeps the default
 * retry-on-mount, so a failed first load retries when the learner comes back.
 */
export function useTeamMission({ nested = false }: { nested?: boolean } = {}) {
  const missionQuery = useQuery({
    queryKey: ["teamMission"],
    queryFn: () => getTeamMission(),
    retry: false,
    ...(nested ? { retryOnMount: false } : {}),
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
