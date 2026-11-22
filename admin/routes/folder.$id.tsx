import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { PodcastScreen } from "@/components/console/podcast/PodcastScreen";
import { podcastApi } from "@/components/console/podcast/serverApi";

/**
 * One folder's episodes (the folder is the route parameter: an episode is never edited without its neighbours in
 * view). The same screen as /folders with that folder chosen.
 */
export const Route = createFileRoute("/folder/$id")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("podcasts.manage")) return { forbidden: true as const };
      return { forbidden: false as const };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: FolderEpisodes,
});

function FolderEpisodes() {
  const data = Route.useLoaderData();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  if (data.forbidden) return <ForbiddenCard title="Podcast" scope="podcasts.manage" />;
  return (
    <PodcastScreen
      api={podcastApi}
      folderId={id}
      onSelectFolder={(next) => {
        if (next) void navigate({ to: "/folder/$id", params: { id: next } });
        else void navigate({ to: "/folders" });
      }}
    />
  );
}
