import type { Level } from "../data/levels";
import {
  BASE_WEIGHT,
  CAMPAIGN_SPEAKING_FACTOR,
  DAY_OVERFLOW_MINUTES,
  DEFAULT_LESSON_MINUTES,
  GOAL_BOOST,
  LESSON_FLOOR_SHARE,
  LESSON_FLOOR_SHARE_WEAK_LESSON_SKILL,
  REST_DAY,
  ROAD_DONE_STOPS,
  ROAD_UPCOMING_STOPS,
  SCORE,
  STUDY_DAYS_PER_WEEK,
  STUDY_DAYS_NO_REST,
  NO_REST_DAY,
  WEAK_BELOW_PCT,
  WEAK_SKILL_BOOST,
} from "../data/path-config";
import { LEVEL_ORDER, type GoalPlan, type GoalStatus } from "./learning-goal";
import { DAILY_MINUTES, type Goal, type Interest } from "./learner-profile";
import type { Skill } from "./profile-data";
import { localDay } from "./local-day";

/**
 * The learning path (docs/superpowers/specs/2026-11-12-learning-path-design.md): ONE pure engine that turns what the
 * learner told us (goal, interests, daily minutes, type switches), where they are (the goal planner's plan, the Skills
 * radar) and what they did (activity events) into a weekly mix, today's list, a seven-day week, the road, the recovery
 * choices when behind, per-type streaks and the plain-language reasons. No clock, no network, no randomness: `now` and
 * every list come in. The server runs it once (/api/learning-path); web, iOS and Android render the result, so the three
 * can never disagree. The rules, in words, are shown to the learner on the "Why this mix" screen.
 *
 * A "video" type is added later by adding it to PATH_TYPES, PATH_TYPE_INFO and the candidates; nothing else changes.
 */
export const PATH_TYPES = ["lesson", "podcast", "talk", "campaign"] as const;
export type PathType = (typeof PATH_TYPES)[number];
/** Types a learner may switch off: everything except the backbone. */
export const OPTIONAL_TYPES: readonly PathType[] = ["podcast", "talk", "campaign"];

export const PATH_TYPE_INFO: Record<
  PathType,
  { label: string; noun: string; trainedSkills: Skill[] }
> = {
  lesson: { label: "Lessons", noun: "Lesson", trainedSkills: ["vocabulary", "grammar", "reading"] },
  podcast: { label: "Podcasts", noun: "Podcast", trainedSkills: ["listening"] },
  talk: { label: "Talk", noun: "Talk to Alphonso", trainedSkills: ["speaking"] },
  campaign: { label: "Campaigns", noun: "Story campaign", trainedSkills: ["speaking"] },
};

export type ItemRef = { kind: PathType; id: string; sceneIndex?: number };

export type Candidate = {
  id: string;
  type: PathType;
  title: string;
  subtitle: string;
  minutes: number;
  level: Level;
  goals: readonly Goal[];
  interests: readonly Interest[];
  skills: readonly Skill[];
  ref: ItemRef;
};

export type ActivityEvent = {
  type: PathType;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  minutes: number;
  refId?: string;
  title?: string;
};

export type PathPrefs = { off: PathType[]; trimUntil: string | null };

export type PathInput = {
  now: Date;
  /** The learner's IANA time zone (learner_time_zones); today is their calendar day there. UTC when missing. */
  timeZone?: string | null;
  course: "en" | "fr" | "es";
  goalPlan: GoalPlan;
  /** "B1 by 1 March" style label the screens show. */
  goalLabel: string;
  /** `restDay`: 0 (Sunday) to 6, or null for no rest day; left out it is the default rest day (REST_DAY). */
  profile: { goal?: Goal; interests: Interest[]; dailyMinutes: number; restDay?: number | null };
  prefs: PathPrefs;
  /** pct per skill from the Skills radar; null or missing = too few answers to score. */
  skillPct: Partial<Record<Skill, number | null>>;
  /** Not-yet-done items per type, in catalogue order (lessons: in curriculum order). Levels above the learner's are "locked". */
  candidates: Record<PathType, Candidate[]>;
  /** Activity of the last weeks, newest or oldest first (any order). */
  events: ActivityEvent[];
  /** The unit the learner is in: shown as a road stop. */
  unit?: { title: string; subtitle: string; lessonsLeft: number };
  /** Lessons still to do per level, for the level steps on the road. */
  levelLessonsLeft?: Partial<Record<Level, number>>;
};

