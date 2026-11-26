# Your learning path (2026-11-12)

## Status (verified 2026-11-22 against d8350542)

Delivered in #490 (merged 2026-11-13), with #493 (rest day, iOS stop routing), #497 (local day) and #499 (the `video` type, via the Library Watch shelf). LIVING because this file is the only description of the planning rules the learner sees on "Why this mix", and three items are open (listed under "Open work"). Corrected here since the 2026-11-13 version: `video` is now a shipped path type (it was "in progress"), and the planner reads the learner's local day.

Checked in code: `PATH_TYPES = lesson, podcast, talk, campaign, video` in `src/lib/path-plan.ts`; `STUDY_DAYS_PER_WEEK = 6` and `STUDY_DAYS_NO_REST = 7` in `src/data/path-config.ts`; `pathOff`, `pathTrimUntil`, `pathRestDay` in `src/lib/learner-profile.ts`; `src/routes/api/learning-path.ts`, `learning-path-data.ts`, `learning-path.server.ts`, `learning-path.fixtures.json` and the Swift and Kotlin fixture tests (`learning-path-native-fixtures.test.ts`); `PathStopRouting` (iOS Kit) routing a podcast or video stop to the Listen tab; the `path_built` event in `src/lib/analytics-events.ts`.

Open work:
- Calibrate `TALK_MINUTES` (4), `CAMPAIGN_SCENE_MINUTES` (6) and `QUIZ_MINUTES` (2) in `src/data/path-config.ts`. The 2026-11-16 production check found too few finished calls (3 and 5) and no quiz start or end time recorded, so they stay estimates; re-run once each kind has 30 finished calls, and record quiz start and end times first.
- Owner review of `src/data/path-tags.ts` (goal to item map; last changed in #574, campaigns added in #495). (unverified: no record of an owner review exists in the repo.)
- Device checks of the path screens on iOS and Android (unverified: owner-run).

Owner-approved mock: mocks-r8 Feature 2, layout A "the road", plus layout B's week view and "Why this mix", plus the Profile "My path" card and per-type tiles.

## Shape

- **One engine, run once.** `planPath` (`src/lib/path-plan.ts`) is pure: `now` and every list come in. The server (`/api/learning-path`) builds its input from the database (`src/lib/learning-path-data.ts`, `learning-path.server.ts`) and returns the plan. Web, iOS and Android only render it, as they do the goal planner, so the three can never disagree. `src/lib/learning-path.fixtures.json` is the contract: the web test regenerates it from the engine, the Swift and Kotlin tests decode byte-for-byte copies.
- **Builds on the goal planner.** `planGoal` still owns "lessons a week" and the status; the path adds the mix, items, road and recovery around it.
- **Types.** lesson, podcast, talk, campaign and video (Alphonso tutor videos from Library > Watch, added in #499 by extending `PATH_TYPES`, `PATH_TYPE_INFO` and the candidates; a learner with no video activity gets no empty Videos tile).
- **No migration.** Streaks and minutes derive from existing tables; the learner's type switches and "lessons first until" date are `pathOff` and `pathTrimUntil` in `user_metadata.learner_profile` (zod-checked: lessons can never be switched off).

## The rules (shown to the learner on "Why this mix")

1. The week is daily minutes x 6 study days; one day is a rest day: default Sunday, configurable via `pathRestDay` (the learner's local day; #493, #497).
2. Lessons are at least half the week, and as many minutes as the goal planner's lessons a week need (capped at the week). A weak lesson-trained skill raises the floor.
3. The rest is split among the enabled optional types: equal weight, plus a boost for the types that train the weakest skill (listening to podcasts, speaking to talks and, at half weight, campaigns), half of it for the second weakest, plus a boost to campaigns when one is tagged with the learner's goal.
4. Items are ranked by level fit, goal tag, interest tags and weak skills, and never above the learner's level.
5. Behind: three choices, each with its own number: lessons first for 14 days (the trimmed mix keeps one podcast), move the date (the planner's suggested date), add minutes (next first-run step).

## Minutes

Lessons: `lesson-timing.json` through `estimateLessonMinutes`. Podcasts: the episode's real `duration_seconds` plus the quiz. Finished-day lesson minutes come from `learning_days`; call minutes from `practice_calls` start to last reply (capped). Talk, campaign scene and quiz minutes are estimates in `path-config.ts` (production had only 8 finished calls on 2026-11-12): calibrate them from production.

## Implementation status (carried from 2026-11-13; re-verified 2026-11-22)

| Part | State | Notes |
| --- | --- | --- |
| Engine `planPath`, `/api/learning-path`, shared fixtures | **Done** (#490) | fixtures decoded byte for byte by Swift and Kotlin tests |
| Web, iOS, Android: Learn path card, the road, behind and its three recovery choices, week view, Why this mix, Build my path, Profile My path card | **Done** (#490) | (unverified: no device check on record) |
| Rest day (Sun to Sat or none) | **Done** (#493) | `pathRestDay`, `set_rest_day` |
| iOS: every stop opens (`PathStopRouting`) | **Done** (#493) | a podcast stop opens the Listen tab, not the episode |
| Days are the learner's local day | **Done** (#497) | the engine's today and week use `localDay` |
| Calibration of `TALK_MINUTES`, `CAMPAIGN_SCENE_MINUTES`, `QUIZ_MINUTES` | **Open** | estimates in `src/data/path-config.ts`; the 2026-11-16 check found too little production data |
| Review of `src/data/path-tags.ts` (goal to campaign map; four campaigns added in #495) | **Open, owner** | |
| PostHog `path_built` event | **Done** (round 14) | fires the first time a goal is saved for a course; course only; web, iOS, Android |
| `video` path type (Alphonso tutor videos as path stops) | **Done** (#499) | `PATH_TYPES` includes `video` |

## v2: every learner has a path, and weak spots in Today

Approved by the owner ("go for A plus B plus C"; the layout "A1 B2 C1" from the path mock). The engine is still ONE pure function (`planPath`); web, iOS and Android render what `/api/learning-path` sends.

**A. Everyone gets a path.** With no `learning_goals` row the server no longer answers `{ path: null }`. The data layer builds a SUGGESTED goal (`suggestGoal` in `src/lib/learning-goal.ts`): the next CEFR level after the learner's level (the placement result, or `language_progress`), about `SUGGESTED_GOAL_DAYS` (90) days away, moved out a week at a time until the planner's own realism rule says "ok" and the lessons a week fit the daily minutes. At C1 the target stays C1. Missing first-run answers fall back to `DEFAULT_DAILY_MINUTES` and to no goal or interests. The response carries `goal: { suggested, built }`; nothing is saved until the learner taps "Looks good" (the existing goal endpoint) or edits the target. Learn shows a "Your path is ready" card between the map and the For you rail until then; the Road screen shows "Suggested from your answers - Change".

**B. Weak spots, kept out of the plan.** Learn gets a "Today" card with the normal plan, and a separate "Fix before it sticks" card (`path.fix`, null when there is nothing to fix or the learner switched it off in Build my path: `PUT set_fix_off`). Its minutes still count in the day and the week.
- `weakspots` ("Fix your weak spots", a ref of kind `review`, which opens the existing Review flow): shown at most once a day, only on a study day, when Review items due plus recent call mistakes (tutor_memory "mistake" lines of this course, minus those already a due Review item) reach `WEAK_SPOTS_MIN_ITEMS` (3). Minutes come from the count at the timing of one multiple-choice card, capped at `WEAK_SPOTS_MAX_MINUTES`.
- `refresher` (an ordinary lesson ref): ONE earlier completed lesson, when a weakness category repeats `REFRESHER_MIN_EVENTS` (3) times in `REFRESHER_WINDOW_DAYS` (14), or once while grammar or vocabulary is already weak. The category to lesson map is the explicit table in `src/data/refresher-topics.ts` (patterns on unit titles; the curriculum has no grammar tags), pinned by tests. The shortest completed lesson of the matching units is offered. After any earlier lesson is replayed there is no refresher for `REFRESHER_COOLDOWN_DAYS` (3). `weakness_events` has no course column, so only the English course reads it; French and Spanish use their own tutor_memory topics.
- A replayed lesson is practice, not goal progress: the goal planner now takes the FIRST completion of a lesson.
- "Why this mix" explains both in plain words (`source: "weak"`). All numbers are in `src/data/path-config.ts`.
