import { CAMPAIGNS, localizeCampaign } from "@/data/campaigns";
import { getCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import { PODCAST_QUIZZES } from "@/data/podcast-quizzes";
import {
  CAMPAIGN_SCENE_MINUTES,
  DEFAULT_DAILY_MINUTES,
  DEFAULT_LESSON_MINUTES,
  QUIZ_MINUTES,
  REFRESHER_WINDOW_DAYS,
  STUDY_DAYS_NO_REST,
  STUDY_DAYS_PER_WEEK,
  TALK_MINUTES,
} from "@/data/path-config";
import { refresherPattern } from "@/data/refresher-topics";
import {
  CAMPAIGN_TAGS,
  PODCAST_TAGS,
  SCENARIO_TAGS,
  podcastTagKey,
  videoPathTag,
  type PathTag,
} from "@/data/path-tags";
import { SCENARIOS } from "@/data/scenarios";
import { estimateLessonMinutes } from "./lesson-time";
import { unlockedLessonIds } from "./lesson-unlock";
import { callCountsAsDone } from "./practice-stars";
import { LEVEL_ORDER, planGoal } from "./learning-goal";
import { suggestGoal } from "./suggest-goal";
import { topicLabel } from "./call-recap";
import { lessonsByLevel } from "./learning-goal.server";
import type { LearnerProfile } from "./learner-profile";
import {
  planPath,
  type ActivityEvent,
  type Candidate,
  type LearningPath,
  type PathType,
  type RehearsalPathInput,
  type WeakCategory,
  type WeakInput,
} from "./path-plan";
import { sceneKey } from "./practice-catalog";
import { starLookup, type StarRow } from "./practice-hub";
import { skillScores, type SkillDayRow } from "./profile-data";
import { MIN_SKILL_ANSWERS } from "./skills-radar";
import { localDay } from "./local-day";

/** The call kinds the weekly mix understands. A rehearsal run (kind rehearsal) is its own thing and never counts. */
export const isPathCallKind = (kind: string): kind is "scenario" | "scene" =>
  kind === "scenario" || kind === "scene";

/**
 * Everything the learning path needs, as plain rows (loaded by learning-path.server.ts), turned into the engine's input.
 * Pure: the database reads live elsewhere, so every rule here is tested without one.
 */
export type PathData = {
  course: Course;
  /** The learner's active rehearsal on this course, loaded only while Rehearsals is on. Days are theirs (local). */
  rehearsal?: RehearsalPathInput;
  now: Date;
  /** The learner's IANA time zone (learner_time_zones); every day below is their calendar day. UTC when missing. */
  timeZone?: string | null;
  currentLevel: Level;
  /** Offer only lessons the server lets this learner start (lesson-unlock.ts). The API sets it; the checked-in contract
   *  fixtures (shared with the apps' own builders) leave it off. */
  startableOnly?: boolean;
  /** The saved goal, or null when the learner has none: the path is then built from a suggested one (never saved here). */
  goal: { targetLevel: Level; targetDate: string; createdAt: string } | null;
  completions: { lessonId: string; completedAt: string }[];
  learningDays: { day: string; lessonSeconds: number; practiceSeconds: number }[];
  skillDays: SkillDayRow[];
  /** Published episodes of this course. */
  episodes: {
    id: string;
    folder: string;
    slug: string;
    title: string;
    durationSeconds: number;
    levelId: string | null;
  }[];
  listen: { episodeId: string; completedAt: string | null }[];
  /** Published Alphonso videos of this course (Library > Watch). */
  videos: {
    id: string;
    title: string;
    durationSeconds: number;
    levelId: string | null;
    tags: string[];
  }[];
  /** This learner's watches (video_watches). */
  videoWatches: { videoId: string; completedAt: string | null }[];
  /** Finished practice calls (scenarios and campaign scenes; a rehearsal's runs are not part of the weekly mix). */
  calls: {
    kind: "scenario" | "scene";
    itemKey: string;
    startedAt: string;
    lastReplyAt: string;
    finishedAt: string;
    /** practice_calls.stars of the finished call: 0 to 3. */
    stars: number;
  }[];
  stars: StarRow[];
  profile: LearnerProfile;
  /** What the learner got wrong lately, for "Fix your weak spots" and the refresher (v2). Left out: neither appears. */
  weak?: {
    /** Review items due today or earlier on this course. `weaknessLabel` is the call-mistake topic one came from. */
    reviewDue: { itemKey: string; weaknessLabel: string | null }[];
    /** weakness_events rows (no course column: the English taxonomy, so only the English course reads them). */
    weaknessEvents: { category: string; eventType: string; createdAt: string }[];
    /** tutor_memory "mistake" lines of this course. */
    mistakes: { topic: string; seenCount: number; createdAt: string; lastSeenAt: string }[];
  };
};

const MONTHS = [
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
export function goalLabel(level: string, targetDate: string): string {
  const [, m, d] = targetDate.split("-").map(Number);
  return `${level} by ${d} ${MONTHS[m - 1]}`;
}

const LESSON_CANDIDATES = 40;
const DAY_MS = 86_400_000;
/** A call counts for at most this long: a call left open in a background tab is not 40 minutes of study. */
const MAX_CALL_MINUTES = 15;

const noTag: PathTag | null = null;

// ---------------------------------------------------------------- weak spots (path v2)

type UnitList = ReturnType<typeof getCourse>["curriculum"];

/**
 * The earlier COMPLETED lesson that trains a weakness category: the shortest lesson (the earliest on a tie) of the
 * units the category maps to (src/data/refresher-topics.ts). Null when no unit maps or none of its lessons is done.
 */
function refresherLesson(
  course: Course,
  category: string,
  completedAt: Record<string, string>,
  units: UnitList,
): Candidate | null {
  const pattern = refresherPattern(course, category);
  if (!pattern) return null;
  let best: Candidate | null = null;
  for (const u of units) {
    if (!pattern.test(u.title)) continue;
    for (const l of u.lessons) {
      if (!(l.id in completedAt)) continue;
      const minutes = estimateLessonMinutes(l.questions, 0);
      if (best && minutes >= best.minutes) continue;
      best = {
        id: l.id,
        type: "lesson",
        title: l.title,
        subtitle: `${u.eyebrow} · ${u.level}`,
        minutes,
        level: u.level,
        goals: [],
        interests: [],
        skills: [],
        ref: { kind: "lesson", id: l.id },
      };
    }
  }
  return best;
}

/** Turns the weakness rows into the engine's input: counts per category in the window, the lesson for each, the last offer. */
function weakInput(
  data: PathData,
  completedAt: Record<string, string>,
  units: UnitList,
): WeakInput {
  const w = data.weak!;
  const course = data.course;
  const since = data.now.getTime() - REFRESHER_WINDOW_DAYS * DAY_MS;

  // Call mistakes (course-scoped). One that already became a due Review item is counted there, not twice.
  const mistakes = w.mistakes.filter(
    (m) => Date.parse(m.lastSeenAt) >= since && topicLabel(course, m.topic) !== null,
  );
  const dueTopics = new Set(w.reviewDue.flatMap((r) => (r.weaknessLabel ? [r.weaknessLabel] : [])));

  // Category counts. weakness_events carry no course and use the English taxonomy, so only the English course reads
  // them; detected minus resolved, like the Hector memory rule. A call-mistake line counts as many times as it was
  // seen when all of those sightings fall inside the window, otherwise once (it was seen again lately).
  const counts = new Map<string, number>();
  if (course === "en") {
    const net = new Map<string, number>();
    for (const e of w.weaknessEvents) {
      if (Date.parse(e.createdAt) < since) continue;
      net.set(e.category, (net.get(e.category) ?? 0) + (e.eventType === "detected" ? 1 : -1));
    }
    for (const [category, n] of net)
      if (n > 0 && topicLabel(course, category)) counts.set(category, n);
  }
  for (const m of mistakes) {
    const n = Date.parse(m.createdAt) >= since ? m.seenCount : 1;
    counts.set(m.topic, Math.max(counts.get(m.topic) ?? 0, n));
  }
  const categories: WeakCategory[] = [...counts]
    .map(([category, count]) => ({
      category,
      label: topicLabel(course, category) ?? category,
      count,
      lesson: refresherLesson(course, category, completedAt, units),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return {
    reviewDue: w.reviewDue.length,
    callMistakes: mistakes.filter((m) => !dueTopics.has(m.topic)).length,
    categories,
    offered: data.profile.pathRefresher?.[course] ?? null,
  };
}

/**
 * The `pathRefresher` value to save after a path was built, or null when nothing needs saving. A refresher in the path
 * is a NEW offer unless it was already recorded for today: the record is what the 3-day cooldown counts from, because
 * replaying a lesson leaves no trace in lesson_completions. The record keeps the other courses' offers.
 */
export function refresherOfferToSave(
  path: LearningPath | null,
  profile: LearnerProfile,
  course: Course,
): NonNullable<LearnerProfile["pathRefresher"]> | null {
  const refresher = path?.fix?.items.find((i) => i.ref?.kind === "lesson");
  if (!path || !refresher) return null;
  const stored = profile.pathRefresher?.[course];
  if (stored && stored.offeredOn === path.today.day && stored.lessonId === refresher.id)
    return null;
  return {
    ...profile.pathRefresher,
    [course]: { lessonId: refresher.id, offeredOn: path.today.day },
  };
}

export function buildLearningPath(data: PathData): LearningPath | null {
  const { course, now } = data;
  const completedAt: Record<string, string> = {};
  for (const c of data.completions) completedAt[c.lessonId] = c.completedAt;

  const units = getCourse(course).curriculum;
  const dailyMinutes = data.profile.dailyMinutes ?? DEFAULT_DAILY_MINUTES;
  // No saved goal: the next level, about three months out, stretched to the learner's minutes. Nothing is written.
  let goal = data.goal;
  if (!goal) {
    const next = units
      .flatMap((u) => u.lessons.filter((l) => !(l.id in completedAt)))
      .slice(0, 8)
      .map((l) => estimateLessonMinutes(l.questions, 0));
    const suggested = suggestGoal({
      currentLevel: data.currentLevel,
      now,
      lessonsByLevel: lessonsByLevel(course),
      completedAt,
      dailyMinutes,
      studyDays: data.profile.pathRestDay === "none" ? STUDY_DAYS_NO_REST : STUDY_DAYS_PER_WEEK,
      lessonMinutes: next.length
        ? next.reduce((a, b) => a + b, 0) / next.length
        : DEFAULT_LESSON_MINUTES,
    });
    goal = { ...suggested, createdAt: "" };
  }
  const plan = planGoal({
    currentLevel: data.currentLevel,
    targetLevel: goal.targetLevel,
    targetDate: goal.targetDate,
    lessonsByLevel: lessonsByLevel(course),
    completedAt,
    goalCreatedAt: data.goal ? data.goal.createdAt : null,
    now,
  });
  if (!plan) return null;

  const lessonInfo = new Map<
    string,
    { title: string; questions: (typeof units)[number]["lessons"][number]["questions"] }
  >();
  for (const u of units)
    for (const l of u.lessons) lessonInfo.set(l.id, { title: l.title, questions: l.questions });

  // The learner's own calendar day for an instant: the same day the database books (learner_local_date).
  const dayOf = (iso: string) => localDay(Date.parse(iso), data.timeZone);

  // ---- events (what the learner did, from the tables that already record it)
  const events: ActivityEvent[] = [];
  const completionsPerDay = new Map<string, number>();
  for (const c of data.completions) {
    const d = dayOf(c.completedAt);
    completionsPerDay.set(d, (completionsPerDay.get(d) ?? 0) + 1);
  }
  const lessonSecondsByDay = new Map(data.learningDays.map((r) => [r.day, r.lessonSeconds]));
  for (const c of data.completions) {
    const day = dayOf(c.completedAt);
    const seconds = lessonSecondsByDay.get(day);
    const info = lessonInfo.get(c.lessonId);
    // The day's real lesson seconds shared among that day's first completions; no learning_days row: the lesson's own estimate.
    const minutes =
      seconds !== undefined && seconds > 0
        ? Math.max(1, Math.round(seconds / 60 / (completionsPerDay.get(day) ?? 1)))
        : info
          ? estimateLessonMinutes(info.questions, 0)
          : 1;
    events.push({ type: "lesson", day, minutes, refId: c.lessonId, title: info?.title });
  }
  const epById = new Map(data.episodes.map((e) => [e.id, e]));
  for (const p of data.listen) {
    const ep = epById.get(p.episodeId);
    if (!ep || !p.completedAt) continue;
    events.push({
      type: "podcast",
      day: dayOf(p.completedAt),
      minutes: Math.max(1, Math.round(ep.durationSeconds / 60)),
      refId: ep.id,
      title: ep.title,
    });
  }
  const videoById = new Map(data.videos.map((v) => [v.id, v]));
  for (const w of data.videoWatches) {
    const v = videoById.get(w.videoId);
    if (!v || !w.completedAt) continue;
    events.push({
      type: "video",
      day: dayOf(w.completedAt),
      minutes: Math.max(1, Math.round(v.durationSeconds / 60)),
      refId: v.id,
      title: v.title,
    });
  }
  const campaigns = CAMPAIGNS.map((c) => localizeCampaign(c, course));
  const sceneTitle = new Map<string, string>();
  for (const c of campaigns)
    for (const s of c.scenes) sceneTitle.set(sceneKey(c.id, s.id), c.title);
  for (const call of data.calls) {
    // A finished call that earned no star is not a talk done (callCountsAsDone).
    if (!callCountsAsDone(call.stars)) continue;
    const minutes = Math.min(
      MAX_CALL_MINUTES,
      Math.max(1, Math.round((Date.parse(call.lastReplyAt) - Date.parse(call.startedAt)) / 60_000)),
    );
    if (call.kind === "scenario") {
      const s = SCENARIOS.find((x) => x.id === call.itemKey);
      events.push({
        type: "talk",
        day: dayOf(call.finishedAt),
        minutes,
        refId: call.itemKey,
        title: s?.title[course],
      });
    } else {
      events.push({
        type: "campaign",
        day: dayOf(call.finishedAt),
        minutes,
        refId: call.itemKey,
        title: sceneTitle.get(call.itemKey),
      });
    }
  }

  // ---- candidates (what is left, with its tag)
  // With startableOnly: only lessons the server will let this learner start (lesson-unlock.ts); the Path links
  // straight to /lesson/$id.
  const startable = unlockedLessonIds(
    units.flatMap((u) => u.lessons.map((l) => ({ id: l.id, level: u.level }))),
    new Set(Object.keys(completedAt)),
    data.currentLevel,
    { curriculumNext: false },
  );
  const lessons: Candidate[] = [];
  const levelLessonsLeft: Partial<Record<Level, number>> = {};
  let unit: { title: string; subtitle: string; lessonsLeft: number } | undefined;
  for (const u of units) {
    const left = u.lessons.filter((l) => !(l.id in completedAt));
    levelLessonsLeft[u.level] = (levelLessonsLeft[u.level] ?? 0) + left.length;
    if (
      !unit &&
      left.length > 0 &&
      LEVEL_ORDER.indexOf(u.level) >= LEVEL_ORDER.indexOf(data.currentLevel)
    ) {
      unit = {
        title: `${u.eyebrow}: ${u.title}`,
        subtitle: `Lessons · ${u.level}`,
        lessonsLeft: left.length,
      };
    }
    for (const l of left) {
      if (lessons.length >= LESSON_CANDIDATES) break;
      if (data.startableOnly && !startable.has(l.id)) continue;
      lessons.push({
        id: l.id,
        type: "lesson",
        title: l.title,
        subtitle: `${u.eyebrow} · ${u.level}`,
        minutes: estimateLessonMinutes(l.questions, 0),
        level: u.level,
        goals: [],
        interests: [],
        skills: [],
        ref: { kind: "lesson", id: l.id },
      });
    }
  }

  const finishedEpisodes = new Set(
    data.listen.filter((p) => p.completedAt).map((p) => p.episodeId),
  );
  const quizKeys = new Set(PODCAST_QUIZZES.map((q) => podcastTagKey(q.course, q.folder, q.slug)));
  const podcasts: Candidate[] = [];
  for (const ep of data.episodes) {
    if (finishedEpisodes.has(ep.id)) continue;
    const key = podcastTagKey(course, ep.folder, ep.slug);
    const tag = PODCAST_TAGS[key] ?? noTag;
    const level =
      tag?.level ?? (LEVEL_ORDER.includes(ep.levelId as Level) ? (ep.levelId as Level) : null);
    if (!level) continue;
    const hasQuiz = quizKeys.has(key);
    podcasts.push({
      id: ep.id,
      type: "podcast",
      title: ep.title,
      subtitle: hasQuiz ? "Podcast · quiz after" : "Podcast",
      minutes: Math.ceil(ep.durationSeconds / 60) + (hasQuiz ? QUIZ_MINUTES : 0),
      level,
      goals: tag?.goals ?? [],
      interests: tag?.interests ?? [],
      skills: tag?.skills ?? ["listening"],
      ref: { kind: "podcast", id: ep.id },
    });
  }

  const watched = new Set(data.videoWatches.filter((w) => w.completedAt).map((w) => w.videoId));
  const videos: Candidate[] = [];
  for (const v of data.videos) {
    if (watched.has(v.id) || !LEVEL_ORDER.includes(v.levelId as Level)) continue;
    const tag = videoPathTag(v.levelId as Level, v.tags);
    videos.push({
      id: v.id,
      type: "video",
      title: v.title,
      subtitle: "Video",
      minutes: Math.max(1, Math.ceil(v.durationSeconds / 60)),
      level: tag.level,
      goals: tag.goals,
      interests: tag.interests,
      skills: tag.skills,
      ref: { kind: "video", id: v.id },
    });
  }

  const stars = starLookup(data.stars);
  const unstarred = SCENARIOS.filter((s) => stars("scenario", s.id) === 0);
  const talkPool = unstarred.length > 0 ? unstarred : SCENARIOS;
  const talks: Candidate[] = talkPool.map((s) => {
    const tag = SCENARIO_TAGS[s.id];
    return {
      id: s.id,
      type: "talk",
      title: s.title[course],
      subtitle: `Talk to Alphonso · ${s.persona[course]}`,
      minutes: TALK_MINUTES,
      level: tag.level,
      goals: tag.goals,
      interests: tag.interests,
      skills: tag.skills,
      ref: { kind: "talk", id: s.id },
    };
  });

  const campaignItems: Candidate[] = [];
  for (const c of campaigns) {
    const i = c.scenes.findIndex((s) => stars("scene", sceneKey(c.id, s.id)) === 0);
    if (i < 0) continue; // every scene has stars: the campaign is finished
    const tag = CAMPAIGN_TAGS[c.id];
    campaignItems.push({
      id: sceneKey(c.id, c.scenes[i].id),
      type: "campaign",
      title: c.title,
      subtitle: `Story campaign · scene ${i + 1} of ${c.scenes.length}`,
      minutes: CAMPAIGN_SCENE_MINUTES,
      level: tag.level,
      goals: tag.goals,
      interests: tag.interests,
      skills: tag.skills,
      ref: { kind: "campaign", id: c.id, sceneIndex: i },
    });
  }

  const today = localDay(now.getTime(), data.timeZone);
  const scores = skillScores(data.skillDays, today);
  const skillPct = Object.fromEntries(
    scores.map((s) => [s.skill, s.answered >= MIN_SKILL_ANSWERS ? s.pct : null]),
  );

  const candidates: Record<PathType, Candidate[]> = {
    lesson: lessons,
    podcast: podcasts,
    talk: talks,
    campaign: campaignItems,
    video: videos,
  };
  return planPath({
    now,
    timeZone: data.timeZone,
    course,
    goalPlan: plan,
    goalLabel: goalLabel(goal.targetLevel, goal.targetDate),
    goalSuggested: !data.goal,
    weak: data.weak ? weakInput(data, completedAt, units) : undefined,
    rehearsal: data.rehearsal,
    profile: {
      goal: data.profile.goal,
      interests: data.profile.interests ?? [],
      dailyMinutes,
      // Never chosen: left out, so the engine's default rest day applies. "none" is no rest day.
      ...(data.profile.pathRestDay === undefined
        ? {}
        : { restDay: data.profile.pathRestDay === "none" ? null : data.profile.pathRestDay }),
    },
    prefs: {
      off: [...(data.profile.pathOff ?? [])],
      trimUntil: data.profile.pathTrimUntil ?? null,
      fixOff: data.profile.pathFixOff === true,
    },
    skillPct,
    candidates,
    events,
    unit,
    levelLessonsLeft,
  });
}
