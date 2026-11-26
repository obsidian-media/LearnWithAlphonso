import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { safeNextPath } from "@/lib/safe-next-path";
import { PodcastAudio } from "@/components/PodcastAudio";
import { RouteError } from "@/components/RouteError";
import { AuthOfflineError, isAuthOfflineError, isNetworkAuthError } from "@/lib/auth-offline";
import { OfflineScreen } from "@/components/OfflineScreen";
import { NamePrompt } from "@/components/NamePrompt";
import { ReferralClaim } from "@/components/ReferralBridge";
import { AiConsentProvider } from "@/lib/ai-consent-context";
import {
  browserFirstRunStore,
  completeProfileSkippedThisVisit,
  hasPendingDismissal,
} from "@/lib/first-run";
import { retryPendingDismissal } from "@/lib/learner-profile-save";
import {
  LEARNER_PROFILE_KEY,
  needsCompleteProfile,
  parseLearnerProfile,
} from "@/lib/learner-profile";

/**
 * Where a signed-out visitor goes. The page they asked for rides along as `next`, so a friend who opens an invite link
 * lands back on it after signing in or up (a new account starts on the sign-up form). Without it the link was dropped
 * at the door and the friendship never happened. `/auth` re-vets `next` (safeNextPath), so a bad value is just ignored.
 */
function signedOutRedirect(location: { href?: string; pathname?: string } | undefined) {
  const next = safeNextPath(location?.href ?? location?.pathname);
  if (!next || next === "/" || next === "/auth") return { to: "/auth" } as const;
  return {
    to: "/auth",
    search: next.startsWith("/invite/") ? { next, mode: "signup" as const } : { next },
  } as const;
}

function profileNeeded(user: { user_metadata?: Record<string, unknown> | null }): boolean {
  return needsCompleteProfile(parseLearnerProfile(user.user_metadata?.[LEARNER_PROFILE_KEY]));
}

async function freshUserStillNeedsProfile(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    return profileNeeded(data.user);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // The session kept in this browser, not a round trip to the auth server: getUser() failed on every flaky
    // connection, and any failure sent a signed-in learner to the sign-in page. Only a missing session does now; a
    // network failure (getSession refreshing an expired token offline) shows the offline screen with Try again.
    let session;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error && isNetworkAuthError(error)) throw new AuthOfflineError();
      session = data.session;
    } catch (err) {
      if (isNetworkAuthError(err)) throw new AuthOfflineError();
      throw err;
    }
    if (!session) throw redirect(signedOutRedirect(location));
    const user = session.user;
    // A device that answered Under 13 in the first run keeps no account open (BACKLOG 0.0-bd): sign out, and the
    // sign-in page shows the kind stop.
    if (browserFirstRunStore().isBlocked()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    // Learners who signed up before the first run existed see it once, as "Complete your profile". Only from the
    // home screen, so a deep link (a lesson, an invite) is never hijacked.
    // A Not now whose server write failed earlier is finished in the background and still counts as said.
    const dismissalPending = hasPendingDismissal(user.id);
    if (dismissalPending) void retryPendingDismissal(user.id);
    if (
      location?.pathname === "/learn" &&
      !completeProfileSkippedThisVisit() &&
      !dismissalPending &&
      profileNeeded(user) &&
      // The session's copy of the metadata can be stale: the profile is saved server-side (admin API), maybe on
      // another device, and Complete your profile itself reads getUser(). Ask the auth server before redirecting;
      // if it cannot answer, let the learner in rather than risk a /learn <-> /complete-profile loop.
      (await freshUserStillNeedsProfile())
    ) {
      throw redirect({ to: "/complete-profile" });
    }
    return { user };
  },
  // A page under this layout that throws keeps the app around it; the lesson and Hector have their own as well.
  errorComponent: ({ error, reset }) =>
    isAuthOfflineError(error) ? (
      <OfflineScreen onRetry={reset} />
    ) : (
      <RouteError error={error} reset={reset} boundary="authenticated_layout" />
    ),
  // PodcastAudio sits BESIDE the Outlet, not inside it: every page
  // renders its own MobileFrame/LessonFrame, so anything mounted in
  // those unmounts on navigation. The audio element has to outlive the
  // page for playback to survive walking into a subfolder.
  component: () => (
    <AiConsentProvider>
      <PodcastAudio />
      <NamePrompt />
      <ReferralClaim />
      <Outlet />
    </AiConsentProvider>
  ),
});
