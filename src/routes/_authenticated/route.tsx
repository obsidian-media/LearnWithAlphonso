import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PodcastAudio } from "@/components/PodcastAudio";
import { NamePrompt } from "@/components/NamePrompt";
import { AiConsentProvider } from "@/lib/ai-consent-context";
import { browserFirstRunStore, completeProfileSkippedThisVisit } from "@/lib/first-run";
import {
  LEARNER_PROFILE_KEY,
  needsCompleteProfile,
  parseLearnerProfile,
} from "@/lib/learner-profile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // A device that answered Under 13 in the first run keeps no account open (BACKLOG 0.0-bd): sign out, and the
    // sign-in page shows the kind stop.
    if (browserFirstRunStore().isBlocked()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    // Learners who signed up before the first run existed see it once, as "Complete your profile". Only from the
    // home screen, so a deep link (a lesson, an invite) is never hijacked.
    if (
      location?.pathname === "/learn" &&
      !completeProfileSkippedThisVisit() &&
      needsCompleteProfile(parseLearnerProfile(data.user.user_metadata?.[LEARNER_PROFILE_KEY]))
    ) {
      throw redirect({ to: "/complete-profile" });
    }
    return { user: data.user };
  },
  // PodcastAudio sits BESIDE the Outlet, not inside it: every page
  // renders its own MobileFrame/LessonFrame, so anything mounted in
  // those unmounts on navigation. The audio element has to outlive the
  // page for playback to survive walking into a subfolder.
  component: () => (
    <AiConsentProvider>
      <PodcastAudio />
      <NamePrompt />
      <Outlet />
    </AiConsentProvider>
  ),
});
