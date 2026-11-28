import { REHEARSAL_USAGE_EVENT_NAMES } from "./ops-events-config";
import { OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS, recordOpsEvent } from "./ops-events.server";

/**
 * Counts-only usage of Rehearsals, written as rows in ops_events (the table the System health page already reads) so the
 * owner can see whether the feature is used. A row holds the event name and ONE closed-list label (where a rehearsal
 * came from, which stage, which outcome tap, why the paywall showed). It carries NO account id and no text of any kind,
 * so it can only be counted, never traced to a learner.
 *
 *   rehearsal_created         source: intake (quick_start is for the quick-start slice)
 *   rehearsal_stage_finished  stage: warmup | conversation | hard_moments (a run that met the finish rule)
 *   rehearsal_outcome         choice: well | ok | hard | moved (a tap on "How did it go?")
 *   rehearsal_paywall         reason: free_used (a second rehearsal) | free_runs (the 13th run)
 *
 * "Pro bought from a rehearsal" is not here: the server never sees a purchase's source. The apps' existing opt-in
 * analytics already carry it (paywall_viewed and purchase_started with source rehearsal_entry).
 *
 * Fire-and-forget by the ops-event rules: it never throws and a slow database adds at most the short success-path wait.
 */
const LABELS = {
  rehearsal_created: { key: "source", values: ["intake", "quick_start"] },
  rehearsal_stage_finished: { key: "stage", values: ["warmup", "conversation", "hard_moments"] },
  rehearsal_outcome: { key: "choice", values: ["well", "ok", "hard", "moved"] },
  rehearsal_paywall: { key: "reason", values: ["free_used", "free_runs"] },
} as const;

export type RehearsalUsageEvent = keyof typeof LABELS;
export const REHEARSAL_USAGE_EVENTS = Object.keys(LABELS) as RehearsalUsageEvent[];

// The names the System health page lists (ops-events-config.ts) are the ones emitted here.
const _sameNames: readonly RehearsalUsageEvent[] = REHEARSAL_USAGE_EVENT_NAMES;
void _sameNames;

type LabelOf<E extends RehearsalUsageEvent> = (typeof LABELS)[E]["values"][number];

/** The row detail for an event, or null when the label is not on its closed list. Pure. */
export function rehearsalUsageDetail(
  event: RehearsalUsageEvent,
  detail: Record<string, unknown>,
): Record<string, string> | null {
  const spec = LABELS[event];
  const value = detail[spec.key];
  if (typeof value !== "string" || !(spec.values as readonly string[]).includes(value)) return null;
  return { [spec.key]: value };
}

export async function recordRehearsalUsage<E extends RehearsalUsageEvent>(
  event: E,
  detail: Record<(typeof LABELS)[E]["key"], LabelOf<E>>,
): Promise<void> {
  try {
    const clean = rehearsalUsageDetail(event, detail);
    if (!clean) return;
    await recordOpsEvent(event, clean, null, OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS);
  } catch {
    // Never the caller's problem.
  }
}