export type MixEntry = { type: PathType; minutes: number; share: number; count: number };
export type PlannedItem = {
  type: PathType;
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  state: "done" | "next" | "todo";
  ref: ItemRef | null;
};
export type DayPlan = {
  day: string;
  label: string;
  state: "done" | "missed" | "today" | "upcoming" | "rest";
  minutes: number;
  items: PlannedItem[];
};
export type WhyEntry = {
  type: PathType;
  headline: string;
  detail: string;
  source: "planner" | "skills" | "goal" | "interests" | "level" | "recovery";
};
export type RecoveryOption = {
  id: "lessons_first" | "move_date" | "add_minutes";
  title: string;
  detail: string;
  suggested: boolean;
  date?: string;
  dailyMinutes?: number;
  lessonsPerWeek?: number;
  mix?: MixEntry[];
};
export type RoadStop = {
  kind: "level" | "item" | "unit" | "goal";
  type: PathType | null;
  title: string;
  subtitle: string;
  note: string;
  state: "done" | "current" | "upcoming";
  estDate: string | null;
  ref: ItemRef | null;
};
export type StreakEntry = { type: PathType; days: number; weekMinutes: number };

export type LearningPath = {
  asOf: string;
  course: "en" | "fr" | "es";
  goalLabel: string;
  status: GoalStatus;
  /** The status in words, and one sentence under it (the goal planner's numbers, never a new calculation). */
  statusLine: string;
  statusDetail: string;
  /** The goal planner's own numbers, passed through so no screen redoes that maths. */
  progress: {
    lessonsDone: number;
    lessonsInScope: number;
    requiredPerWeek: number;
    doneLast7Days: number;
    targetLevel: Level;
    targetDate: string;
    suggestedDate: string | null;
  };
  dailyMinutes: number;
  /** The rest day as planned: 0 (Sunday) to 6, or NO_REST_DAY (-1) when the learner studies all seven days. A plain
   *  number so the Swift and Kotlin decoders need no nullable-versus-missing rule. */
  restDay: number;
  weekMinutes: number;
  weekDoneMinutes: number;
  trimmed: boolean;
  trimUntil: string | null;
  off: PathType[];
  mix: MixEntry[];
  today: { day: string; targetMinutes: number; minutesLeft: number; items: PlannedItem[] };
  week: DayPlan[];
  road: RoadStop[];
  recovery: RecoveryOption[];
  why: WhyEntry[];
  streaks: StreakEntry[];
};

// ---------------------------------------------------------------- dates (UTC, like the streak and learning_days)

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const fromNum = (n: number) => iso(n * DAY_MS);
const addDays = (d: string, n: number) => fromNum(dayNum(d) + n);
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday of the UTC week containing `d`. */
const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));

// ---------------------------------------------------------------- the mix

const levelIdx = (l: Level) => LEVEL_ORDER.indexOf(l);

function weakSkills(skillPct: PathInput["skillPct"]): { skill: Skill; pct: number }[] {
  return (Object.entries(skillPct) as [Skill, number | null | undefined][])
    .filter((e): e is [Skill, number] => typeof e[1] === "number" && e[1] < WEAK_BELOW_PCT)
    .map(([skill, pct]) => ({ skill, pct }))
    .sort((a, b) => a.pct - b.pct || a.skill.localeCompare(b.skill))
    .slice(0, 2);
}

function eligible(input: PathInput, type: PathType): Candidate[] {
  const cur = levelIdx(input.goalPlan.currentLevel);
  return input.candidates[type].filter((c) => levelIdx(c.level) <= cur);
}

function avgMinutes(input: PathInput, type: PathType): number {
  const list = eligible(input, type);
  if (list.length === 0) return type === "lesson" ? DEFAULT_LESSON_MINUTES : 0;
  const head = list.slice(0, 8);
  return head.reduce((s, c) => s + c.minutes, 0) / head.length;
}

function enabledOptional(input: PathInput): PathType[] {
  return OPTIONAL_TYPES.filter(
    (t) => !input.prefs.off.includes(t) && eligible(input, t).length > 0,
  );
}

