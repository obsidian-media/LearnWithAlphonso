import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { LessonFrame } from "../../components/AppShell";
import { SaveWordProvider } from "../../components/SaveWord";
import type { Course } from "../../data/course-meta";
import { REHEARSAL_OPENERS } from "../../data/rehearsal-templates";
import type { LocalizedScenario } from "../../data/scenarios";
import { useProgress } from "../../lib/progress";
import { fetchRehearsals, type Rehearsal, type RehearsalError } from "../../lib/rehearsal-api";
import {
  EVENT_KIND_LABELS,
  STAGE_LABELS,
  isRehearsalId,
  isStage,
  type Stage,
} from "../../lib/rehearsal-rules";
import { practiceModeSearch, type PracticeModeSearch } from "../../lib/practice-session";
import { REHEARSAL_ERROR_TEXT } from "../../lib/rehearsal-copy";
import { ConverseChatPage } from "../../components/practice/ConverseCall";

export const Route = createFileRoute("/_authenticated/rehearse_/$id/$stage")({
  component: RehearseCallPage,
  validateSearch: (search: Record<string, unknown>): PracticeModeSearch =>
    practiceModeSearch(search),
  // An id or a stage that cannot exist is a plain 404 before any request is made.
  loader: ({ params }) => {
    if (!isRehearsalId(params.id) || !isStage(params.stage)) throw notFound();
    return null;
  },
  head: () => ({ meta: [{ title: "Rehearsal — Alphonso" }] }),
});

/**
 * One stage of a rehearsal as a live call: the same call screen as Practice, sourced from the rehearsal. The page
 * loads the learner's own rehearsal to name the event; the conversation itself is built by the server from the stored
 * brief and the earlier runs, and the app sends only the rehearsal id and stage.
 */
function RehearseCallPage() {
  const { id, stage } = Route.useParams();
  const { mode } = Route.useSearch();
  const course = useProgress((s) => s.course);
  const [attempt, setAttempt] = useState(0);
  const [rehearsal, setRehearsal] = useState<Rehearsal | null | undefined>(undefined);
  const [error, setError] = useState<RehearsalError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRehearsal(undefined);
    setError(null);
    void fetchRehearsals(course).then((r) => {
      if (cancelled) return;
      if (!r.ok) setError(r.error);
      else setRehearsal(r.value.active && r.value.active.id === id ? r.value.active : null);
    });
    return () => {
      cancelled = true;
    };
  }, [course, id]);

  const stageName = stage as Stage;
  const scenario = useMemo(
    () => (rehearsal ? rehearsalScenario(rehearsal, stageName, course) : null),
    [rehearsal, stageName, course],
  );

  if (error || rehearsal === null) {
    return (
      <LessonFrame>
        <div className="flex flex-col gap-4 px-5 py-8">
          <p role="alert" className="ds-type-footnote text-ds-ink">
            {error ? REHEARSAL_ERROR_TEXT[error] : "We could not find that rehearsal."}
          </p>
          <Link to="/rehearse" className="ds-type-footnote font-semibold text-ds-brand">
            Back to Rehearsals
          </Link>
        </div>
      </LessonFrame>
    );
  }
  if (!rehearsal || !scenario) {
    return (
      <LessonFrame>
        <p role="status" className="px-5 py-8 ds-type-footnote text-ds-ink-soft">
          Loading…
        </p>
      </LessonFrame>
    );
  }
  return (
    <SaveWordProvider>
      <AiConsentGate backTo="/rehearse">
        <ConverseChatPage
          key={`${rehearsal.id}:${stageName}:${course}:${attempt}`}
          scenario={scenario}
          course={course}
          mode={mode as PracticeModeSearch["mode"]}
          onRetry={() => setAttempt((a) => a + 1)}
          source={{ kind: "rehearsal", id: rehearsal.id, stage: stageName }}
          backTo="/rehearse"
          rehearsalTitle={`${EVENT_KIND_LABELS[rehearsal.eventKind]} rehearsal`}
        />
      </AiConsentGate>
    </SaveWordProvider>
  );
}

/** What the call screen shows for a rehearsal stage. Nothing here is sent to the server. */
function rehearsalScenario(r: Rehearsal, stage: Stage, course: Course): LocalizedScenario {
  return {
    id: "rehearsal",
    title: `${EVENT_KIND_LABELS[r.eventKind]}: ${STAGE_LABELS[stage]}`,
    emoji: "🎯",
    blurb: r.brief.setting,
    level: "Intermediate",
    // The server builds the prompt; the client never holds one.
    systemPrompt: "",
    opener: REHEARSAL_OPENERS[course][stage],
  };
}
