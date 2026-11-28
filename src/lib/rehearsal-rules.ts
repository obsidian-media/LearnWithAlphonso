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
  /** Who played the partner, and whether it was hard mode. Absent on a run from before Hector rehearsals: Alphonso, not hard. */
  persona?: Persona;
  hardMode?: boolean;
};

export type StageProgress = Record<Stage, "todo" | "done">;

/** A stage is done once it has a finished run (a rehearsal_runs row exists only for a run that met the finish rule). */
export function stageProgress(runs: readonly RunMemory[]): StageProgress {
  // A hard-mode run is its own thing ("hard mode done"): it never marks its stage done, and never replaces the stage's own run.
  const done = (s: Stage) => (runs.some((r) => r.stage === s && !r.hardMode) ? "done" : "todo");
  return {
    warmup: done("warmup"),
    conversation: done("conversation"),
    hard_moments: done("hard_moments"),
  };
}

/**
 * Which stage to offer next: the first one not done, in the order warm-up, conversation, hard moments; once all are
 * done, the weakest one (the most corrections in its LAST run, a tie going to the earlier stage). Independent of the
 * order `runs` is given in.
 */
export function nextStage(progress: StageProgress, runs: readonly RunMemory[]): Stage {
  const open = STAGES.find((s) => progress[s] === "todo");
  if (open) return open;
  let weakest: Stage = STAGES[0];
  let most = -1;
  for (const s of STAGES) {
    const last = runs
      .filter((r) => r.stage === s && !r.hardMode)
      .reduce<RunMemory | null>(
        (a, r) => (a === null || r.finishedAt > a.finishedAt ? r : a),
        null,
      );
    const count = last?.corrections.length ?? 0;
    if (count > most) {
      most = count;
      weakest = s;
    }
  }
  return weakest;
}

// ---------------------------------------------------------------- How did it go?

export const OUTCOME_CHOICES = ["well", "ok", "hard", "moved"] as const;
export type OutcomeChoice = (typeof OUTCOME_CHOICES)[number];
export const isOutcomeChoice = (v: unknown): v is OutcomeChoice =>
  typeof v === "string" && (OUTCOME_CHOICES as readonly string[]).includes(v);

const EVENT_NOUN: Record<EventKind, string> = {
  interview: "a job interview",
  meeting: "a work meeting",
  presentation: "a presentation",
  appointment: "an appointment",
  housing: "a conversation with a landlord",
  first_day: "a first day at work",
  other: "a real conversation",
};
const OUTCOME_PHRASE = { well: "it went well", ok: "it went okay", hard: "it was hard" } as const;

/**
 * The one memory line a closed rehearsal leaves in the tutor's memory: a fixed template per event kind and outcome.
 * It holds no learner text (not their words, not the counterpart they described), so it can never leak any.
 */
export const OUTCOME_MEMORY_LINES: Record<
  EventKind,
  Record<"well" | "ok" | "hard", string>
> = Object.fromEntries(
  EVENT_KINDS.map((k) => [
    k,
    Object.fromEntries(
      (Object.keys(OUTCOME_PHRASE) as (keyof typeof OUTCOME_PHRASE)[]).map((o) => [
        o,
        `Rehearsed ${EVENT_NOUN[k]}: ${OUTCOME_PHRASE[o]}`,
      ]),
    ),
  ]),
) as Record<EventKind, Record<"well" | "ok" | "hard", string>>;

export type OutcomeResult =
  | { ok: true; action: "close"; outcome: { choice: "well" | "ok" | "hard" }; memoryText: string }
  | { ok: true; action: "move"; eventDate: string }
  | { ok: false; error: "invalid_choice" | "invalid_date" | "closed" };

/**
 * "How did it go?": taps only. well, ok and hard close the rehearsal (done) with one fixed memory line; moved needs a
 * new date AFTER the learner's local `today` (YYYY-MM-DD) and keeps it active. A closed rehearsal answers "closed".
 */
export function applyOutcome(
  rehearsal: { status: "active" | "done" | "cancelled"; eventKind: EventKind },
  choice: unknown,
  newDate: unknown,
  today: string,
): OutcomeResult {
  if (!isOutcomeChoice(choice)) return { ok: false, error: "invalid_choice" };
  if (rehearsal.status !== "active") return { ok: false, error: "closed" };
  if (choice === "moved") {
    if (!isCalendarDate(newDate) || newDate <= today) return { ok: false, error: "invalid_date" };
    return { ok: true, action: "move", eventDate: newDate };
  }
  return {
    ok: true,
    action: "close",
    outcome: { choice },
    memoryText: OUTCOME_MEMORY_LINES[rehearsal.eventKind][choice],
  };
}

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

