import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BackPill, GlassTitle } from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { StoriesLibraryView } from "../../components/StoriesLibrary";
import { useProgress } from "../../lib/progress";
import { listStories } from "../../lib/stories.functions";

export const Route = createFileRoute("/_authenticated/stories/")({
  component: StoriesPage,
  head: () => ({
    meta: [
      { title: "Stories — Alphonso" },
      {
        name: "description",
        content: "Short graded stories to read along with, organised by level.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function StoriesPage() {
  const course = useProgress((s) => s.course);
  const query = useQuery({
    queryKey: ["stories", course],
    queryFn: () => listStories({ data: { course } }),
    retry: false,
  });
  return (
    <DsScreen scene="listen">
      <BackPill to="/listen" label="Back to library">
        Library
      </BackPill>
      <GlassTitle title="Stories" sub="Read along, tap any word, then check what you understood." />
      {query.isLoading ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
      ) : query.isError ? (
        <p role="alert" className="ds-type-footnote text-ds-ink-soft">
          We couldn&apos;t load the stories. Check your connection and try again.
        </p>
      ) : (
        <StoriesLibraryView stories={query.data ?? []} course={course} />
      )}
    </DsScreen>
  );
}
