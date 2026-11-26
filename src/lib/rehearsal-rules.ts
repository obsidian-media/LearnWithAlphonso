import { isCourse, type Course } from "@/data/course-meta";

/**
 * The pure rules of Rehearsals: the vocabulary, who may create one, and what an intake may hold. No I/O, so the
 * server routes and the tests share one source of truth.
 */
export const EVENT_KINDS = [
  "interview",
  "meeting",
  "presentation",
  "appointment",
  "housing",
  "first_day",
  "other",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const isEventKind = (v: unknown): v is EventKind =>
  typeof v === "string" && (EVENT_KINDS as readonly string[]).includes(v);

export const STAGES = ["warmup", "conversation", "hard_moments"] as const;
export type Stage = (typeof STAGES)[number];
export const isStage = (v: unknown): v is Stage =>
  typeof v === "string" && (STAGES as readonly string[]).includes(v);

/** `counterpart` and `worries` are the learner's own words: short, filtered, and only ever quoted into prompts. */
export const INTAKE_TEXT_MAX = 200;

/** The free rehearsal is capped at this many runs in total, so its cost is bounded. */
export const FREE_REHEARSAL_MAX_RUNS = 12;

/**
 * What one finished run taught the tutor (a rehearsal_runs row): moment labels and corrected forms only, never the
 * learner's own words.
 */
export type RunMemory = {
  stage: Stage;
  finishedAt: string;
  momentsShown: string[];
  wentWell: string[];
  corrections: string[];
};

export type CreateDecision = "ok_free" | "ok_pro" | "paywall" | "retry";

/**
 * May this learner create a rehearsal? Pro always may. A learner who is not Pro may once, ever (`freeUsed` comes from
 * rehearsal_free_used, which outlives the rehearsal). When the Pro state cannot be read the answer is "retry", never
 * "ok": an outage must not use up the free rehearsal, nor hand a Pro rehearsal to someone who may not have one.
 */
export function canCreateRehearsal(
  pro: "pro" | "free" | "unavailable",
  freeUsed: boolean,
): CreateDecision {
  if (pro === "unavailable") return "retry";
  if (pro === "pro") return "ok_pro";
  return freeUsed ? "paywall" : "ok_free";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A rehearsal id is a uuid; anything else is refused before it reaches a query. */
export const isRehearsalId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type Intake = {
  course: Course;
  eventKind: EventKind;
  /** The learner's local calendar day, YYYY-MM-DD, or null for "not sure yet". */
  eventDate: string | null;
  counterpart: string;
  worries: string | null;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

export type IntakeResult = { ok: true; value: Intake } | { ok: false; error: string };

/** Checks and normalises the four intake answers. It does not run the blocked-term filter (that needs the database). */
export function validateIntake(raw: {
  course?: unknown;
  eventKind?: unknown;
  eventDate?: unknown;
  counterpart?: unknown;
  worries?: unknown;
}): IntakeResult {
  if (typeof raw.course !== "string" || !isCourse(raw.course))
    return { ok: false, error: "invalid_course" };
  if (!isEventKind(raw.eventKind)) return { ok: false, error: "invalid_event_kind" };
  let eventDate: string | null = null;
  if (raw.eventDate !== undefined && raw.eventDate !== null && raw.eventDate !== "") {
    if (!isCalendarDate(raw.eventDate)) return { ok: false, error: "invalid_event_date" };
    eventDate = raw.eventDate;
  }
  if (typeof raw.counterpart !== "string") return { ok: false, error: "invalid_counterpart" };
  const counterpart = raw.counterpart.trim();
  if (counterpart.length === 0 || counterpart.length > INTAKE_TEXT_MAX)
    return { ok: false, error: "invalid_counterpart" };
  let worries: string | null = null;
  if (raw.worries !== undefined && raw.worries !== null) {
    if (typeof raw.worries !== "string") return { ok: false, error: "invalid_worries" };
    const w = raw.worries.trim();
    if (w.length > INTAKE_TEXT_MAX) return { ok: false, error: "invalid_worries" };
    worries = w.length > 0 ? w : null;
  }
  return {
    ok: true,
    value: { course: raw.course, eventKind: raw.eventKind, eventDate, counterpart, worries },
  };
}
