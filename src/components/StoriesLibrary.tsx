import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  cardCaption,
  cardLabel,
  endingsFraction,
  heroLine,
  resumeLine,
  storiesLibrary,
  visibleStories,
  type StorySummary,
} from "../lib/stories";
import { DsEmptyState, Icon } from "./ds/Blocks";

/**
 * Cover art for a story: the first scene's picture, or a designed fallback (brand-to-scene gradient and a 3D icon) when
 * there is no art or it fails to load, so a card is never a broken image. Decorative: the card carries the name.
 */
function Cover({
  story,
  iconSize,
  className = "",
}: {
  story: StorySummary;
  iconSize: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = story.coverUrl && story.coverUrl !== failedUrl ? story.coverUrl : null;
  return (
    <span
      aria-hidden="true"
      data-cover={url ? "art" : "fallback"}
      className={`relative block overflow-hidden bg-gradient-to-br from-ds-hero-a to-ds-hero-b ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center">
          <Icon name={story.branching ? "compass" : "books"} size={iconSize} />
        </span>
      )}
    </span>
  );
}

/** The endings-found ring: decorative, the same fact is in the card's name and caption ("2 of 5 endings"). */
function EndingsRing({ story, size = 36 }: { story: StorySummary; size?: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const fraction = endingsFraction(story);
  return (
    <svg
      aria-hidden="true"
      data-testid="endings-ring"
      data-fraction={fraction}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx="18"
        cy="18"
        r={r}
        strokeWidth="4"
        className="fill-ds-hero/70 stroke-ds-on-hero/35"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${c * fraction} ${c}`}
        className="text-ds-xp"
      />
    </svg>
  );
}

/** One cover card: a single link with its full name; `small` is the Library peek's size. */
function StoryCard({ story, small = false }: { story: StorySummary; small?: boolean }) {
  return (
    <Link
      to="/stories/$storyId"
      params={{ storyId: story.id }}
      aria-label={cardLabel(story)}
      data-testid="story-card"
      className="block min-h-11 overflow-hidden rounded-2xl border-2 border-ds-line bg-ds-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice"
    >
      <span className="relative block aspect-[4/3]">
        <Cover story={story} iconSize={small ? 40 : 56} className="h-full w-full" />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ds-hero/70 to-transparent"
        />
        {story.branching ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ds-choice px-2 py-0.5 text-xs font-extrabold text-white">
            <Icon name="compass" size={12} />
            Path
          </span>
        ) : null}
        {story.branching && story.endingsTotal > 0 ? (
          <span className="absolute right-2 top-2 text-white">
            <EndingsRing story={story} size={small ? 30 : 36} />
          </span>
        ) : null}
      </span>
      <span className="block p-2.5">
        <span className="rounded-lg bg-ds-choice-tint px-1.5 text-xs font-extrabold text-ds-choice">
          {story.level}
        </span>
        <span className="mt-1 block font-display text-sm font-extrabold leading-tight text-ds-ink">
          {story.title}
        </span>
        <span className="block text-xs font-semibold text-ds-ink-soft">{cardCaption(story)}</span>
      </span>
    </Link>
  );
}

function FeaturedHero({ story }: { story: StorySummary }) {
  const action = story.endingsFound > 0 ? "Continue" : "Read now";
  return (
    <Link
      to="/stories/$storyId"
      params={{ storyId: story.id }}
      aria-label={`${cardLabel(story)}, ${action}`}
      data-testid="stories-hero"
      className="relative block min-h-56 overflow-hidden rounded-[20px] shadow-[var(--ds-shadow-floating)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice"
    >
      <Cover story={story} iconSize={96} className="absolute inset-0 h-full w-full" />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ds-hero/90 via-ds-hero/55 via-[40%] to-transparent to-[75%]"
      />
      <span className="relative flex min-h-56 flex-col justify-end gap-1.5 p-4 text-white">
        <span className="flex w-fit items-center gap-1 rounded-full bg-ds-choice px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white">
          <Icon name="compass" size={14} />
          Choose your path
        </span>
        <span className="font-display text-xl font-extrabold leading-tight">{story.title}</span>
        <span className="text-xs font-semibold text-white/80">{heroLine(story)}</span>
        <span className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-ds-action pl-4 pr-1.5 text-sm font-extrabold text-ds-on-action">
          {action}
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full bg-ds-on-action/15 text-xs"
          >
            ▶
          </span>
        </span>
      </span>
    </Link>
  );
}

function ContinueLine({ story }: { story: StorySummary }) {
  return (
    <Link
      to="/stories/$storyId"
      params={{ storyId: story.id }}
      aria-label={`${story.title}, ${resumeLine(story)}, Resume`}
      data-testid="stories-continue"
      className="flex min-h-14 items-center gap-3 rounded-[18px] border-2 border-ds-line bg-ds-card p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice"
    >
      <Cover story={story} iconSize={28} className="h-10 w-[52px] shrink-0 rounded-[9px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-extrabold text-ds-ink">
          {story.title}
        </span>
        <span className="block text-xs font-semibold text-ds-ink-soft">{resumeLine(story)}</span>
      </span>
      <span className="rounded-full bg-ds-choice px-3 py-2 text-xs font-extrabold text-white">
        Resume
      </span>
    </Link>
  );
}

/**
 * The Stories library: a featured branching story, a line to resume what you started, then cover cards. Only published
 * stories in the learner's course are shown, so a story added to the database appears here without a release.
 */
export function StoriesLibraryView({
  stories,
  course,
}: {
  stories: StorySummary[];
  course: string;
}) {
  const { featured, resume, grid } = storiesLibrary(stories, course);
  if (!featured && !resume && grid.length === 0) {
    return (
      <DsEmptyState
        icon="books"
        title="No stories yet"
        message="New stories appear here as they are published."
      />
    );
  }
  return (
    <div className="grid gap-4">
      {featured ? <FeaturedHero story={featured} /> : null}
      {resume ? <ContinueLine story={resume} /> : null}
      {grid.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="stories-grid">
          {grid.map((story) => (
            <li key={story.id}>
              <StoryCard story={story} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** How many story cards the Library's "All" tab shows in its one-row peek. */
export const STORIES_PEEK_COUNT = 3;

/**
 * The Library "All" tab's one-row peek at Stories: the first few published stories for the course as small cover
 * cards, with "See all" to the focused Stories tab. Draws nothing when there are none (no empty box). A branching
 * story says "Choose your path", the same words as the full library.
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
            <StoryCard story={story} small />
          </li>
        ))}
      </ul>
    </section>
  );
}
