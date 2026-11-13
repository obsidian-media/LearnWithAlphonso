import timing from "./lesson-timing.json";

/**
 * EVERY tunable number of the learning path lives HERE and nowhere else (the engine, the routes and the screens read it;
 * iOS and Android never see these, they render what /api/learning-path sends).
 *
 * MINUTES. How long each activity takes:
 *   - lesson:   from src/data/lesson-timing.json (seconds per question type) through estimateLessonMinutes, the same
 *               figure the lesson start shows ("About N min").
 *   - podcast:  MEASURED: the episode's real duration_seconds from the database, plus QUIZ_MINUTES for the quiz.
 *   - talk, campaign scene, quiz: ESTIMATES below.
 * TODO(calibration): TALK_MINUTES, CAMPAIGN_SCENE_MINUTES and QUIZ_MINUTES must be calibrated from production data.
 * On 2026-11-12 production held only 8 finished practice calls (3 scenes, median 1.5 min; 5 scenarios, median 0.2 min:
 * test traffic), too few to set a number from. When real traffic exists, take the median of finished_at - started_at in
 * practice_calls (and the median podcast quiz time) and replace these three constants.
 */
export const TALK_MINUTES = 4;
export const CAMPAIGN_SCENE_MINUTES = 6;
export const QUIZ_MINUTES = 2;
/** Lesson minutes when a lesson's own questions are not at hand (eight multiple-choice questions). */
export const DEFAULT_LESSON_MINUTES = Math.max(
  1,
  Math.ceil((timing.secondsPerQuestion.mc * 8) / 60),
);

/** Daily minutes when the learner never answered that first-run question (the middle answer). */
export const DEFAULT_DAILY_MINUTES = 10;

/** Study days a week: the daily-minutes answer times this is the week's minutes. The remaining day is a rest day. */
export const STUDY_DAYS_PER_WEEK = 6;
/** The rest day (0 = Sunday ... 6 = Saturday, UTC). */
export const REST_DAY = 0;
/** A day may overshoot its minutes by this much to fit a whole item. */
export const DAY_OVERFLOW_MINUTES = 2;

/** Lessons are the backbone: never less than this share of the week's minutes (the goal planner can ask for more). */
export const LESSON_FLOOR_SHARE = 0.5;
/** When a lesson-trained skill (grammar, vocabulary, reading) is weakest, the lesson floor rises to this. */
export const LESSON_FLOOR_SHARE_WEAK_LESSON_SKILL = 0.6;
/** A skill scoring below this percent counts as weak. */
export const WEAK_BELOW_PCT = 70;
/** Mix weight of every optional type before any rule fires. */
export const BASE_WEIGHT = 1;
/** Added to the types that train the weakest skill, and half of it for the second weakest. */
export const WEAK_SKILL_BOOST = 1;
/** Added to campaigns when at least one eligible campaign is tagged with the learner's goal. */
export const GOAL_BOOST = 0.5;
/** A campaign gets this share of a speaking boost (a campaign is conversation, a talk is the direct drill). */
export const CAMPAIGN_SPEAKING_FACTOR = 0.5;
/** "Lessons first" lasts this many days. */
export const TRIM_DAYS = 14;

/** Scoring when ranking items of one type (higher first). */
export const SCORE = { levelMatch: 2, levelBelow: 1, goal: 3, interest: 1, weakSkill: 2 } as const;
/** Road: the most recent finished stops to show, and how many upcoming stops. */
export const ROAD_DONE_STOPS = 3;
export const ROAD_UPCOMING_STOPS = 6;
