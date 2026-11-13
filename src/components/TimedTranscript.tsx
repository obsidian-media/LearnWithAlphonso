import { useEffect, useRef } from "react";
import { activeLineIndex, type TimedLine } from "../lib/podcast-timings";
import { usePrefersReducedMotion } from "../lib/use-prefers-reduced-motion";

/** After the learner scrolls by hand, auto-follow waits this long before taking over again. */
const FOLLOW_PAUSE_MS = 4000;

/**
 * The transcript, line by line, following the audio: the line being spoken is bright, the rest are dimmed, the
 * current one scrolls into view (instantly under Reduced Motion), and tapping any line seeks to its start.
 */
export function TimedTranscript({
  lines,
  elapsed,
  onSeek,
}: {
  lines: TimedLine[];
  elapsed: number;
  onSeek: (seconds: number) => void;
}) {
  const active = activeLineIndex(lines, elapsed);
  const reduceMotion = usePrefersReducedMotion();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const lastManualScroll = useRef(0);

  useEffect(() => {
    const box = boxRef.current;
    const el = activeRef.current;
    if (!box || !el || typeof box.scrollTo !== "function") return;
    if (Date.now() - lastManualScroll.current < FOLLOW_PAUSE_MS) return;
    box.scrollTo({
      top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [active, reduceMotion]);

  const paragraphs: { line: TimedLine; index: number }[][] = [];
  lines.forEach((line, index) => {
    if (line.p || paragraphs.length === 0) paragraphs.push([]);
    paragraphs[paragraphs.length - 1]!.push({ line, index });
  });

  return (
    <div
      ref={boxRef}
      data-testid="timed-transcript"
      onWheel={() => (lastManualScroll.current = Date.now())}
      onTouchMove={() => (lastManualScroll.current = Date.now())}
      className="relative min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(transparent,#000_12%,#000_82%,transparent)]"
    >
      <div className="space-y-4 py-8 text-lg font-semibold leading-snug">
        {paragraphs.map((para, pi) => (
          <p key={pi}>
            {para.map(({ line, index }) => (
              <button
                key={index}
                ref={index === active ? activeRef : undefined}
                type="button"
                onClick={() => onSeek(line.s)}
                aria-current={index === active ? "true" : undefined}
                className={`mr-1 inline cursor-pointer rounded text-left transition-colors ${
                  index === active ? "text-ds-on-hero" : "text-ds-on-hero-soft/60"
                }`}
              >
                {line.t}
              </button>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}
