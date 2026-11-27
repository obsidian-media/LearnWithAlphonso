import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Course } from "@/data/course-meta";
import { shortDay } from "@/lib/rehearsal-dates";
import { EVENT_KIND_LABELS } from "@/lib/rehearsal-rules";
import { useProStatus } from "@/lib/use-pro-status";
import { useRehearsalEntry } from "@/lib/use-rehearsal-entry";
import { RehearsalPaywallSheet } from "../rehearsal/RehearsalPaywallSheet";
import { CARD, CardBody } from "./RailCard";

/**
 * The entry to Rehearsals: the last card in Learn's For you rail. "Rehearse / a real talk" before a plan exists, the
 * event and its day once one does. For a learner who is not Pro and has used the free rehearsal, a tap opens the Pro
 * sheet right here (at the moment of intent) instead of a screen that cannot be used. Absent while the server flag is
 * off or the state cannot be read.
 */
export function RehearsalRailCard({ course }: { course: Course }) {
  const entry = useRehearsalEntry(course);
  const pro = useProStatus();
  const [sheet, setSheet] = useState(false);
  if (entry.status !== "ready" || !entry.state) return null;
  const { active, freeAvailable, history } = entry.state;

  if (active) {
    const value = `${EVENT_KIND_LABELS[active.eventKind]}${
      active.eventDate ? ` · ${shortDay(active.eventDate)}` : ""
    }`;
    return (
      <Link to="/rehearse" aria-label={`Rehearsal: ${value}`} className={CARD}>
        <CardBody icon="speech_balloon" label="Rehearsal" value={value} />
      </Link>
    );
  }

  const label = "Rehearse a real talk";
  if (!freeAvailable && pro.state === "free") {
    return (
      <>
        <button type="button" aria-label={label} onClick={() => setSheet(true)} className={CARD}>
          <CardBody icon="speech_balloon" label="Rehearse" value="a real talk" />
        </button>
        {sheet && <RehearsalPaywallSheet done={history[0] ?? null} onClose={() => setSheet(false)} />}
      </>
    );
  }
  return (
    <Link to="/rehearse" aria-label={label} className={CARD}>
      <CardBody icon="speech_balloon" label="Rehearse" value="a real talk" />
    </Link>
  );
}
