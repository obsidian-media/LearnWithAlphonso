import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LEARNER_PROFILE_KEY,
  learnerProfilePatchSchema,
  mergeLearnerProfile,
  parseLearnerProfile,
  type LearnerProfile,
} from "./learner-profile";

const input = z
  .object({
    patch: learnerProfilePatchSchema,
    /** Finish or "Not now" for the one-time flow; the time is the server's. */
    mark: z.enum(["completed", "dismissed"]).optional(),
  })
  .strict();

/**
 * Saves first-run / Complete-your-profile answers to `user_metadata.learner_profile`, checked against the lists in
 * learner-profile.ts (an under-13 range is not on them). The rest of the metadata (voices, the Google name) is
 * kept. When the flag or the country changes, profiles.country follows: the country while the flag is on, empty
 * when it is off, because that column is what leaderboards show.
 */
export const saveLearnerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<LearnerProfile> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: read, error: readError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (readError || !read?.user) throw new Error("Couldn't read your account. Try again.");
    const meta = (read.user.user_metadata ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const merged = mergeLearnerProfile(parseLearnerProfile(meta[LEARNER_PROFILE_KEY]), {
      ...data.patch,
      ...(data.mark === "completed" ? { completedAt: now } : {}),
      ...(data.mark === "dismissed" ? { dismissedAt: now } : {}),
    });
    const { error: writeError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, [LEARNER_PROFILE_KEY]: merged },
    });
    if (writeError) throw new Error("Couldn't save your answers. Try again.");

    if ("showFlag" in data.patch || "country" in data.patch) {
      const country = merged.showFlag ? (merged.country ?? null) : null;
      const { error } = await supabase.from("profiles").update({ country }).eq("id", userId);
      if (error)
        throw new Error("Your answers were saved, but your flag setting wasn't. Try again.");
    }
    return merged;
  });
