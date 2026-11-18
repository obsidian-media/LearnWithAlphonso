import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BackPill, DsEmptyState, GlassTitle } from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { BranchingStoryReader } from "../../components/BranchingStoryReader";
import { StoryReader } from "../../components/StoryReader";
import { isBranchingStory } from "../../lib/stories";
import {
  completeStoryCheck,
  finishBranchingStory,
  getStory,
  saveStoryProgress,
} from "../../lib/stories.functions";

export const Route = createFileRoute("/_authenticated/stories/$storyId")({
  component: StoryPage,
  head: () => ({
    meta: [{ title: "Story — Alphonso" }, { name: "robots", content: "noindex" }],
  }),
});

function StoryPage() {
  const { storyId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => getStory({ data: { storyId } }),
    retry: false,
  });
  const story = query.data;
  return (
    <DsScreen scene="listen">
      <BackPill to="/stories" label="Back to stories">
        Stories
      </BackPill>
      {query.isLoading ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
      ) : query.isError ? (
        <DsEmptyState
          tone="error"
          icon="books"
          title="We couldn't load this story"
          message="Check your connection and try again."
        />
      ) : !story ? (
        <DsEmptyState icon="books" title="Story not found" message="It may not be available yet." />
      ) : isBranchingStory(story) ? (
        <>
          <GlassTitle title={story.title} sub="Read along, then choose what happens next." />
          <BranchingStoryReader
            story={story}
            finish={(path) => finishBranchingStory({ data: { storyId, path } })}
            onFinished={() => {
              void queryClient.invalidateQueries({ queryKey: ["stories"] });
            }}
          />
        </>
      ) : (
        <>
          <GlassTitle title={story.title} sub={null} />
          <StoryReader
            story={story}
            onProgress={(segmentIndex) =>
              // Garnish, like the podcast position: a failed save never interrupts reading.
              void saveStoryProgress({ data: { storyId, segmentIndex } }).catch(() => undefined)
            }
            submitCheck={(answers) => completeStoryCheck({ data: { storyId, answers } })}
            onChecked={() => {
              void queryClient.invalidateQueries({ queryKey: ["stories"] });
            }}
          />
        </>
      )}
    </DsScreen>
  );
}
