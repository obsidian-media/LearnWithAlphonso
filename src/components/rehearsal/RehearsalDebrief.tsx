import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AiLabel } from "@/components/AiLabel";
import type { Course } from "@/data/course-meta";
import { fetchRehearsals, type RehearsalState } from "@/lib/rehearsal-api";
import { HowYouSpoke } from "@/components/rehearsal/HowYouSpoke";
import { debriefTitle } from "@/lib/rehearsal-copy";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/rehearsal-rules";
import type { RehearsalSpeaking } from "@/lib/rehearsal-speaking";

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; state: RehearsalState };

const minutesText = (seconds: number) => {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
};

/**
 * After a rehearsal run, in place of a stars result (a rehearsal has no stars and no readiness number). It reads the
 * run the recap just wrote (moment labels and corrected forms only, never the learner's words): what went well, what
 * to try next time, where the trouble spots went, and ONE next step. A run too short to count says so plainly.
 * `recapStatus` gates the read: the run is written when the recap finishes.
 */
export function RehearsalDebrief({
  course,
  rehearsalId,
  stage,
  seconds,
  turns,
  recapStatus,
  fixCount,
  speaking = null,
  onRunAgain,
  onDone,
}: {
  course: Course;
  rehearsalId: string;
  stage: Stage;
  seconds: number;
  turns: number;
  recapStatus: "off" | "pending" | "ready" | "failed";
  /** How many items the recap sent to Fix before it sticks (Review). */
  fixCount: number;
  /** "How you spoke" from the recap answer; hidden when absent. */
  speaking?: RehearsalSpeaking | null;
  onRunAgain: () => void;
  onDone: () => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const waiting = recapStatus === "pending";

  useEffect(() => {
    if (waiting) return;
    let live = true;
    void fetchRehearsals(course).then((r) => {
      if (live) setLoad(r.ok ? { kind: "ready", state: r.value } : { kind: "failed" });
    });
    return () => {
      live = false;
    };
  }, [course, waiting]);

  if (waiting || load.kind === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Your rehearsal run"
        className="flex flex-col gap-3 px-5 py-8"
      >
        <p role="status" className="ds-type-footnote text-ds-ink-soft">
          Alphonso is writing it up
        </p>
      </section>
    );
  }

  const state = load.kind === "ready" ? load.state : null;
  const run = state?.runs.filter((r) => r.stage === stage).at(-1) ?? null;
  const kind = state?.active?.eventKind ?? "other";
  const next = state?.nextStage ?? STAGES[(STAGES.indexOf(stage) + 1) % STAGES.length];

  return (
    <section aria-label="Your rehearsal run" className="flex flex-col gap-5 px-5 py-6">
      <div>
        <p className="ds-type-caption font-semibold uppercase tracking-wide text-ds-ink-soft">
          Stage {STAGES.indexOf(stage) + 1} · {STAGE_LABELS[stage]}
        </p>
        <h1 className="mt-1 font-display ds-type-title font-semibold text-ds-ink">
          {run ? debriefTitle(stage, kind) : "That one was too short to count"}
        </h1>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          {minutesText(seconds)} · {turns} turns
        </p>
      </div>

      {run ? (
        <>
          <HowYouSpoke speaking={speaking} course={course} />
          {run.wentWell.length > 0 && (
            <List title="What went well" items={run.wentWell} tone="good" />
          )}
          {run.corrections.length > 0 && (
            <List title="Try again next time" items={run.corrections} tone="retry" />
          )}
          {fixCount > 0 && (
            <div className="rounded-2xl bg-ds-heart-tint px-4 py-3">
              <p className="ds-type-footnote font-semibold text-ds-heart-text">
                Added to Fix before it sticks
              </p>
              <p className="ds-type-caption text-ds-ink">
                {fixCount} {fixCount === 1 ? "item" : "items"}. They will come back in Review and in
                a short lesson.
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="ds-type-footnote text-ds-ink">
          A run needs a few more replies before it counts. Nothing was kept from this one. Run it
          again when you are ready.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {run && state?.active && (
          <Link
            to="/rehearse/$id/$stage"
            params={{ id: rehearsalId, stage: next }}
            className="rounded-full bg-ds-brand px-5 py-3 text-center font-semibold text-ds-card"
          >
            Next: {STAGE_LABELS[next]}
          </Link>
        )}
        <button
          type="button"
          onClick={onRunAgain}
          className="rounded-full border border-ds-line px-5 py-3 font-semibold text-ds-ink"
        >
          Run this stage again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="ds-type-footnote font-semibold text-ds-ink-soft underline"
        >
          Done
        </button>
      </div>

      <p className="flex items-start gap-2 ds-type-caption text-ds-ink-soft">
        <AiLabel className="mt-0.5" />
        <span>
          Written by Alphonso, an AI, from this conversation. It can be wrong. Nothing here is a
          score.
        </span>
      </p>
    </section>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "good" | "retry" }) {
  return (
    <div>
      <h2 className="ds-type-headline font-semibold text-ds-ink">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((t) => (
          <li
            key={t}
            className={`rounded-2xl px-4 py-3 ds-type-footnote text-ds-ink ${
              tone === "good" ? "bg-ds-right-tint" : "bg-ds-sunk"
            }`}
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
