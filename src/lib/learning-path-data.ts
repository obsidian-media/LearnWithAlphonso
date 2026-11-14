import { CAMPAIGNS, localizeCampaign } from "@/data/campaigns";
import { getCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import { PODCAST_QUIZZES } from "@/data/podcast-quizzes";
import {
  CAMPAIGN_SCENE_MINUTES,
  DEFAULT_DAILY_MINUTES,
  QUIZ_MINUTES,
  TALK_MINUTES,
} from "@/data/path-config";
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
import { callCountsAsDone } from "./practice-stars";
import { LEVEL_ORDER, planGoal } from "./learning-goal";
import { lessonsByLevel } from "./learning-goal.server";
import type { LearnerProfile } from "./learner-profile";
import {
  planPath,
  type ActivityEvent,
  type Candidate,
  type LearningPath,
  type PathType,
} from "./path-plan";
import { sceneKey } from "./practice-catalog";
import { starLookup, type StarRow } from "./practice-hub";
import { skillScores, type SkillDayRow } from "./profile-data";
import { MIN_SKILL_ANSWERS } from "./skills-radar";
import { localDay } from "./local-day";

/**
 * Everything the learning path needs, as plain rows (loaded by learning-path.server.ts), turned into the engine's input.
 * Pure: the database reads live elsewhere, so every rule here is tested without one.
 */
export type PathData = {
  course: Course;
  now: Date;
  /** The learner's IANA time zone (learner_time_zones); every day below is their calendar day. UTC when missing. */
  timeZone?: string | null;
  currentLevel: Level;
  goal: { targetLevel: Level; targetDate: string; createdAt: string };
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
  /** Finished practice calls. */
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
/** A call counts for at most this long: a call left open in a background tab is not 40 minutes of study. */
const MAX_CALL_MINUTES = 15;

const noTag: PathTag | null = null;

export function buildLearningPath(data: PathData): LearningPath | null {
  const { course, now } = data;
  const completedAt: Record<string, string> = {};
  for (const c of data.completions) completedAt[c.lessonId] = c.completedAt;

  const plan = planGoal({
    currentLevel: data.currentLevel,
    targetLevel: data.goal.targetLevel,
    targetDate: data.goal.targetDate,
    lessonsByLevel: lessonsByLevel(course),
    completedAt,
    goalCreatedAt: data.goal.createdAt,
    now,
  });
  if (!plan) return null;

  const units = getCourse(course).curriculum;
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
    goalLabel: goalLabel(data.goal.targetLevel, data.goal.targetDate),
    profile: {
      goal: data.profile.goal,
      interests: data.profile.interests ?? [],
      dailyMinutes: data.profile.dailyMinutes ?? DEFAULT_DAILY_MINUTES,
      // Never chosen: left out, so the engine's default rest day applies. "none" is no rest day.
      ...(data.profile.pathRestDay === undefined
        ? {}
        : { restDay: data.profile.pathRestDay === "none" ? null : data.profile.pathRestDay }),
    },
    prefs: {
      off: [...(data.profile.pathOff ?? [])],
      trimUntil: data.profile.pathTrimUntil ?? null,
    },
    skillPct,
    candidates,
    events,
    unit,
    levelLessonsLeft,
  });
}
