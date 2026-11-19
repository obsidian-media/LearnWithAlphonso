import { Link } from "@tanstack/react-router";
import {
  groupByLevel,
  levelLabel,
  storyStatus,
  visibleStories,
  type StorySummary,
} from "../lib/stories";
import { DsCard, DsEmptyState, DsPill, DsRow, Icon, Overline } from "./ds/Blocks";

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
                <Icon name={story.branching ? "compass" : "books"} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate ds-type-headline text-ds-ink">
                      {story.title}
                    </span>
                    {story.branching ? <DsPill tone="choice">Choose your path</DsPill> : null}
                  </span>
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

/** How many story cards the Library's "All" tab shows in its one-row peek. */
export const STORIES_PEEK_COUNT = 3;

/**
 * The Library "All" tab's one-row peek at Stories: the first few published stories for the course as small cards, with
 * "See all" to the focused Stories tab. Draws nothing when there are none (no empty box). A branching story says
 * "Choose your path", the same words as the full list.
 */
export function StoriesPeek({
  stories,
  course,
  onSeeAll,
}: {
  stories: StorySummary[];
  course: string;
  onSeeAll?: () => void;
}) {
  const shown = visibleStories(stories, course).slice(0, STORIES_PEEK_COUNT);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="stories-peek-title" data-testid="stories-peek" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="stories-peek-title" className="font-display text-xl font-extrabold text-ds-ink">
          Stories
        </h2>
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            aria-label="See all stories"
            className="min-h-11 px-1 text-sm font-extrabold text-ds-choice"
          >
            See all ›
          </button>
        ) : null}
      </div>
      <ul className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {shown.map((story) => (
          <li key={story.id} className="w-40 shrink-0">
            <Link
              to="/stories/$storyId"
              params={{ storyId: story.id }}
              aria-label={`${story.title}, ${story.level}, ${storyStatus(story)}`}
              className="flex h-full min-h-28 flex-col justify-between gap-2 rounded-[18px] border-2 border-ds-line bg-ds-card p-3"
            >
              <span className="flex items-center justify-between">
                <Icon name={story.branching ? "compass" : "books"} size={32} />
                <span className="rounded-lg bg-ds-choice-tint px-1.5 text-xs font-extrabold text-ds-choice">
                  {story.level}
                </span>
              </span>
              <span>
                <span className="block font-display text-sm font-extrabold leading-tight text-ds-ink">
                  {story.title}
                </span>
                <span className="block text-xs font-semibold text-ds-ink-soft">
                  {storyStatus(story)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
