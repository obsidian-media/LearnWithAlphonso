import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Course } from "@/data/course-meta";
import { usePath } from "@/lib/learning-path-client";
import type { PinnedItem } from "@/lib/path-plan";
import { StagePartnerSheet } from "@/components/rehearsal/StagePartnerSheet";
import { EVENT_SHORT, type Stage } from "@/lib/rehearsal-rules";

/** Where a pinned item opens: a stage (or the event-day warm-up) is that stage's call; "How did it go?" is the page. */
function Target({
  item,
  className,
  children,
}: {
  item: PinnedItem;
  className: string;
  children: React.ReactNode;
}) {
  if (item.stage === null)
    return (
      <Link to="/rehearse" className={className}>
        {children}
      </Link>
    );
  return (
    <StageOpener
      rehearsalId={item.rehearsalId}
      stage={item.stage}
      className={`${className} w-full text-left`}
    >
      {children}
    </StageOpener>
  );
}

/** A stage shortcut: opens the partner sheet (Alphonso or Hector) instead of starting a call. */
function StageOpener({
  rehearsalId,
  stage,
  className,
  children,
}: {
  rehearsalId: string;
  stage: Stage;
  className: string;
  children: React.ReactNode;
}) {
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setChoosing(true)} className={className}>
        {children}
      </button>
      {choosing && (
        <StagePartnerSheet
          rehearsalId={rehearsalId}
          stage={stage}
          hectorAvailable={null}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}

/**
 * The rehearsal's pinned items at the top of Today: at most one, highlighted so it is the first thing seen. They are
 * the server's words (path.pinned); nothing here is typed in. An older server sends none.
 */
export function PinnedRows({ pinned }: { pinned: PinnedItem[] | undefined }) {
  if (!pinned || pinned.length === 0) return null;
  return (
    <>
      {pinned.map((item) => (
        <li key={`${item.kind}-${item.rehearsalId}`}>
          <Target
            item={item}
            className="flex min-h-11 items-center gap-3 rounded-2xl bg-ds-flame-tint px-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block ds-type-headline font-semibold text-ds-ink">{item.title}</span>
              <span className="block ds-type-caption text-ds-ink-soft">
                {item.subtitle}
                {item.minutes > 0 ? ` · ${item.minutes} min` : ""}
              </span>
            </span>
          </Target>
        </li>
      ))}
    </>
  );
}

/** The event-day hero item for this course, or null (every other day, after the event, or while the path is unknown). */
export function useHeroPinned(course: Course): PinnedItem | null {
  const { state } = usePath(course);
  if (state.kind !== "ready") return null;
  const item = state.path.pinned?.find((p) => p.hero);
  return item && item.stage !== null ? item : null;
}

/**
 * On the day of the event the 2-minute warm-up TAKES the top of Learn for that day only: the Learn page shows this
 * instead of the lesson hero and map (the next day the lesson is back).
 */
export function RehearsalHero({ item }: { item: PinnedItem }) {
  if (item.stage === null) return null;
  return (
    <section
      aria-label="Rehearsal today"
      className="my-4 rounded-3xl bg-ds-hero px-5 py-5 text-ds-on-hero"
    >
      <p className="ds-type-overline text-ds-on-hero-kick">
        {capitalise(EVENT_SHORT[item.eventKind])} today
      </p>
      <h2 className="mt-1 font-display ds-type-title font-semibold">2-minute warm-up</h2>
      <p className="mt-1 ds-type-footnote text-ds-on-hero-soft">
        Say the key phrases once more before you go
      </p>
      <StageOpener
        rehearsalId={item.rehearsalId}
        stage={item.stage}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ds-card px-5 font-semibold text-ds-ink"
      >
        Start 2 minutes
      </StageOpener>
    </section>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
