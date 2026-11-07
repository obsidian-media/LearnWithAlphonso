import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LearnerProfile } from "./learner-profile";
import { learnerProfileSaveInput, saveLearnerProfileFor } from "./learner-profile.server";

/**
 * Saves first-run / Complete-your-profile answers to `user_metadata.learner_profile`, checked against the lists in
 * learner-profile.ts (an under-13 range is not on them). The rest of the metadata (voices, the Google name) is
 * kept. When the flag or the country changes, profiles.country follows: the country while the flag is on, empty
 * when it is off, because that column is what leaderboards show. The apps reach the same save through
 * /api/learner-profile (learner-profile.server.ts).
 */
export const saveLearnerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => learnerProfileSaveInput.parse(d))
  .handler(async ({ data, context }): Promise<LearnerProfile> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveLearnerProfileFor(supabaseAdmin, userId, data, (country) =>
      supabase.from("profiles").update({ country }).eq("id", userId),
    );
  });
