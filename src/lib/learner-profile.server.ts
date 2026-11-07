import { z } from "zod";
import {
  LEARNER_PROFILE_KEY,
  learnerProfilePatchSchema,
  mergeLearnerProfile,
  parseLearnerProfile,
  type LearnerProfile,
} from "./learner-profile";

/** What a client may send: the answers, and optionally Finish or "Not now" for the one-time flow. */
export const learnerProfileSaveInput = z
  .object({
    patch: learnerProfilePatchSchema,
    /** Finish or "Not now" for the one-time flow; the time is the server's. */
    mark: z.enum(["completed", "dismissed"]).optional(),
  })
  .strict();

export type LearnerProfileSaveInput = z.infer<typeof learnerProfileSaveInput>;

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export class LearnerProfileSaveError extends Error {}

/**
 * The one save behind the web's server function and the apps' /api/learner-profile: merges the checked answers into
 * `user_metadata.learner_profile` (the rest of the metadata, voices and the Google name, is kept), and when the flag
 * or the country changes, profiles.country follows: the country while the flag is on, empty when it is off.
 * `setCountry` writes that column for this account only (the caller scopes it to the verified user).
 */
export async function saveLearnerProfileFor(
  admin: Admin,
  userId: string,
  data: LearnerProfileSaveInput,
  setCountry: (country: string | null) => PromiseLike<{ error: unknown }>,
): Promise<LearnerProfile> {
  const { data: read, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError || !read?.user)
    throw new LearnerProfileSaveError("Couldn't read your account. Try again.");
  const meta = (read.user.user_metadata ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const merged = mergeLearnerProfile(parseLearnerProfile(meta[LEARNER_PROFILE_KEY]), {
    ...data.patch,
    ...(data.mark === "completed" ? { completedAt: now } : {}),
    ...(data.mark === "dismissed" ? { dismissedAt: now } : {}),
  });
  const { error: writeError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, [LEARNER_PROFILE_KEY]: merged },
  });
  if (writeError) throw new LearnerProfileSaveError("Couldn't save your answers. Try again.");

  if ("showFlag" in data.patch || "country" in data.patch) {
    const country = merged.showFlag ? (merged.country ?? null) : null;
    const { error } = await setCountry(country);
    if (error)
      throw new LearnerProfileSaveError(
        "Your answers were saved, but your flag setting wasn't. Try again.",
      );
  }
  return merged;
}
