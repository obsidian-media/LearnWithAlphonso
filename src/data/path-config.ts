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
 * CALIBRATION (checked 2026-11-16, production, aggregates only, finished calls; sample sizes are far under the 30 needed):
 *   practice scene calls: n=3 (3 users), median 1.53 min, p75 1.84; practice scenario calls: n=5 (3 users), median 0.23 min,
 *   p75 0.31 (test traffic); learning_days with practice time: n=3 days, median 1.4 min; podcast quizzes: no start or end
 *   time is recorded (one award row in total), so a quiz time cannot be measured yet. Too thin to set a number, so the
 *   three constants below stay as estimates. Re-run the same SELECTs (median and p75 of finished_at - started_at in
 *   practice_calls by kind) once each kind has 30 finished calls, and record quiz start and end times first.
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
/** Study days a week when the learner chooses no rest day. */
export const STUDY_DAYS_NO_REST = 7;
/** How a path says "no rest day" (restDay is a weekday 0..6 otherwise). */
export const NO_REST_DAY = -1;
/** The default rest day (0 = Sunday ... 6 = Saturday, UTC), used until the learner chooses one or none. */
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

// ---------------------------------------------------------------- v2: suggested goal and weak spots in Today

/** A learner with no saved goal gets a suggested one: the next level, about this many days away (then stretched to fit). */
export const SUGGESTED_GOAL_DAYS = 90;
/** When the suggested date is too tight for the learner's minutes, it moves out in steps of this many days. */
export const SUGGESTED_GOAL_STEP_DAYS = 7;

/** "Fix your weak spots" shows only with at least this many items due for Review plus recent call mistakes. */
export const WEAK_SPOTS_MIN_ITEMS = 3;
/** Seconds for one Review item: a review card is a multiple-choice question, so the lesson timing for one applies. */
export const WEAK_SPOTS_SECONDS_PER_ITEM = timing.secondsPerQuestion.mc;
/** The weak-spots item never claims more than this many minutes, however long the queue is. */
export const WEAK_SPOTS_MAX_MINUTES = 8;
/** How many due Review items the loader reads at most (a bound on the query, and on the minutes). */
export const WEAK_SPOTS_DUE_LIMIT = 50;

/** Days of history a weakness counts in (weakness_events, and when a call mistake was last seen). */
export const REFRESHER_WINDOW_DAYS = 14;
/** The same category this many times in the window triggers a refresher. */
export const REFRESHER_MIN_EVENTS = 3;
/** One detection of a category is enough when the skill it belongs to is already weak (below WEAK_BELOW_PCT). */
export const REFRESHER_MIN_EVENTS_WEAK_SKILL = 1;
/** After a refresher is done (an earlier lesson replayed), none is offered for this many days. */
export const REFRESHER_COOLDOWN_DAYS = 3;
/** Row limits for the weakness reads, so a heavy user cannot make the path slow. */
export const WEAKNESS_EVENTS_LIMIT = 200;
export const TUTOR_MEMORY_LIMIT = 40;
