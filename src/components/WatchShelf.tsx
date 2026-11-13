import { clock } from "../lib/listen-library";
import {
  videoFraction,
  videoState,
  watchShelf,
  type LibraryVideo,
  type VideoCourse,
} from "../lib/video-library";

/**
 * The Library's "Watch" shelf: the course's Alphonso videos as a row of vertical posters. A finished video shows a tick,
 * one in progress shows a bar. With no video for the course it draws NOTHING (no empty box): the shelf appears when the
 * first video is published. Every title, length and state comes from the rows.
 */
export function WatchShelf({
  videos,
  course,
  onOpen,
}: {
  videos: readonly LibraryVideo[];
  course: VideoCourse;
  onOpen: (video: LibraryVideo) => void;
}) {
  const shown = watchShelf(videos, course);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="watch-shelf-title" data-testid="watch-shelf" className="grid gap-2">
      <h2 id="watch-shelf-title" className="font-display text-xl font-extrabold text-ds-ink">
        Watch
      </h2>
      <ul className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {shown.map((video) => {
          const state = videoState(video);
          const fraction = videoFraction(video);
          return (
            <li key={video.id} className="w-32 shrink-0">
              <button
                type="button"
                onClick={() => onOpen(video)}
                aria-label={`${video.title}, ${clock(video.durationSeconds)}, ${state === "done" ? "watched" : state === "inProgress" ? "in progress" : "new"}`}
                className="block w-full text-left"
              >
                <span className="relative block aspect-[9/16] overflow-hidden rounded-2xl border-2 border-ds-line bg-ds-sunk">
                  {video.posterUrl ? (
                    <img src={video.posterUrl} alt="" className="size-full object-cover" />
                  ) : null}
                  <span className="absolute inset-0 bg-gradient-to-t from-ds-hero/70 via-transparent to-transparent" />
                  {video.level ? (
                    <span className="absolute left-2 top-2 rounded-full bg-ds-card px-2 py-0.5 text-xs font-extrabold text-ds-ink">
                      {video.level}
                    </span>
                  ) : null}
                  {state === "done" ? (
                    <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-ds-right text-sm font-extrabold text-ds-on-right">
                      ✓
                    </span>
                  ) : null}
                  <span className="absolute bottom-2 left-2 grid size-9 place-items-center rounded-full bg-ds-card/90 text-sm text-ds-ink">
                    ▶
                  </span>
                  {state === "inProgress" ? (
                    <span
                      role="progressbar"
                      aria-label={`${video.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(fraction * 100)}
                      className="absolute inset-x-0 bottom-0 block h-1.5 bg-ds-sunk"
                    >
                      <span
                        className="block h-full bg-ds-xp"
                        style={{ width: `${Math.round(fraction * 100)}%` }}
                      />
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-sm font-extrabold leading-tight text-ds-ink">
                  {video.title}
                </span>
                <span className="block text-xs text-ds-ink-soft">
                  {clock(video.durationSeconds)}
                  {state === "new" ? (
                    <>
                      {" · "}
                      <span className="font-bold text-ds-xp-text">New</span>
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
