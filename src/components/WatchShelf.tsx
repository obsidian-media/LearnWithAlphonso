import { clock } from "../lib/listen-library";
import {
  videoFraction,
  videoState,
  watchShelf,
  type LibraryVideo,
  type VideoCourse,
} from "../lib/video-library";

/** How many posters the "All" tab's one-row peek shows. */
export const WATCH_PEEK_COUNT = 3;

const stateWord = (state: ReturnType<typeof videoState>) =>
  state === "done" ? "watched" : state === "inProgress" ? "in progress" : "new";

/**
 * The Library's Watch videos as vertical posters. A poster shows its state (New badge, a progress bar, or a tick when
 * watched) and its length. `peek` is the one-row preview on the Library's "All" tab (the first few, with "See all");
 * `full` is the focused Watch tab (every video, wrapped). With no video for the course it draws NOTHING (no empty box):
 * the shelf appears when the first video is published. Every title, length and state comes from the rows; the
 * database tracks all three states, so none is invented here.
 */
export function WatchShelf({
  videos,
  course,
  onOpen,
  variant = "full",
  onSeeAll,
}: {
  videos: readonly LibraryVideo[];
  course: VideoCourse;
  onOpen: (video: LibraryVideo) => void;
  variant?: "peek" | "full";
  onSeeAll?: () => void;
}) {
  const all = watchShelf(videos, course);
  if (all.length === 0) return null;
  const peek = variant === "peek";
  const shown = peek ? all.slice(0, WATCH_PEEK_COUNT) : all;
  return (
    <section aria-labelledby="watch-shelf-title" data-testid="watch-shelf" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="watch-shelf-title" className="font-display text-xl font-extrabold text-ds-ink">
          Watch
        </h2>
        {peek && onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            aria-label="See all videos"
            className="min-h-11 px-1 text-sm font-extrabold text-ds-choice"
          >
            See all ›
          </button>
        ) : null}
      </div>
      <ul
        className={
          peek ? "-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1" : "grid grid-cols-3 gap-2.5"
        }
      >
        {shown.map((video) => {
          const state = videoState(video);
          const fraction = videoFraction(video);
          return (
            <li key={video.id} className={peek ? "w-28 shrink-0" : "min-w-0"}>
              <button
                type="button"
                onClick={() => onOpen(video)}
                aria-label={`${video.title}, ${clock(video.durationSeconds)}, ${stateWord(state)}`}
                className="block w-full text-left"
              >
                <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl bg-ds-sunk shadow-sm">
                  {video.posterUrl ? (
                    <img src={video.posterUrl} alt="" className="size-full object-cover" />
                  ) : null}
                  <span className="absolute inset-0 bg-gradient-to-t from-ds-hero/60 via-transparent to-transparent" />
                  {video.level ? (
                    <span className="absolute left-1.5 top-1.5 rounded-lg bg-ds-choice-tint px-1.5 text-xs font-extrabold text-ds-choice">
                      {video.level}
                    </span>
                  ) : null}
                  {state === "new" ? (
                    <span className="absolute right-1.5 top-1.5 rounded-lg bg-ds-heart px-1.5 text-[10px] font-extrabold tracking-wide text-white">
                      NEW
                    </span>
                  ) : null}
                  <span className="absolute inset-0 grid place-items-center text-white drop-shadow">
                    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
                      <path
                        d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  {state === "done" ? (
                    <span className="absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-ds-card text-xs font-extrabold text-ds-right">
                      ✓
                    </span>
                  ) : (
                    <span className="tnum absolute bottom-1.5 right-1.5 rounded-lg bg-ds-hero/70 px-1.5 text-[10px] font-extrabold text-white">
                      {clock(video.durationSeconds)}
                    </span>
                  )}
                  {state === "inProgress" ? (
                    <span
                      role="progressbar"
                      aria-label={`${video.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(fraction * 100)}
                      className="absolute inset-x-0 bottom-0 block h-1.5 bg-white/30"
                    >
                      <span
                        className="block h-full bg-ds-xp"
                        style={{ width: `${Math.round(fraction * 100)}%` }}
                      />
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-sm font-bold leading-tight text-ds-ink">
                  {video.title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
