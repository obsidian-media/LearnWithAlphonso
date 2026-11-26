import { useQuery } from "@tanstack/react-query";
import type { Course } from "@/data/courses";
import { getWeeklyQuestProgress } from "./quests.functions";

/** This week's XP quests (weekly_quests) with progress and claim state, for one course. Separate from the weekly challenges. */
export function useWeeklyQuests(course: Course, { nested = false }: { nested?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["weeklyQuests", course],
    queryFn: () => getWeeklyQuestProgress({ data: { course } }),
    retry: false,
    ...(nested ? { retryOnMount: false } : {}),
  });
  return {
    quests: query.data,
    isLoading: query.isLoading,
    failed: query.isError && query.data === undefined,
    retry: () => void query.refetch(),
  };
}
