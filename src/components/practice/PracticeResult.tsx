import { useEffect, useRef } from "react";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import type { Course } from "@/data/courses";
import { headline, nextStarHint } from "@/lib/practice-result-copy";
import type { PracticeResult as Result } from "@/lib/practice-api";
import { MAX_STARS } from "@/lib/practice-stars";

/**
 * After the call (mock-up screen 5): the verdict in the same room. The stars are the server's, for this call; the
 * numbers behind them are the server's tally; the line under the headline names what stood between this call and
 * the next star, from that same tally. The slip is the learner's first reply Alphonso corrected, with his reply.
 */
const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 25%, transparent) 0%, transparent 30%, var(--c-surface) 56%)";

export function PracticeResult({
  result,
  course,
  room,
  seconds,
  slip,
  onRetry,
  next,
}: {
  result: Result;
  course: Course;
  room: string;
  /** How long the call lasted on this device. */
  seconds: number;
  slip: { said: string; reply: string } | null;
  onRetry: () => void;
  next: { label: string; onClick: () => void };
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const newBest = result.bestAfter > result.bestBefore && result.bestBefore > 0;
  return (
    <section
      data-practice-result={result.stars}
      aria-labelledby="practice-result-title"
      className="ds-light relative flex min-h-dvh flex-col overflow-hidden bg-ds-surface font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[420px] bg-cover"
        style={{ backgroundImage: `url(${room})`, backgroundPosition: "center 30%" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[420px]"
        style={{ background: SCRIM }}
      />
      <img
        src={result.stars >= 2 ? "/alphonso/lesson/happy.webp" : "/alphonso/lesson/neutral.webp"}
        alt=""
        draggable={false}
        className="relative z-[1] mx-auto mt-14 w-[230px] max-w-none select-none"
      />
      <div className="relative z-[2] -mt-6 flex flex-1 flex-col gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
        <div
          role="img"
          aria-label={`${result.stars} of ${MAX_STARS} stars`}
          className="flex items-end justify-center gap-1.5"
        >
          {Array.from({ length: MAX_STARS }, (_, k) => (
            <DsIcon
              key={k}
              name="star"
              solid
              className={`${k === 1 ? "size-[60px]" : "size-12"} ${k < result.stars ? "text-ds-action drop-shadow-[0_4px_0_color-mix(in_srgb,var(--c-action-edge)_35%,transparent)]" : "text-ds-line"}`}
            />
          ))}
        </div>
        <h2
          id="practice-result-title"
          ref={titleRef}
          tabIndex={-1}
          className="ds-type-title font-extrabold text-ds-ink outline-none"
        >
          {headline(result.stars, course)}
        </h2>
        <p className="ds-type-footnote text-ds-ink-soft">
          {nextStarHint(result)}
          {newBest && " A new best for this room."}
        </p>
        <dl className="grid grid-cols-3 gap-1.5">
          {(
            [
              [`${result.rightReplies}/${result.replies}`, "replies right"],
              [formatClock(seconds), "on the call"],
              [`${result.replies - result.shortReplies}/${result.replies}`, "full sentences"],
            ] as const
          ).map(([value, label]) => (
            <div
              key={label}
              className="flex flex-col-reverse rounded-[12px] border-2 border-ds-line bg-ds-card px-1 py-1.5"
            >
              <dt className="ds-type-caption text-ds-ink-soft">{label}</dt>
              <dd className="ds-type-headline font-extrabold tabular-nums text-ds-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {slip && (
          <div
            data-slip=""
            className="rounded-[14px] border-2 border-ds-line bg-ds-card px-3 py-2 text-left"
          >
            <p className="ds-type-caption text-ds-ink-soft">Your slip</p>
            <p lang={course} className="ds-type-footnote">
              <s className="text-ds-wrong decoration-2">{slip.said}</s>
            </p>
            <p lang={course} className="mt-0.5 ds-type-footnote text-ds-right-ink">
              Alphonso: {slip.reply}
            </p>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
          <button type="button" onClick={onRetry} className={edgeButtonClass("secondary")}>
            {result.stars === MAX_STARS
              ? "Play again"
              : result.stars === 0
                ? "Try again"
                : `Try for ${result.stars + 1}`}
          </button>
          <button type="button" onClick={next.onClick} className={edgeButtonClass("primary")}>
            {next.label}
          </button>
        </div>
      </div>
    </section>
  );
}
