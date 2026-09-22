import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SeasonStatus = {
  division: number;
  rankInCohort: number;
  cohortSize: number;
  lastWeekResult: { division: number; rankInCohort: number; cohortSize: number } | null;
};

export const getSeasonStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeasonStatus | null> => {
    const { data, error } = await context.supabase.functions.invoke("get-season-status", {
      method: "GET",
    });
    if (error || !data) return null;
    return {
      division: data.division,
      rankInCohort: data.rankInCohort,
      cohortSize: data.cohortSize,
      lastWeekResult: data.lastWeekResult ?? null,
    };
  });