/** The learner's calendar day for `now` (UTC when no zone is known): the same day the database books. */
function todayOf(input: PathInput): string {
  return localDay(input.now.getTime(), input.timeZone);
}

/** The rest day the plan uses: the learner's choice, the default when they never chose, null for none. */
function restDayOf(input: PathInput): number | null {
  const chosen = input.profile.restDay;
  return chosen === undefined ? REST_DAY : chosen;
}

/** Days a week the learner studies: six with a rest day, seven without. */
function studyDaysOf(input: PathInput): number {
  return restDayOf(input) === null ? STUDY_DAYS_NO_REST : STUDY_DAYS_PER_WEEK;
}

function isTrimmed(input: PathInput): boolean {
  const until = input.prefs.trimUntil;
  return until !== null && until >= todayOf(input);
}

function computeMix(input: PathInput, trimmed: boolean): MixEntry[] {
  const weekMin = input.profile.dailyMinutes * studyDaysOf(input);
  const enabled = enabledOptional(input);
  const weak = weakSkills(input.skillPct);
  const lessonAvg = avgMinutes(input, "lesson");

  const weakLessonSkill = weak[0] && PATH_TYPE_INFO.lesson.trainedSkills.includes(weak[0].skill);
  const floor =
    (weakLessonSkill ? LESSON_FLOOR_SHARE_WEAK_LESSON_SKILL : LESSON_FLOOR_SHARE) * weekMin;
  const required = input.goalPlan.status === "done" ? 0 : input.goalPlan.requiredPerWeek;
  let lessonMinutes = Math.min(weekMin, Math.round(Math.max(floor, required * lessonAvg)));

  const minutes: Record<PathType, number> = { lesson: 0, podcast: 0, talk: 0, campaign: 0 };
  if (enabled.length === 0) {
    lessonMinutes = weekMin;
  } else if (trimmed) {
    // Lessons first: everything optional waits, except one podcast.
    const podcastOne = enabled.includes("podcast") ? Math.round(avgMinutes(input, "podcast")) : 0;
    minutes.podcast = Math.min(podcastOne, weekMin - 0);
    lessonMinutes = weekMin - minutes.podcast;
  } else {
    const rest = weekMin - lessonMinutes;
    const w: Record<PathType, number> = { lesson: 0, podcast: 0, talk: 0, campaign: 0 };
    for (const t of enabled) w[t] = BASE_WEIGHT;
    weak.forEach((ws, i) => {
      const boost = WEAK_SKILL_BOOST * (i === 0 ? 1 : 0.5);
      for (const t of enabled) {
        if (!PATH_TYPE_INFO[t].trainedSkills.includes(ws.skill)) continue;
        w[t] += t === "campaign" ? boost * CAMPAIGN_SPEAKING_FACTOR : boost;
      }
    });
    if (goalCampaigns(input).length > 0 && enabled.includes("campaign")) w.campaign += GOAL_BOOST;
    const total = enabled.reduce((s, t) => s + w[t], 0);
    let given = 0;
    enabled.forEach((t, i) => {
      const m = i === enabled.length - 1 ? rest - given : Math.round((rest * w[t]) / total);
      minutes[t] = m;
      given += m;
    });
  }
  minutes.lesson = lessonMinutes;
  return PATH_TYPES.map((type) => ({
    type,
    minutes: minutes[type],
    share: Math.round((minutes[type] / weekMin) * 100),
    count:
      minutes[type] === 0
        ? 0
        : Math.max(1, Math.round(minutes[type] / Math.max(1, avgMinutes(input, type)))),
  }));
}

function goalCampaigns(input: PathInput): Candidate[] {
  const g = input.profile.goal;
  return g ? eligible(input, "campaign").filter((c) => c.goals.includes(g)) : [];
}

function score(input: PathInput, c: Candidate): number {
  const cur = input.goalPlan.currentLevel;
  const weak = weakSkills(input.skillPct).map((w) => w.skill);
  let s = 0;
  if (c.level === cur) s += SCORE.levelMatch;
  else if (levelIdx(c.level) < levelIdx(cur)) s += SCORE.levelBelow;
  if (input.profile.goal && c.goals.includes(input.profile.goal)) s += SCORE.goal;
  s += SCORE.interest * c.interests.filter((i) => input.profile.interests.includes(i)).length;
  if (c.skills.some((k) => weak.includes(k))) s += SCORE.weakSkill;
  return s;
}

