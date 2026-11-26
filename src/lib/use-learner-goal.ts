import { useEffect, useState } from "react";
import { LEARNER_PROFILE_KEY, parseLearnerProfile, type Goal } from "./learner-profile";

/**
 * The learner's goal from their first-run answers (user_metadata.learner_profile), or null while it loads, when they
 * skipped it, or when they are signed out. Goal-flavoured question variants (goal-variants.ts) read it. A failure
 * to read it is not an error: the learner simply sees the base questions.
 */
export function useLearnerGoal(): Goal | null {
  const [goal, setGoal] = useState<Goal | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/integrations/supabase/client")
      .then(({ supabase }) => supabase.auth.getUser())
      .then(({ data }) => {
        const g = parseLearnerProfile(data.user?.user_metadata?.[LEARNER_PROFILE_KEY]).goal;
        if (alive) setGoal(g ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return goal;
}
