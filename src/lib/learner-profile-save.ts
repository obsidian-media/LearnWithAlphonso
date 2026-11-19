import { supabase } from "@/integrations/supabase/client";
import { skipCompleteProfileThisVisit } from "./first-run";
import type { LearnerProfile } from "./learner-profile";
import { saveLearnerProfile as saveOnServer } from "./learner-profile.functions";
import type { LearnerProfileSaveInput } from "./learner-profile.server";

/**
 * The browser's way to save the learner profile. The server writes `user_metadata` with the admin API, which never
 * reaches the session kept in this browser: the /learn gate reads that session, so without a refresh it kept sending
 * a learner who had just finished Complete your profile back to it (and that page sent them back to /learn) until
 * the token renewed an hour later. So: a finished or dismissed flow also holds for the rest of this visit, and the
 * session is refreshed to carry the new metadata. A failed refresh is not a failed save.
 */
export async function saveLearnerProfile({
  data,
}: {
  data: LearnerProfileSaveInput;
}): Promise<LearnerProfile> {
  const saved = await saveOnServer({ data });
  if (data.mark) skipCompleteProfileThisVisit();
  try {
    await supabase.auth.refreshSession?.();
  } catch {
    // The gate double-checks with getUser() before redirecting, so a stale session cannot loop.
  }
  return saved;
}
