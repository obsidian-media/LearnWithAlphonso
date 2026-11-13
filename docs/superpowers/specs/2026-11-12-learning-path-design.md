# Your learning path (2026-11-12)

Owner-approved mock: mocks-r8 Feature 2, layout A "the road", plus layout B's week view and "Why this mix", plus the Profile "My path" card and per-type tiles.

## Shape

- **One engine, run once.** `planPath` (`src/lib/path-plan.ts`) is pure: `now` and every list come in. The server (`/api/learning-path`) builds its input from the database (`src/lib/learning-path-data.ts`, `learning-path.server.ts`) and returns the plan. Web, iOS and Android only render it, as they do the goal planner, so the three can never disagree. `src/lib/learning-path.fixtures.json` is the contract: the web test regenerates it from the engine, the Swift and Kotlin tests decode byte-for-byte copies.
- **Builds on the goal planner.** `planGoal` still owns "lessons a week" and the status; the path adds the mix, items, road and recovery around it.
- **Types.** lesson, podcast, talk, campaign. `video` is added later by extending `PATH_TYPES`, `PATH_TYPE_INFO` and the candidates; nothing is shown for it now.
- **No migration.** Streaks and minutes derive from existing tables; the learner's type switches and "lessons first until" date are `pathOff` and `pathTrimUntil` in `user_metadata.learner_profile` (zod-checked: lessons can never be switched off).

## The rules (shown to the learner on "Why this mix")

1. The week is daily minutes x 6 study days; one day (Sunday, UTC) is a rest day.
2. Lessons are at least half the week, and as many minutes as the goal planner's lessons a week need (capped at the week). A weak lesson-trained skill raises the floor.
3. The rest is split among the enabled optional types: equal weight, plus a boost for the types that train the weakest skill (listening to podcasts, speaking to talks and, at half weight, campaigns), half of it for the second weakest, plus a boost to campaigns when one is tagged with the learner's goal.
4. Items are ranked by level fit, goal tag, interest tags and weak skills, and never above the learner's level.
5. Behind: three choices, each with its own number: lessons first for 14 days (the trimmed mix keeps one podcast), move the date (the planner's suggested date), add minutes (next first-run step).

## Minutes

Lessons: `lesson-timing.json` through `estimateLessonMinutes`. Podcasts: the episode's real `duration_seconds` plus the quiz. Finished-day lesson minutes come from `learning_days`; call minutes from `practice_calls` start to last reply (capped). Talk, campaign scene and quiz minutes are estimates in `path-config.ts` (production had only 8 finished calls on 2026-11-12): calibrate them from production.

## Implementation status (2026-11-13, main at #498)

| Part | State | Notes |
| --- | --- | --- |
| Engine `planPath`, `/api/learning-path`, shared fixtures | **Done** (#490) | fixtures decoded byte for byte by Swift and Kotlin tests |
| Web, iOS, Android: Learn path card, the road, behind and its three recovery choices, week view, Why this mix, Build my path, Profile My path card | **Done** (#490) | not yet checked on a device |
| Rest day (Sun to Sat or none) | **Done** (#493) | `pathRestDay`, `set_rest_day` |
| iOS: every stop opens (`PathStopRouting`) | **Done** (#493) | a podcast stop opens the Listen tab, not the episode |
| Days are the learner's local day | **Done** (#497) | the engine's today and week use `localDay` |
| Calibration of `TALK_MINUTES`, `CAMPAIGN_SCENE_MINUTES`, `QUIZ_MINUTES` | **Open** | estimates in `src/data/path-config.ts` until production data exists |
| Review of `src/data/path-tags.ts` (goal to campaign map; four campaigns added in #495) | **Open, owner** | |
| PostHog `path_built` event | **Open** | the name is reserved in the three event lists; no call site |
| `video` path type (Alphonso tutor videos as path stops) | **In progress** | the Library branch `feat/library-watch` adds it; not merged |
