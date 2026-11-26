import { supabase } from "@/integrations/supabase/client";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "./learner-profile";

/**
 * Whether to offer the placement test now (owner decision, "option 1"): everyone who said they know "some" or are
 * "confident" and have not taken it is offered it, right after their first Hector call and as a prominent card at the
 * top of Learn. True beginners ("new") are not pushed; they keep the small card on Learn. "Not now" hides the
 * Hector-end prompt for that course (kept on this device) and quietens the Learn card. The same rule is in the iOS
 * Kit (PlacementOffer) and the Android core (PlacementOffer); keep the three in step.
 */
export type OfferSurface = "hector-end" | "learn";
export type OfferStyle = "none" | "prominent" | "quiet";

export function placementOffer(args: {
  level: string | null | undefined;
  placementTaken: boolean;
  dismissed: boolean;
  surface: OfferSurface;
}): OfferStyle {
  if (args.placementTaken) return "none";
  const wantsIt = args.level === "some" || args.level === "confident";
  if (args.surface === "hector-end") return wantsIt && !args.dismissed ? "prominent" : "none";
  return wantsIt && !args.dismissed ? "prominent" : "quiet";
}

const dismissKey = (course: string) => `lwa.placementOfferDismissed.v1.${course}`;

export function isOfferDismissed(course: string): boolean {
  try {
    return localStorage.getItem(dismissKey(course)) === "1";
  } catch {
    return false;
  }
}

export function dismissOffer(course: string): void {
  try {
    localStorage.setItem(dismissKey(course), "1");
  } catch {
    // Private mode: the offer simply comes back next visit.
  }
}

/** The level the learner chose in the first run, as saved on the account. Null when there is none or no session. */
export async function readFirstRunLevel(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const meta = data.session?.user?.user_metadata;
    return parseLearnerProfile(meta?.[LEARNER_PROFILE_KEY]).level ?? null;
  } catch {
    return null;
  }
}
