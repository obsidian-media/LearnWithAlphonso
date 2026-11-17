import { useEffect, useRef } from "react";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import type { Course } from "@/data/courses";
import { headline, nextStarHint } from "@/lib/practice-result-copy";
import type { PracticeResult as Result } from "@/lib/practice-api";
import { MAX_STARS } from "@/lib/practice-stars";
import { practiceResultButtons, repliesMeter } from "@/lib/practice-result-buttons";
import type { RecapController } from "@/lib/use-call-recap";
import { RecapCard, RecapSkeleton } from "./RecapCard";

/**
 * After the call (mock-up screen 5): the verdict in the same room. The stars are the server's, for this call; the
 * numbers behind them are the server's tally; the line under the headline names what stood between this call and
 * the next star, from that same tally. The slip is the learner's first reply Alphonso corrected, with his reply.
 */
const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 25%, transparent) 0%, transparent 30%, var(--c-surface) 56%)";

/** A star still to earn, on a call that earned none: a dashed gold outline, not a dead grey one. */
function EmptyStar({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} text-ds-action-edge`}>
      <path
        d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.6l6.4-.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeDasharray="2.6 2.6"
        opacity=".75"
      />
    </svg>
  );
}

export function PracticeResult({
  result,
  course,
  room,
  seconds,
  slip,
  campaign,
  recap,
  onRetry,
  onForward,
}: {
  result: Result;
  course: Course;
  room: string;
  /** How long the call lasted on this device. */
  seconds: number;
  slip: { said: string; reply: string } | null;
  /** null for a scenario talk; for a campaign scene, whether it is the last one. */
  campaign: { isLastScene: boolean } | null;
  /**
   * The call recap. It takes the slip's slot while it is pending or ready; with no recap (a short call, offline, an
   * AI error) the slip shows, exactly as before.
   */
  recap?: RecapController;
  onRetry: () => void;
  /** The gold forward button: Next scene, Finish campaign or Done. */
  onForward: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const newBest = result.bestAfter > result.bestBefore && result.bestBefore > 0;
  const buttons = practiceResultButtons({ stars: result.stars, campaign });
  const meter = result.stars === 0 ? repliesMeter(result) : null;
  return (
    <section
      data-practice-result={result.stars}
      aria-labelledby="practice-result-title"
      className="relative flex min-h-dvh flex-col overflow-hidden bg-ds-surface font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[420px] bg-cover [:root[data-ds-mode=night]_&]:brightness-[.62]"
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
          {Array.from({ length: MAX_STARS }, (_, k) =>
            result.stars > 0 ? (
              <DsIcon
                key={k}
                name="star"
                solid
                className={`${k === 1 ? "size-[60px]" : "size-12"} ${k < result.stars ? "text-ds-action drop-shadow-[0_4px_0_color-mix(in_srgb,var(--c-action-edge)_35%,transparent)]" : "text-ds-line"}`}
              />
            ) : (
              <EmptyStar key={k} className={k === 1 ? "size-[62px]" : "size-[50px]"} />
            ),
          )}
        </div>
        <h2
          id="practice-result-title"
          ref={titleRef}
          tabIndex={-1}
          className="ds-type-title font-extrabold text-ds-ink outline-none"
        >
          {headline(result.stars, course)}
        </h2>
        {meter ? (
          <div
            data-replies-meter={`${meter.given}/${meter.needed}`}
            className="grid gap-2 rounded-[18px] border-2 border-ds-line bg-ds-action-tint px-3.5 py-3 text-left"
          >
            <p className="ds-type-footnote font-bold text-ds-ink">{nextStarHint(result)}</p>
            <div
              role="img"
              aria-label={`${meter.given} of ${meter.needed} replies`}
              className="flex gap-1.5"
            >
              {Array.from({ length: meter.needed }, (_, k) => (
                <i
                  key={k}
                  className={`h-2 flex-1 rounded-[5px] ${k < meter.given ? "bg-ds-action" : "bg-ds-sunk shadow-[inset_0_0_0_1.5px_var(--c-line)]"}`}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="ds-type-footnote text-ds-ink-soft">
            {nextStarHint(result)}
            {newBest && " A new best for this room."}
          </p>
        )}
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
        {recap?.status === "pending" && <RecapSkeleton />}
        {recap?.status === "ready" && <RecapCard ctl={recap} lang={course} />}
        {slip && (recap?.status ?? "off") === "off" && (
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
        <div className={`mt-auto grid gap-2 pt-2 ${buttons.retry ? "grid-cols-2" : "grid-cols-1"}`}>
          {buttons.retry && (
            <button
              type="button"
              onClick={onRetry}
              className={edgeButtonClass(buttons.retry.tone === "gold" ? "primary" : "secondary")}
            >
              {buttons.retry.label}
            </button>
          )}
          <button
            type="button"
            onClick={onForward}
            className={edgeButtonClass(buttons.forward.tone === "gold" ? "primary" : "secondary")}
          >
            {buttons.forward.label}
          </button>
        </div>
      </div>
    </section>
  );
}