/**
 * Does THIS run need Pro? Today no run does (the free rehearsal and every Pro rehearsal run with Alphonso at the normal
 * level). Hector rehearsals and hard mode are Pro-only when they ship, and they ask here. It is checked ONCE, when a
 * run starts (the first turn of its call), never on every turn: an in-progress call always finishes, and a lapse
 * costs nothing per turn.
 */
export const PERSONAS = ["alphonso", "hector"] as const;
export type Persona = (typeof PERSONAS)[number];
export const isPersona = (v: unknown): v is Persona =>
  typeof v === "string" && (PERSONAS as readonly string[]).includes(v);

export type RunKind = { persona?: Persona; hard?: boolean };

/**
 * Hard mode exists only for Hector on the last stage (hard moments). Everything else is a plain run: Alphonso at the
 * normal level, or Hector without hard mode, on any stage.
 */
export const runModeAllowed = (run: RunKind, stage: Stage): boolean =>
  run.hard !== true || (run.persona === "hector" && stage === "hard_moments");

/** Has this rehearsal a finished hard-mode run? ("Hard mode done" in the plan.) */
export const hardModeDone = (runs: readonly RunMemory[]): boolean =>
  runs.some((r) => r.hardMode === true);
export const runNeedsPro = (run: RunKind): boolean => run.persona === "hector" || run.hard === true;

export type RunStart = "ok" | "paywall" | "retry";

/**
 * May this run start? A run that needs no Pro always may (and the Pro state is never read). A Pro run needs Pro; when
 * the Pro state cannot be read the answer is "retry", never "ok": an outage must not hand out a Pro-only run.
 */
export function decideRunStart(needsPro: boolean, pro: "pro" | "free" | "unavailable"): RunStart {
  if (!needsPro) return "ok";
  if (pro === "unavailable") return "retry";
  return pro === "pro" ? "ok" : "paywall";
}

/** A dated rehearsal ends this many days after its event date; an undated one this many days after its last activity. */
export const REHEARSAL_DATED_CLOSE_DAYS = 7;
export const REHEARSAL_UNDATED_CLOSE_DAYS = 30;

const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
};

/**
 * Has an ACTIVE rehearsal run out of time? The TypeScript twin of close_stale_rehearsals (20261130100000), which does
 * the closing: dated, 7 days after the event date by the learner's own calendar day (`today`, YYYY-MM-DD); undated, 30
 * days after the later of its creation and its newest finished run. The chat uses it to refuse a stage of a rehearsal
 * that has timed out before the database has closed it.
 */
export function rehearsalTimedOut(
  r: { eventDate: string | null; createdAt: string },
  lastRunAt: string | null,
  nowMs: number,
  today: string,
): boolean {
  if (r.eventDate) return addDays(r.eventDate, REHEARSAL_DATED_CLOSE_DAYS) <= today;
  const last = Math.max(Date.parse(r.createdAt), lastRunAt ? Date.parse(lastRunAt) : 0);
  return last <= nowMs - REHEARSAL_UNDATED_CLOSE_DAYS * 86_400_000;
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

// ---------------------------------------------------------------- what the screens say (the app's UI is English)

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  interview: "Job interview",
  meeting: "Work meeting",
  presentation: "Presentation",
  appointment: "Appointment",
  housing: "Landlord or housing",
  first_day: "First day at work",
  other: "Something else",
};

/** The example in the "Who will you be talking to?" field, per kind. */
export const COUNTERPART_PLACEHOLDERS: Record<EventKind, string> = {
  interview: "e.g. a hiring manager at a hospital",
  meeting: "e.g. my team lead and two colleagues",
  presentation: "e.g. a small group of coworkers",
  appointment: "e.g. a receptionist at a bank",
  housing: "e.g. a landlord showing a flat",
  first_day: "e.g. my new manager and the team",
  other: "e.g. the person I need to speak to",
};

export const STAGE_LABELS: Record<Stage, string> = {
  warmup: "Warm-up",
  conversation: "The real conversation",
  hard_moments: "The hard moments",
};

export const STAGE_BLURBS: Record<Stage, string> = {
  warmup: "The key phrases, in short exchanges.",
  conversation: "The whole conversation, start to finish.",
  hard_moments: "The tough question, a misunderstanding, being interrupted.",
};

/** About how long one run of a stage takes, in minutes (the plan screen and the path say it). */
export const STAGE_MINUTES: Record<Stage, number> = {
  warmup: 5,
  conversation: 10,
  hard_moments: 8,
};

/** The event as a short noun after "your" ("the 2-minute warm-up before your interview"). */
export const EVENT_SHORT: Record<EventKind, string> = {
  interview: "interview",
  meeting: "meeting",
  presentation: "presentation",
  appointment: "appointment",
  housing: "meeting with the landlord",
  first_day: "first day",
  other: "conversation",
};
