import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "./challenges.functions";

/** This week's challenges; `failed` only when nothing is loaded (a failed refresh keeps the list on screen). */
/** `nested`: see useTeamMission; the card the rail opens must not reset a failed read the rail already shows. */
export function useWeeklyChallenges({ nested = false }: { nested?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
    retry: false,
    ...(nested ? { retryOnMount: false } : {}),
  });
  return {
    challenges: query.data,
    isLoading: query.isLoading,
    failed: query.isError && query.data === undefined,
    retry: () => void query.refetch(),
  };
}
