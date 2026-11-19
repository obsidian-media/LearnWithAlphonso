import { Link } from "@tanstack/react-router";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useProgress } from "../lib/progress";
import { mascotArt } from "../lib/mascot-poses";
import { AI_NARRATED_LABEL } from "../lib/podcast-label";
import { usePodcastPlayer } from "../lib/podcast-player";
import {
  buildShelves,
  clock,
  continueListening,
  episodeFraction,
  episodeState,
  hoursMinutes,
  secondsLeft,
  shelfLevels,
  type Course,
  type Shelf,
} from "../lib/listen-library";
import type { PodcastLibrary } from "../lib/podcast.functions";
import { slugPathFor } from "../lib/podcast-tree";
import { PodcastQuizLauncher } from "./PodcastQuizLauncher";
import { WatchShelf } from "./WatchShelf";
import { StoriesLibraryView, StoriesPeek } from "./StoriesLibrary";
import { DsEmptyState } from "./ds/Blocks";
import type { StorySummary } from "../lib/stories";
import { watchShelf, type LibraryVideo } from "../lib/video-library";

const COURSES: { id: Course; label: string }[] = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
];

export const roomArt = (room: string) => `/avatar/scenes/${room}.webp`;

function Bar({
  fraction,
  onHero = false,
  label,
}: {
  fraction: number;
  onHero?: boolean;
  label: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-2 overflow-hidden rounded-full ${onHero ? "bg-ds-on-hero/25" : "bg-ds-sunk"}`}
    >
      <div className="h-full rounded-full bg-ds-xp" style={{ width: `${pct}%` }} />
    </div>
  );
}

function shelfLink(library: PodcastLibrary, shelf: Shelf) {
  return {
    to: "/listen/$" as const,
    params: {
      _splat: (slugPathFor(library.folders, shelf.folder.id) ?? [shelf.folder.slug]).join("/"),
    },
  };
}

const plural = (n: number) => `${n} ${n === 1 ? "episode" : "episodes"}`;

export type LibraryTab = "all" | "listen" | "watch" | "stories";

const LIBRARY_TABS: { id: LibraryTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "listen", label: "Listen" },
  { id: "watch", label: "Watch" },
  { id: "stories", label: "Stories" },
];

/** The studio art for the Continue card: one square picture, centre-cropped by `object-cover`. */
export const CONTINUE_ART = "/library/continue-studio.webp";

/**
 * The sub-tab picked this session. It survives leaving the Library and coming back (a podcast folder, the player),
 * and is forgotten when the app reloads: "at most per session", and a fresh launch always starts on All.
 */
let sessionTab: LibraryTab = "all";

/** Test seam: back to a fresh launch. */
export function resetLibrarySessionTab() {
  sessionTab = "all";
}

/** The sub-tab control: a real tablist (selected state announced), arrow keys move, Home/End jump. */
function LibraryTabs({ tab, onChange }: { tab: LibraryTab; onChange: (tab: LibraryTab) => void }) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = LIBRARY_TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(LIBRARY_TABS[next]!.id);
    document.getElementById(`library-tab-${LIBRARY_TABS[next]!.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Library sections" className="flex flex-wrap gap-2">
      {LIBRARY_TABS.map((t, i) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            id={`library-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="library-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(event) => move(event, i)}
            className={`min-h-11 rounded-[14px] border-2 border-b-4 px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice ${on ? "border-ds-choice bg-ds-choice-tint text-ds-choice" : "border-ds-line bg-ds-card text-ds-brand"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Library home, under four sub-tabs. All: a Continue card plus a one-row peek of Watch and of Stories, each with
 * "See all" (which switches tab). Listen: the course's painted rooms, level chips and the month stat. Watch and
 * Stories: the focused screens. `videos` and `stories` are undefined while they load (nothing drawn / "Loading"); an
 * empty or all-other-course list draws no shelf. The Continue card resumes `continueListening` (the most recently
 * touched episode still in progress, else the next new one in that series).
 */
export function ListenLibraryView({
  library,
  videos,
  videosFailed = false,
  onRetryVideos,
  onOpenVideo,
  stories,
  storiesFailed = false,
  onRetryStories,
  onCourseChange,
  initialTab,
}: {
  library: PodcastLibrary;
  videos?: readonly LibraryVideo[];
  videosFailed?: boolean;
  onRetryVideos?: () => void;
  onOpenVideo?: (video: LibraryVideo) => void;
  stories?: StorySummary[];
  storiesFailed?: boolean;
  onRetryStories?: () => void;
  /** The learner switched course here; the stories read follows it. */
  onCourseChange?: (course: Course) => void;
  /** Overrides the remembered sub-tab (tests, deep links). */
  initialTab?: LibraryTab;
}) {
  const activeCourse = useProgress((s) => s.course);
  const [course, setCourse] = useState<Course>(activeCourse);
  const [level, setLevel] = useState<string | null>(null);
  const [tab, setTabState] = useState<LibraryTab>(initialTab ?? sessionTab);
  const setTab = (next: LibraryTab) => {
    sessionTab = next;
    setTabState(next);
  };
  const play = usePodcastPlayer((s) => s.play);

  const shelves = useMemo(
    () => buildShelves(library.folders, library.episodes, library.progress, course),
    [library, course],
  );
  const levels = shelfLevels(shelves);
  const shown =
    level && levels.includes(level) ? shelves.filter((s) => s.level === level) : shelves;
  const cont = continueListening(shelves, library.progress);
  const contFull = cont ? library.episodes.find((e) => e.id === cont.episode.id) : undefined;

  const videosError = (
    <div
      data-surface
      role="alert"
      className="flex items-center justify-between gap-3 rounded-2xl border border-ds-line bg-ds-card px-4 py-3"
    >
      <p className="text-sm font-semibold text-ds-ink">We couldn&apos;t load the videos.</p>
      <button
        type="button"
        onClick={onRetryVideos}
        className="min-h-11 rounded-full border border-ds-line px-3 text-sm font-bold text-ds-ink"
      >
        Try again
      </button>
    </div>
  );

  const storiesError = (
    <div
      data-surface
      role="alert"
      className="flex items-center justify-between gap-3 rounded-2xl border border-ds-line bg-ds-card px-4 py-3"
    >
      <p className="text-sm font-semibold text-ds-ink">We couldn&apos;t load the stories.</p>
      <button
        type="button"
        onClick={onRetryStories}
        className="min-h-11 rounded-full border border-ds-line px-3 text-sm font-bold text-ds-ink"
      >
        Try again
      </button>
    </div>
  );

  return (
    <div className="grid gap-3 px-5 pb-6 pt-4" data-testid="listen-library">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-extrabold text-ds-ink">Library</h1>
      </div>

      <div
        role="group"
        aria-label="Course"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-ds-sunk p-1"
      >
        {COURSES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={course === c.id}
            onClick={() => {
              setCourse(c.id);
              setLevel(null);
              onCourseChange?.(c.id);
            }}
            className={`min-h-11 rounded-xl px-2 text-sm font-bold ${course === c.id ? "bg-ds-card text-ds-ink shadow-sm" : "text-ds-ink-soft"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <LibraryTabs tab={tab} onChange={setTab} />

      <div
        role="tabpanel"
        id="library-panel"
        aria-labelledby={`library-tab-${tab}`}
        className="grid gap-3"
      >
        {tab === "all" ? (
          <>
            {cont && contFull ? (
              <button
                type="button"
                onClick={() => play(contFull)}
                aria-label={`Continue ${cont.shelf.folder.title}, episode ${cont.shelf.episodes.indexOf(cont.episode) + 1} of ${cont.shelf.episodes.length}: ${cont.episode.title}, ${cont.progress ? `${clock(secondsLeft(cont.episode, cont.progress))} left` : clock(cont.episode.durationSeconds)}`}
                data-testid="continue-card"
                className="relative block min-h-52 w-full overflow-hidden rounded-[22px] bg-ds-hero text-left shadow-lg"
              >
                <img
                  src={CONTINUE_ART}
                  alt=""
                  className="absolute inset-0 size-full object-cover object-center"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ds-hero/95 via-ds-hero/40 to-transparent" />
                <span
                  aria-hidden="true"
                  className="absolute bottom-3.5 right-3.5 grid size-12 place-items-center rounded-full bg-ds-action text-ds-on-action shadow-[0_4px_0_#B07A12]"
                >
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-5">
                    <path
                      d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="absolute bottom-0 left-0 right-20 block px-4 pb-3.5 text-ds-on-hero">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-ds-on-hero-kick">
                    Continue listening
                  </span>
                  <span className="mt-1 block font-display text-xl font-extrabold leading-tight">
                    {cont.episode.title}
                  </span>
                  <span className="mb-2 mt-1 block text-xs font-semibold text-ds-on-hero-soft">
                    {[
                      `Episode ${cont.shelf.episodes.indexOf(cont.episode) + 1} of ${cont.shelf.episodes.length}`,
                      cont.progress
                        ? `${clock(secondsLeft(cont.episode, cont.progress))} left`
                        : clock(cont.episode.durationSeconds),
                    ].join(" · ")}
                  </span>
                  <Bar
                    fraction={episodeFraction(cont.episode, cont.progress)}
                    onHero
                    label="Episode progress"
                  />
                </span>
              </button>
            ) : null}

            {videosFailed ? (
              videosError
            ) : videos ? (
              <WatchShelf
                videos={videos}
                course={course}
                variant="peek"
                onOpen={(v) => onOpenVideo?.(v)}
                onSeeAll={() => setTab("watch")}
              />
            ) : null}

            {storiesFailed ? (
              storiesError
            ) : stories ? (
              <StoriesPeek stories={stories} course={course} onSeeAll={() => setTab("stories")} />
            ) : null}

            {!cont &&
            !videosFailed &&
            !storiesFailed &&
            library.episodes.length === 0 &&
            (videos?.length ?? 0) === 0 &&
            (stories?.length ?? 0) === 0 ? (
              <DsEmptyState
                art={mascotArt("emptyState").src}
                title="Nothing here yet"
                message="New episodes, videos and stories appear as they are published."
              />
            ) : null}
          </>
        ) : null}

        {tab === "listen" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {levels.length > 0 ? (
                <div role="group" aria-label="Level" className="flex flex-wrap gap-2">
                  {[null, ...levels].map((l) => (
                    <button
                      key={l ?? "all"}
                      type="button"
                      aria-pressed={level === l}
                      onClick={() => setLevel(l)}
                      className={`min-h-11 rounded-[14px] border-2 border-b-4 px-3 text-xs font-extrabold ${level === l ? "border-ds-choice bg-ds-choice-tint text-ds-choice" : "border-ds-line bg-ds-card text-ds-brand"}`}
                    >
                      {l ?? "All"}
                    </button>
                  ))}
                </div>
              ) : null}
              {library.monthSeconds >= 60 ? (
                <span className="rounded-full border border-ds-line bg-ds-card px-3 py-1 text-xs font-bold text-ds-ink-soft">
                  ⏱ {hoursMinutes(library.monthSeconds)} this month
                </span>
              ) : null}
            </div>

            {shown.length === 0 ? (
              <div
                data-surface
                className="flex flex-col items-center gap-3 rounded-3xl border border-ds-line bg-ds-card p-6 text-center"
              >
                <img
                  src={mascotArt("emptyState").src}
                  alt="Alphonso"
                  className="size-28 object-contain"
                />
                <p className="text-sm font-semibold text-ds-ink">
                  {library.episodes.length === 0
                    ? "Nothing here yet. New episodes appear as they are published."
                    : `No ${COURSES.find((c) => c.id === course)!.label} episodes${level ? ` at ${level}` : ""} yet.`}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5">
                {shown.map((shelf) => (
                  <li key={shelf.folder.id}>
                    <Link
                      {...shelfLink(library, shelf)}
                      aria-label={`${shelf.folder.title}, ${shelf.level ?? "all levels"}, ${plural(shelf.episodes.length)}, ${shelf.percent === 100 ? "finished" : `${shelf.percent} percent done`}`}
                      className="relative block h-32 overflow-hidden rounded-[20px] border-2 border-ds-line bg-cover bg-center"
                      style={{ backgroundImage: `url(${roomArt(shelf.room)})` }}
                    >
                      <span className="absolute inset-0 bg-gradient-to-t from-ds-hero/85 via-ds-hero/20 to-transparent" />
                      {shelf.level ? (
                        <span className="absolute left-2 top-2 rounded-full bg-ds-card px-2 py-0.5 text-xs font-extrabold text-ds-ink">
                          {shelf.level}
                        </span>
                      ) : null}
                      <span className="absolute inset-x-3 bottom-2 text-ds-on-hero">
                        <span className="block truncate font-display text-base font-extrabold">
                          {shelf.folder.title}
                        </span>
                        <span className="block text-xs font-bold text-ds-on-hero-soft">
                          {plural(shelf.episodes.length)} ·{" "}
                          {shelf.percent === 100 ? "finished ✓" : `${shelf.percent}%`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === "watch" ? (
          videosFailed ? (
            videosError
          ) : videos ? (
            watchShelf(videos, course).length === 0 ? (
              <DsEmptyState
                art={mascotArt("emptyState").src}
                title="No videos yet"
                message="Alphonso videos appear here as they are published."
              />
            ) : (
              <WatchShelf
                videos={videos}
                course={course}
                variant="full"
                onOpen={(v) => onOpenVideo?.(v)}
              />
            )
          ) : (
            <p className="text-sm text-ds-ink-soft">Loading…</p>
          )
        ) : null}

        {tab === "stories" ? (
          storiesFailed ? (
            storiesError
          ) : stories ? (
            <StoriesLibraryView stories={stories} course={course} />
          ) : (
            <p className="text-sm text-ds-ink-soft">Loading…</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/** One folder: the room as header, one gold continue button, and every episode with its own state. */
export function ListenShelfView({
  library,
  shelf,
  quizEpisodeIds,
}: {
  library: PodcastLibrary;
  shelf: Shelf;
  quizEpisodeIds?: ReadonlySet<string>;
}) {
  const play = usePodcastPlayer((s) => s.play);
  const prog = new Map(library.progress.map((p) => [p.episodeId, p]));
  const full = new Map(library.episodes.map((e) => [e.id, e]));
  const cont = continueListening([shelf], library.progress);
  const firstNew = shelf.episodes.find((e) => episodeState(prog.get(e.id)) === "new");
  const target = cont?.episode ?? firstNew;
  const contFull = target ? full.get(target.id) : undefined;
  const totalMin = Math.max(1, Math.round(shelf.totalSeconds / 60));
  const contNo = target ? shelf.episodes.findIndex((e) => e.id === target.id) + 1 : 0;

  return (
    <div data-testid="listen-shelf">
      <div
        className="relative h-64 bg-cover bg-center"
        style={{ backgroundImage: `url(${roomArt(shelf.room)})` }}
      >
        <span className="absolute inset-0 bg-gradient-to-b from-ds-hero/45 via-transparent to-ds-surface" />
        <Link
          to="/listen"
          aria-label="Back to Library"
          className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-ds-card/90 text-lg font-extrabold text-ds-ink"
        >
          ‹
        </Link>
        <img
          src={mascotArt("lessonComplete").src}
          alt=""
          className="absolute -right-2 bottom-0 w-40"
        />
        <div className="absolute bottom-5 left-4 right-36">
          {shelf.level ? (
            <span className="rounded-full bg-ds-card px-2 py-0.5 text-xs font-extrabold text-ds-ink">
              {shelf.level}
            </span>
          ) : null}
          <h1 className="mb-1 mt-1.5 font-display text-3xl font-extrabold leading-none text-ds-ink">
            {shelf.folder.title}
          </h1>
          <p className="text-xs font-bold text-ds-ink-soft">
            Hosted by Alphonso · {plural(shelf.episodes.length)} · {totalMin} min
          </p>
        </div>
      </div>

      <div className="grid gap-1 px-5 pb-6">
        {contFull ? (
          <button
            type="button"
            onClick={() => play(contFull)}
            className="mb-1.5 min-h-12 rounded-2xl bg-ds-action px-4 text-base font-extrabold text-ds-on-action"
          >
            ▶ {cont?.progress ? "Continue" : "Start"} Episode {contNo}
          </button>
        ) : null}
        <ul className="grid gap-1">
          {shelf.episodes.map((episode, i) => {
            const p = prog.get(episode.id);
            const state = episodeState(p);
            const ep = full.get(episode.id);
            return (
              <li key={episode.id}>
                <button
                  type="button"
                  disabled={!ep}
                  onClick={() => ep && play(ep)}
                  aria-label={`${episode.title}, ${clock(episode.durationSeconds)}, ${state === "done" ? "finished" : state === "inProgress" ? `${clock(secondsLeft(episode, p))} left` : "new"}`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-ds-card px-3 py-2 text-left"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${state === "done" ? "bg-ds-right text-ds-on-right" : state === "inProgress" ? "bg-ds-xp text-ds-ink" : "bg-ds-sunk text-ds-ink-soft"}`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-bold leading-tight text-ds-ink">
                      {episode.title}
                    </span>
                    {state === "inProgress" ? (
                      <>
                        <span className="my-1 block">
                          <Bar
                            fraction={episodeFraction(episode, p)}
                            label={`${episode.title} progress`}
                          />
                        </span>
                        <span className="text-xs text-ds-ink-soft">
                          {clock(episode.durationSeconds)} · {clock(secondsLeft(episode, p))} left
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-ds-ink-soft">
                        {clock(episode.durationSeconds)}
                        {state === "new" ? (
                          <>
                            {" · "}
                            <span className="font-bold text-ds-xp-text">New</span>
                          </>
                        ) : null}
                        {ep?.aiNarrated ? ` · ${AI_NARRATED_LABEL}` : ""}
                      </span>
                    )}
                  </span>
                </button>
                {quizEpisodeIds?.has(episode.id) && ep ? (
                  <div className="px-3 pb-1 pt-2">
                    <PodcastQuizLauncher episode={ep} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
