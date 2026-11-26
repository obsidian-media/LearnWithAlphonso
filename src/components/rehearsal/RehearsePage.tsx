import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Course } from "@/data/course-meta";
import { fetchRehearsals, type RehearsalError, type RehearsalState } from "@/lib/rehearsal-api";
import { ActiveRehearsal } from "./ActiveRehearsal";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import { RehearsalIntakeForm } from "./RehearsalIntakeForm";

/**
 * Rehearsals: the intake while there is no active rehearsal, the active one otherwise. The page is behind the server
 * flag REHEARSALS_ENABLED: while it is off, the API answers "not_enabled" and the learner sees a plain "not available"
 * instead of a form that could never be submitted.
 */
export function RehearsePage({ course }: { course: Course }) {
  const [state, setState] = useState<RehearsalState | null>(null);
  const [error, setError] = useState<RehearsalError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchRehearsals(course);
    if (result.ok) setState(result.value);
    else setError(result.error);
  }, [course]);

  useEffect(() => {
    setState(null);
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 px-5 py-8">
        <p role="alert" className="ds-type-footnote text-ds-ink">
          {REHEARSAL_ERROR_TEXT[error]}
        </p>
        {error === "not_enabled" ? (
          <Link to="/learn" className="ds-type-footnote font-semibold text-ds-brand">
            Back to Learn
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            className="self-start rounded-full border border-ds-line px-4 py-2 ds-type-footnote font-semibold text-ds-ink"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!state) {
    return (
      <p role="status" className="px-5 py-8 ds-type-footnote text-ds-ink-soft">
        Loading…
      </p>
    );
  }
  if (state.active) {
    return <ActiveRehearsal rehearsal={state.active} onDeleted={() => void load()} />;
  }
  return <RehearsalIntakeForm course={course} onCreated={() => void load()} />;
}