function ranked(input: PathInput, type: PathType): Candidate[] {
  const list = eligible(input, type);
  if (type === "lesson") return list;
  return list
    .map((c, i) => ({ c, i, s: score(input, c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

// ---------------------------------------------------------------- events

const eventItem = (e: ActivityEvent): PlannedItem => ({
  type: e.type,
  id: e.refId ?? `${e.type}-${e.day}`,
  title: e.title ?? PATH_TYPE_INFO[e.type].noun,
  subtitle: "Done",
  minutes: e.minutes,
  state: "done",
  ref: null,
});

function streakOf(
  events: ActivityEvent[],
  type: PathType,
  today: string,
  weekStart: string,
): StreakEntry {
  const days = new Set(events.filter((e) => e.type === type).map((e) => e.day));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  const weekMinutes = events
    .filter((e) => e.type === type && e.day >= weekStart && e.day <= today)
    .reduce((s, e) => s + e.minutes, 0);
  return { type, days: n, weekMinutes };
}

// ---------------------------------------------------------------- the engine

export function planPath(input: PathInput): LearningPath {
  const today = todayOf(input);
  const weekStart = mondayOf(today);
  const trimmed = isTrimmed(input);
  const mix = computeMix(input, trimmed);
  const daily = input.profile.dailyMinutes;
  const weekMin = daily * studyDaysOf(input);
  const restDay = restDayOf(input);

  const weekEvents = input.events.filter(
    (e) => e.day >= weekStart && e.day <= addDays(weekStart, 6),
  );
  const doneCount: Record<PathType, number> = { lesson: 0, podcast: 0, talk: 0, campaign: 0 };
  for (const e of weekEvents) doneCount[e.type]++;
  const usedIds = new Set(weekEvents.filter((e) => e.refId).map((e) => `${e.type}:${e.refId}`));

  // Quotas still to place this week and the ranked pools they come from.
  const remaining: Record<PathType, number> = { lesson: 0, podcast: 0, talk: 0, campaign: 0 };
  const pool: Record<PathType, Candidate[]> = { lesson: [], podcast: [], talk: [], campaign: [] };
  for (const m of mix) {
    remaining[m.type] = Math.max(0, m.count - doneCount[m.type]);
    pool[m.type] = ranked(input, m.type).filter((c) => !usedIds.has(`${c.type}:${c.id}`));
  }
  const avg = (t: PathType) => Math.max(1, avgMinutes(input, t));

  // Days of the week.
  const days: DayPlan[] = [];
  const todayDone = input.events.filter((e) => e.day === today);
  const doneToday = todayDone.reduce((s, e) => s + e.minutes, 0);
  const plannable: { day: string; budget: number; index: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const rest = restDay !== null && weekdayOf(day) === restDay;
    const past = day < today;
    const base: DayPlan = {
      day,
      label: DAY_LABELS[weekdayOf(day)],
      state: past ? "missed" : day === today ? "today" : "upcoming",
      minutes: 0,
      items: [],
    };
    const done = input.events.filter((e) => e.day === day);
    if (done.length > 0) {
      base.items = done.map(eventItem);
      base.minutes = done.reduce((s, e) => s + e.minutes, 0);
      if (past) base.state = "done";
    }
    if (rest && done.length === 0 && !(day === today)) base.state = "rest";
    if (rest && day === today && done.length === 0) base.state = "rest";
    days.push(base);
    if (!rest && !past) {
      const budget = day === today ? Math.max(0, daily - doneToday) : daily;
      if (budget > 0) plannable.push({ day, budget, index: i });
    }
  }

  // Token-bucket spread: each day every type earns its share of what is left; an item is placed once its type has
  // earned half an item, and every day starts with a lesson while lessons remain.
  const credit: Record<PathType, number> = { lesson: 0, podcast: 0, talk: 0, campaign: 0 };
  const perDay = (t: PathType) =>
    plannable.length === 0 ? 0 : (remaining[t] * avg(t)) / plannable.length;
  for (const slot of plannable) {
    for (const t of PATH_TYPES) credit[t] += perDay(t);
    let load = 0;
    const placed: PlannedItem[] = [];
    for (let guard = 0; guard < 12; guard++) {
      let pick: PathType | null = null;
      if (placed.length === 0 && remaining.lesson > 0 && pool.lesson.length > 0) pick = "lesson";
      else {
        let best = 0;
        for (const t of PATH_TYPES) {
          if (remaining[t] <= 0 || pool[t].length === 0) continue;
          if (credit[t] >= avg(t) / 2 && credit[t] > best) {
            best = credit[t];
            pick = t;
          }
        }
      }
      if (!pick) break;
      const item = pool[pick][0];
      if (placed.length > 0 && load + item.minutes > slot.budget + DAY_OVERFLOW_MINUTES) break;
      pool[pick].shift();
      remaining[pick]--;
      credit[pick] -= item.minutes;
      load += item.minutes;
      placed.push({
        type: item.type,
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        minutes: item.minutes,
        state: "todo",
        ref: item.ref,
      });
      if (load >= slot.budget) break;
    }
    const day = days[slot.index];
    day.items = [...day.items, ...placed];
    day.minutes += load;
  }

  const todayPlan = days.find((d) => d.day === today)!;
  const todayItems = todayPlan.items.map((i) => ({ ...i }));
  const firstTodo = todayItems.find((i) => i.state === "todo");
  if (firstTodo) firstTodo.state = "next";

  const status = input.goalPlan.status;
  const recovery = status === "behind" ? buildRecovery(input, trimmed) : [];
  const why = buildWhy(input, trimmed, mix, pool);
  const upcomingItems = days
    .filter((d) => d.day >= today)
    .flatMap((d) => d.items.filter((i) => i.state !== "done"));

  return {
    asOf: input.now.toISOString(),
    course: input.course,
    goalLabel: input.goalLabel,
    status,
    statusLine: STATUS_LINE[status],
    statusDetail: statusDetail(input.goalPlan),
    progress: {
      lessonsDone: input.goalPlan.lessonsInScope - input.goalPlan.lessonsRemaining,
      lessonsInScope: input.goalPlan.lessonsInScope,
      requiredPerWeek: input.goalPlan.requiredPerWeek,
      doneLast7Days: input.goalPlan.lessonsDoneLast7Days,
      targetLevel: input.goalPlan.targetLevel,
      targetDate: input.goalPlan.targetDate,
      suggestedDate: input.goalPlan.suggestedDate,
    },
    dailyMinutes: daily,
    restDay: restDay ?? NO_REST_DAY,
    weekMinutes: weekMin,
    weekDoneMinutes: weekEvents.reduce((s, e) => s + e.minutes, 0),
    trimmed,
    trimUntil: trimmed ? input.prefs.trimUntil : null,
    off: [...input.prefs.off],
    mix,
    today: {
      day: today,
      targetMinutes: daily,
      minutesLeft: Math.max(0, daily - doneToday),
      items: todayItems,
    },
    week: days,
    road: buildRoad(input, upcomingItems),
    recovery,
    why,
    streaks: PATH_TYPES.map((t) => streakOf(input.events, t, today, weekStart)),
  };
}

// ---------------------------------------------------------------- status words

const STATUS_LINE: Record<GoalStatus, string> = {
  done: "Goal reached",
  expired: "The date has passed",
  just_started: "Just started",
  ahead: "Ahead of plan",
  on_track: "On track",
  behind: "A bit behind",
};

function statusDetail(plan: GoalPlan): string {
  switch (plan.status) {
    case "done":
      return "You finished everything in scope. Review keeps it fresh.";
    case "expired":
      return "Pick a new date to keep going.";
    case "behind":
      return `${plan.lessonsDoneLast7Days} lessons this week; the plan needs ${plan.requiredPerWeek}. Plans slip. Pick a way forward.`;
    case "just_started":
      return `${plan.requiredPerWeek} lessons a week to finish on time. Check back next week.`;
    default:
      return `${plan.requiredPerWeek} lessons a week to finish on time; ${plan.lessonsDoneLast7Days} in the last 7 days.`;
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** "27 October 2027" from an ISO day (a fixed English table, the same on every platform). */
function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

// ---------------------------------------------------------------- recovery

function buildRecovery(input: PathInput, trimmed: boolean): RecoveryOption[] {
  const out: RecoveryOption[] = [];
  const plan = input.goalPlan;
  if (!trimmed && enabledOptional(input).length > 0) {
    out.push({
      id: "lessons_first",
      title: "Lessons first for 2 weeks",
      detail: `Pause the extras, keep one podcast. Back to your mix when you are caught up. The date stays ${input.goalLabel.split(" by ")[1] ?? "the same"}.`,
      suggested: true,
      mix: computeMix(input, true),
    });
  }
  if (plan.suggestedDate) {
    out.push({
      id: "move_date",
      title: `Move the date to ${longDate(plan.suggestedDate)}`,
      detail: `Keeps the full mix at the pace you really do (${plan.lessonsDoneLast7Days} lessons a week).`,
      suggested: out.length === 0,
      date: plan.suggestedDate,
    });
  }
  const next = DAILY_MINUTES.find((m) => m > input.profile.dailyMinutes);
  if (next !== undefined) {
    const lessonsPerWeek = Math.floor(
      (next * studyDaysOf(input)) / Math.max(1, avgMinutes(input, "lesson")),
    );
    out.push({
      id: "add_minutes",
      title: `Add ${next - input.profile.dailyMinutes} minutes a day`,
      detail: `${next} min a day, about ${lessonsPerWeek} lessons a week plus the full mix.`,
      suggested: false,
      dailyMinutes: next,
      lessonsPerWeek,
    });
  }
  return out;
}

// ---------------------------------------------------------------- why this mix

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SKILL_NAME: Record<Skill, string> = {
  listening: "Listening",
  speaking: "Speaking",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
};

function buildWhy(
  input: PathInput,
  trimmed: boolean,
  mix: MixEntry[],
  pool: Record<PathType, Candidate[]>,
): WhyEntry[] {
  const out: WhyEntry[] = [];
  const plan = input.goalPlan;
  const lessons = mix.find((m) => m.type === "lesson")!;
  const target = input.goalLabel;
  out.push({
    type: "lesson",
    headline:
      plan.status === "done" ? "Lessons keep you sharp" : `${plan.requiredPerWeek} lessons a week`,
    detail:
      plan.status === "done"
        ? "You have finished your goal; lessons stay the backbone."
        : `Needed to finish ${target} (the goal planner). They are ${lessons.share}% of your week.`,
    source: "planner",
  });
  if (
    !trimmed &&
    lessons.minutes >= input.profile.dailyMinutes * studyDaysOf(input) &&
    enabledOptional(input).length > 0
  ) {
    out.push({
      type: "lesson",
      headline: "Your goal needs every minute",
      detail: `${plan.requiredPerWeek} lessons a week fill all ${input.profile.dailyMinutes * studyDaysOf(input)} minutes, so the extras wait. Add minutes or move the date to make room.`,
      source: "planner",
    });
  }
  if (trimmed) {
    out.push({
      type: "lesson",
      headline: "Lessons first",
      detail: `You chose to catch up: the extras wait until ${input.prefs.trimUntil}, except one podcast.`,
      source: "recovery",
    });
    return out;
  }
  const enabled = enabledOptional(input);
  const weak = weakSkills(input.skillPct);
  weak.forEach((ws, i) => {
    const adjective = i === 0 ? "weakest" : "second weakest";
    const types = enabled.filter((t) => PATH_TYPE_INFO[t].trainedSkills.includes(ws.skill));
    const first = types.find((t) => t !== "campaign") ?? types[0];
    if (first) {
      out.push({
        type: first,
        headline: first === "podcast" ? "More podcasts" : "Speaking time",
        detail: `${SKILL_NAME[ws.skill]} is your ${adjective} skill (${Math.round(ws.pct)}%), so there is more of what trains it.`,
        source: "skills",
      });
    } else if (PATH_TYPE_INFO.lesson.trainedSkills.includes(ws.skill)) {
      out.push({
        type: "lesson",
        headline: "More lesson time",
        detail: `${SKILL_NAME[ws.skill]} is your ${adjective} skill (${Math.round(ws.pct)}%), and lessons train it.`,
        source: "skills",
      });
    }
  });
  const g = input.profile.goal;
  const gc = goalCampaigns(input);
  if (g && enabled.includes("campaign") && gc.length > 0) {
    out.push({
      type: "campaign",
      headline: `${cap(g)} campaigns`,
      detail: `You said "${g}": ${gc[0].title} first.`,
      source: "goal",
    });
  }
  const liked = (pool.podcast[0] ?? ranked(input, "podcast")[0]) as Candidate | undefined;
  const hit = liked?.interests.find((i) => input.profile.interests.includes(i));
  if (liked && hit && enabled.includes("podcast")) {
    out.push({
      type: "podcast",
      headline: `${cap(hit)} podcasts`,
      detail: `You like ${hit}: ${liked.title} is picked over other shows.`,
      source: "interests",
    });
  }
  return out;
}

// ---------------------------------------------------------------- the road

function buildRoad(input: PathInput, upcoming: PlannedItem[]): RoadStop[] {
  const plan = input.goalPlan;
  const today = todayOf(input);
  const recent = plan.lessonsDoneLast7Days;
  const est = (lessonsAhead: number): string | null =>
    recent > 0 ? addDays(today, Math.ceil((lessonsAhead / recent) * 7)) : null;

  const done: RoadStop[] = [];
  const cur = levelIdx(plan.currentLevel);
  if (cur > 0) {
    done.push({
      kind: "level",
      type: "lesson",
      title: `Finished ${LEVEL_ORDER[cur - 1]}`,
      subtitle: "Level",
      note: "",
      state: "done",
      estDate: null,
      ref: null,
    });
  }
  const finishedExtras = input.events
    .filter((e) => e.type !== "lesson" && e.title)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(-2);
  for (const e of finishedExtras) {
    done.push({
      kind: "item",
      type: e.type,
      title: e.title!,
      subtitle: PATH_TYPE_INFO[e.type].noun,
      note: "",
      state: "done",
      estDate: null,
      ref: null,
    });
  }

  type Ahead = { at: number; stop: RoadStop };
  const ahead: Ahead[] = [];
  const nonLesson = upcoming.filter((i) => i.type !== "lesson");
  nonLesson.slice(0, 3).forEach((i, k) =>
    ahead.push({
      at: k * 0.01,
      stop: {
        kind: "item",
        type: i.type,
        title: i.title,
        subtitle: `${PATH_TYPE_INFO[i.type].noun} · ${i.minutes} min`,
        note: "This week",
        state: "upcoming",
        estDate: null,
        ref: i.ref,
      },
    }),
  );
  if (input.unit && input.unit.lessonsLeft > 0) {
    ahead.push({
      at: 0.5,
      stop: {
        kind: "unit",
        type: "lesson",
        title: input.unit.title,
        subtitle: input.unit.subtitle,
        note: `${input.unit.lessonsLeft} lessons left in the unit`,
        state: "upcoming",
        estDate: est(input.unit.lessonsLeft),
        ref: null,
      },
    });
  }
  let cumulative = 0;
  const to = levelIdx(plan.targetLevel);
  for (let i = cur; i <= to; i++) {
    const left = input.levelLessonsLeft?.[LEVEL_ORDER[i]];
    if (left === undefined) continue;
    cumulative += left;
    if (left > 0) {
      ahead.push({
        at: cumulative,
        stop: {
          kind: "level",
          type: "lesson",
          title: `Finish ${LEVEL_ORDER[i]}`,
          subtitle: `${left} lessons`,
          note: "Level step",
          state: "upcoming",
          estDate: est(cumulative),
          ref: null,
        },
      });
    }
    // A campaign that needs the next level waits right after this step.
    const gated = input.candidates.campaign.find((c) => levelIdx(c.level) === i + 1);
    if (gated && !input.prefs.off.includes("campaign")) {
      ahead.push({
        at: cumulative + 0.1,
        stop: {
          kind: "item",
          type: "campaign",
          title: gated.title,
          subtitle: `Story campaign · needs ${gated.level}`,
          note: "Unlocks later",
          state: "upcoming",
          estDate: est(cumulative),
          ref: gated.ref,
        },
      });
    }
  }
  ahead.sort((a, b) => a.at - b.at);
  const stops = ahead.slice(0, ROAD_UPCOMING_STOPS).map((a) => a.stop);
  if (stops.length > 0) stops[0] = { ...stops[0], state: "current" };
  const flag: RoadStop = {
    kind: "goal",
    type: null,
    title: `Your goal: finish ${input.goalLabel}`,
    subtitle: "An estimate of lessons, not of fluency",
    note: "",
    state: "upcoming",
    estDate: null,
    ref: null,
  };
  return [...done.slice(-ROAD_DONE_STOPS), ...stops, flag];
}
