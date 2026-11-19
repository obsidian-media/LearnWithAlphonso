import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "./challenges.functions";

/** This week's challenges; `failed` only when nothing is loaded (a failed refresh keeps the list on screen). */
export function useWeeklyChallenges() {
  const query = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
    retry: false,
    // The rail and the card it opens both read this; a second observer must not reset a failed read to pending.
    retryOnMount: false,
  });
  return {
    challenges: query.data,
    isLoading: query.isLoading,
    failed: query.isError && query.data === undefined,
    retry: () => void query.refetch(),
  };
}
