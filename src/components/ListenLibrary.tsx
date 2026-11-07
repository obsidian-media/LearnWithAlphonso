import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

/** The Listen home: continue-listening card, course switch, level chips, and a painted room per folder. */
export function ListenLibraryView({ library }: { library: PodcastLibrary }) {
  const activeCourse = useProgress((s) => s.course);
  const [course, setCourse] = useState<Course>(activeCourse);
  const [level, setLevel] = useState<string | null>(null);
  const play = usePodcastPlayer((s) => s.play);

  const shelves = useMemo(
    () => buildShelves(library.folders, library.episodes, library.progress, course),
    [library, course],
  );
  const levels = shelfLevels(shelves);
  const shown = level && levels.includes(level) ? shelves.filter((s) => s.level === level) : shelves;
  const cont = continueListening(shelves, library.progress);
  const contFull = cont ? library.episodes.find((e) => e.id === cont.episode.id) : undefined;
  const alphonso = mascotArt("learnGreeting").src;

  return (
    <div className="grid gap-3 px-5 pb-6 pt-4" data-testid="listen-library">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-extrabold text-ds-ink">Listen</h1>
        {library.monthSeconds >= 60 ? (
          <span className="rounded-full border border-ds-line bg-ds-card px-3 py-1 text-xs font-bold text-ds-ink-soft">
            ⏱ {hoursMinutes(library.monthSeconds)} this month
          </span>
        ) : null}
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
            }}
            className={`min-h-11 rounded-xl px-2 text-sm font-bold ${course === c.id ? "bg-ds-card text-ds-ink shadow-sm" : "text-ds-ink-soft"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {cont && contFull ? (
        <button
          type="button"
          onClick={() => play(contFull)}
          aria-label={`Continue listening: ${cont.episode.title}, ${clock(secondsLeft(cont.episode, cont.progress))} left`}
          className="relative h-44 w-full overflow-hidden rounded-3xl border-2 border-ds-xp bg-cover bg-center text-left"
          style={{ backgroundImage: `url(${roomArt(cont.shelf.room)})` }}
        >
          <span className="absolute inset-0 bg-gradient-to-t from-ds-hero/90 via-ds-hero/30 to-ds-hero/10" />
          <img src={alphonso} alt="" className="absolute -right-3 bottom-0 w-32" />
          <span className="absolute left-4 top-3.5 text-xs font-extrabold tracking-wider text-ds-on-hero-kick">
            CONTINUE LISTENING
          </span>
          <span className="absolute bottom-3.5 left-4 right-32 text-ds-on-hero">
            <span className="block font-display text-xl font-extrabold leading-tight">
              {cont.episode.title}
            </span>
            <span className="mb-2 mt-1 block text-xs font-semibold text-ds-on-hero-soft">
              {[
                cont.shelf.level,
                `Episode ${cont.shelf.episodes.indexOf(cont.episode) + 1}`,
                cont.progress
                  ? `${clock(secondsLeft(cont.episode, cont.progress))} left`
                  : clock(cont.episode.durationSeconds),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <Bar
              fraction={episodeFraction(cont.episode, cont.progress)}
              onHero
              label="Episode progress"
            />
          </span>
        </button>
      ) : null}

      {levels.length > 0 ? (
        <div role="group" aria-label="Level" className="flex flex-wrap gap-2">
          {[null, ...levels].map((l) => (
            <button
              key={l ?? "all"}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={`min-h-9 rounded-full border px-3 text-xs font-extrabold ${level === l ? "border-ds-action bg-ds-action text-ds-on-action" : "border-ds-line bg-ds-card text-ds-ink-soft"}`}
            >
              {l ?? "All"}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div
          data-surface
          className="flex flex-col items-center gap-3 rounded-3xl border border-ds-line bg-ds-card p-6 text-center"
        >
          <img src={mascotArt("emptyState").src} alt="Alphonso" className="size-28 object-contain" />
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
          aria-label="Back to Listen"
          className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-ds-card/90 text-lg font-extrabold text-ds-ink"
        >
          ‹
        </Link>
        <img src={mascotArt("lessonComplete").src} alt="" className="absolute -right-2 bottom-0 w-40" />
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
                        {ep?.aiNarrated ? ` · ${AI_NARRATED_LABEL}` : ""} · Transcript
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
