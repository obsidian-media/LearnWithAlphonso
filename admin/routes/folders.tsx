import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { PodcastScreen } from "@/components/console/podcast/PodcastScreen";
import { podcastApi } from "@/components/console/podcast/serverApi";

export const Route = createFileRoute("/folders")({
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
  component: Folders,
});

function Folders() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  if (data.forbidden) return <ForbiddenCard title="Podcast" scope="podcasts.manage" />;
  return (
    <PodcastScreen
      api={podcastApi}
      folderId={null}
      onSelectFolder={(id) => {
        if (id) void navigate({ to: "/folder/$id", params: { id } });
      }}
    />
  );
}
