import { localDay } from "./local-day";
import type { RehearsalPathInput } from "./path-plan";
import { nextStage, stageProgress, type EventKind, type RunMemory } from "./rehearsal-rules";

/**
 * What the path engine is told about the active rehearsal: the next stage, whether every stage is done, and the learner's
 * own calendar day of the latest finished run (their zone, as everywhere on the path). Pure; the database reads live in
 * learning-path.server.ts.
 */
export function rehearsalPathInput(
  row: { id: string; event_kind: EventKind; event_date: string | null },
  runs: readonly RunMemory[],
  timeZone: string | null | undefined,
): RehearsalPathInput {
  const progress = stageProgress(runs);
  const last = runs.reduce<string | null>(
    (a, r) => (a === null || r.finishedAt > a ? r.finishedAt : a),
    null,
  );
  return {
    id: row.id,
    eventKind: row.event_kind,
    eventDate: row.event_date,
    nextStage: nextStage(progress, runs),
    allDone: Object.values(progress).every((p) => p === "done"),
    lastRunDay: last === null ? null : localDay(Date.parse(last), timeZone),
  };
}
