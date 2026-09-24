import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PodcastAudio } from "@/components/PodcastAudio";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  // PodcastAudio sits BESIDE the Outlet, not inside it: every page
  // renders its own MobileFrame/LessonFrame, so anything mounted in
  // those unmounts on navigation. The audio element has to outlive the
  // page for playback to survive walking into a subfolder.
  component: () => (
    <>
      <PodcastAudio />
      <Outlet />
    </>
  ),
});
