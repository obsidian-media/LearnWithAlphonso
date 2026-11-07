import { useRef, useState } from "react";
import { formatDuration } from "../lib/podcast-player";

const ARROW_STEP_SECONDS = 5;
const PAGE_STEP_SECONDS = 30;

/**
 * Seek bar with elapsed on the left and time remaining on the right (the iOS mini-bar has a Slider too).
 * A native range input, so pointer, touch and assistive-technology adjustment all work; the keys are
 * overridden only to take bigger steps than one second, which is useless on a five-minute episode.
 * Nothing here animates, so there is no motion for Reduce Motion to remove. A drag moves only the readout;
 * the seek happens once on release, so the audio element is not flooded with requests.
 */
export function Scrubber({
  elapsed,
  duration,
  onSeek,
}: {
  elapsed: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const max = duration > 0 ? Math.round(duration) : 0;
  const value = Math.min(Math.max(Math.round(elapsed), 0), max);
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const shown = draft ?? value;
  const remaining = Math.max(max - shown, 0);

  const commit = () => {
    dragging.current = false;
    if (draft !== null) onSeek(draft);
    setDraft(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const delta: Record<string, number> = {
      ArrowRight: ARROW_STEP_SECONDS,
      ArrowUp: ARROW_STEP_SECONDS,
      ArrowLeft: -ARROW_STEP_SECONDS,
      ArrowDown: -ARROW_STEP_SECONDS,
      PageUp: PAGE_STEP_SECONDS,
      PageDown: -PAGE_STEP_SECONDS,
    };
    if (event.key === "Home") onSeek(0);
    else if (event.key === "End") onSeek(max);
    else if (event.key in delta) onSeek(value + delta[event.key]);
    else return;
    event.preventDefault();
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="tnum w-9 shrink-0 text-xs text-ds-ink-soft/70">{formatDuration(shown)}</span>
      <input
        type="range"
        aria-label="Seek"
        aria-valuetext={`${formatDuration(shown)} of ${formatDuration(max)}`}
        min={0}
        max={max}
        step={1}
        value={shown}
        disabled={max === 0}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Without a pointer drag (assistive technology, a click on the track) there is no release to wait for.
          if (dragging.current) setDraft(next);
          else onSeek(next);
        }}
        onKeyDown={onKeyDown}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-brand/60 rounded-full"
      />
      <span className="tnum w-10 shrink-0 text-right text-xs text-ds-ink-soft/70">
        -{formatDuration(remaining)}
      </span>
    </div>
  );
}
