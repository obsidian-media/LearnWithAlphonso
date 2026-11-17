import { Link } from "@tanstack/react-router";
import {
  groupByLevel,
  levelLabel,
  storyStatus,
  visibleStories,
  type StorySummary,
} from "../lib/stories";
import { DsCard, DsEmptyState, DsRow, Icon, Overline } from "./ds/Blocks";

/**
 * The Stories library: the reading analog of the Listen library. Stories are grouped by level; only published stories
 * in the learner's course are shown, so a story added to the database appears here without a release.
 */
export function StoriesLibraryView({
  stories,
  course,
}: {
  stories: StorySummary[];
  course: string;
}) {
  const groups = groupByLevel(visibleStories(stories, course));
  if (groups.length === 0) {
    return (
      <DsEmptyState
        icon="books"
        title="No stories yet"
        message="New stories appear here as they are published."
      />
    );
  }
  return (
    <>
      {groups.map((group) => (
        <DsCard key={group.level} flush data-level={group.level}>
          <div className="pt-3">
            <Overline>{levelLabel(group.level)}</Overline>
          </div>
          {group.stories.map((story, i) => (
            <DsRow key={story.id} first={i === 0}>
              <Link
                to="/stories/$storyId"
                params={{ storyId: story.id }}
                className="flex min-h-14 items-center gap-3 py-2"
              >
                <Icon name="books" size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate ds-type-headline text-ds-ink">{story.title}</span>
                  <span className="block ds-type-caption text-ds-ink-soft">
                    {storyStatus(story)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-ds-ink-soft">
                  ›
                </span>
              </Link>
            </DsRow>
          ))}
        </DsCard>
      ))}
    </>
  );
}
