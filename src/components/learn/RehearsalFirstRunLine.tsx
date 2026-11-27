import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Course } from "@/data/course-meta";
import { useLearnerGoal } from "@/lib/use-learner-goal";
import { useRehearsalEntry } from "@/lib/use-rehearsal-entry";

const KEY = "alphonso.rehearsalFirstRunLine.dismissed";
const dismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The one optional line for learners whose goal is work: "Got a real conversation coming up? Rehearse it with
 * Alphonso." Only while Rehearsals is on, before the learner has made one or used their free one, and until dismissed.
 */
export function RehearsalFirstRunLine({ course }: { course: Course }) {
  const goal = useLearnerGoal();
  const entry = useRehearsalEntry(course);
  const [hidden, setHidden] = useState(dismissed);
  if (hidden || goal !== "work" || entry.status !== "ready" || !entry.state) return null;
  if (entry.state.active || !entry.state.freeAvailable) return null;
  return (
    <div className="my-3 flex items-center gap-3 rounded-2xl border-2 border-ds-line bg-ds-card px-3.5 py-3">
      <p className="min-w-0 flex-1 ds-type-footnote text-ds-ink">
        Got a real conversation coming up? Rehearse it with Alphonso.
      </p>
      <Link
        to="/rehearse"
        className="shrink-0 rounded-full bg-ds-brand px-4 py-1.5 ds-type-footnote font-semibold text-ds-card"
      >
        Rehearse
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* the line may show again; harmless */
          }
          setHidden(true);
        }}
        className="shrink-0 ds-type-footnote text-ds-ink-soft"
      >
        ✕
      </button>
    </div>
  );
}
