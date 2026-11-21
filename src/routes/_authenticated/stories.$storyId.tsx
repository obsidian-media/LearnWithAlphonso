import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BackPill, DsEmptyState, GlassTitle } from "@/components/ds/Blocks";
import { LessonFrame } from "@/components/AppShell";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A story that is not there (a mistyped or stale link, or one that is no longer published): not a connection problem. */
function StoryNotFound() {
  return (
    <DsEmptyState icon="books" title="We couldn't find this story">
      <Link
        to="/stories"
        className="inline-flex min-h-11 items-center ds-type-footnote font-semibold text-ds-brand underline"
      >
        Back to Stories
      </Link>
    </DsEmptyState>
  );
}

function StoryPage() {
  const { storyId } = Route.useParams();
  const queryClient = useQueryClient();
  // The server rejects anything that is not a UUID, which used to surface as "Check your connection".
  const malformed = !UUID.test(storyId);
  const query = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => getStory({ data: { storyId } }),
    retry: false,
    enabled: !malformed,
  });
  const story = query.data;
  // The cinematic reader is full-bleed with its own back bar and title: no scene, back pill or glass title.
  if (story && isBranchingStory(story)) {
    return (
      <LessonFrame>
        <BranchingStoryReader
          story={story}
          finish={(path) => finishBranchingStory({ data: { storyId, path } })}
          onFinished={() => {
            void queryClient.invalidateQueries({ queryKey: ["stories"] });
          }}
        />
      </LessonFrame>
    );
  }
  return (
    <DsScreen scene="listen">
      <BackPill to="/stories" label="Back to stories">
        Stories
      </BackPill>
      {malformed ? (
        <StoryNotFound />
      ) : query.isLoading ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
      ) : query.isError ? (
        <DsEmptyState
          tone="error"
          icon="books"
          title="We couldn't load this story"
          message="Check your connection and try again."
        />
      ) : !story ? (
        <StoryNotFound />
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
