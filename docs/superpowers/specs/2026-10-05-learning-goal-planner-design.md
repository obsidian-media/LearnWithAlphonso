# Learning goal and timeline planner: design

> Status (2026-10-09): implemented on web (#223), iOS (#225) and Android (#226).

**Status:** design approved in conversation 2026-10-05; owner answered the open questions 2026-10-06 (see below); the plan is next.
**Path:** architectural (new table, new route, three clients).
**BACKLOG:** section 0.0-ac, item 8 ("Goal and timeline planner").
**Platforms:** web first (decided), then iOS, then Android. Designed for all three from the start.

## Intent

A learner says "finish B1 by 1 March". The app turns that into a number they can act on (lessons per week), shows whether they are on track, and lets them move the date. It uses data the app already has (level, completions, the curriculum), costs nothing per use, and is the base the Canada test-prep idea (TEF/TCF/IELTS) will need later (a target level and a date).

Owner decisions: the goal has two steps (target level + date, then the weekly habit derived from it); web first then iOS; when behind, show it plainly with no push notifications and no silent date changes; and architect it for every platform (web, iOS, Android).

## Non-goals (v1)

Push reminders; automatic date changes; exam-specific modes; changing the curriculum or XP rules; per-skill (speaking/listening) goals; a calendar-week view; time-zone-aware days (the whole app counts UTC days today).

## Architecture: one implementation, thin clients

The plan maths lives once, on the server, behind one route. Clients render what it returns. Chosen over per-client maths because three copies drift (the repo's existing hand-kept mirrors, e.g. the Deno copies of web helpers, are the cautionary example), and because it matches how `define-word` works (server builds, client displays). Cost: the plan needs a connection; clients cache the last plan and show it with an "as of" time.

```
web / iOS / Android  --Bearer-->  /api/learning-goal  -->  learning_goals + lesson_completions
                                        |                    + bundled curriculum (lesson counts)
                                        v
                                   pure planGoal()  (src/lib/learning-goal.ts)
```

### Data

New table `learning_goals`:

| column | notes |
|---|---|
| `user_id` uuid | FK `auth.users` ON DELETE CASCADE |
| `language` text | `en` / `fr` / `es`, same convention as `language_progress` |
| `target_level` text | `A1`..`C1`; CHECK in the allowed set (a learner at A1 may want to finish A1) |
| `target_date` date | |
| `created_at`, `updated_at` | `created_at` is when the goal was first set (drives "just started") |

Primary key `(user_id, language)`: one goal per course. RLS: owner-only select/insert/update/delete. The route writes with the service role after validating, like `define-word`, so there is no client write path to widen.

Must be added to `USER_ID_EXPORT_TABLES` and `USER_DELETE_TABLES` in `account.functions.ts`; the test that parses `supabase/migrations/` fails the build if it is forgotten (that test is the guard, so expect it to go red first).

### Route

`/api/learning-goal`, Bearer-authenticated like the other `/api` routes. No AI call and no new quota; a plain rate limit is unnecessary because it does only indexed reads.

- `GET ?course=en` returns `{ goal | null, plan | null }` for the stored goal.
- `GET ?course=en&targetLevel=B1&targetDate=2027-03-01` returns `{ plan }` for that candidate **without saving** (powers the live "N lessons a week" in the setup screen).
- `PUT` body `{ course, targetLevel, targetDate }` validates and upserts; returns `{ goal, plan }`.
- `DELETE ?course=en` removes the goal.

Validation (400, nothing written): course in `en|fr|es`; level in `A1..C1`; date a real `YYYY-MM-DD`, strictly after today (UTC), at most 3 years out; and `targetLevel` must not be below the learner's current level (a goal to reach a level they have already passed is meaningless). 401 without a valid token. Failed database reads are 500 and never read as "no goal".

### The plan (pure function `planGoal`)

Inputs: current level (from `language_progress.cefr_level`), target level, target date, today, the set of completed lesson ids with their `completed_at`, the course's lesson list by level, and when the goal was created.

Definitions (each one is a decision, recorded here so it can be challenged):

1. **Reaching a level means finishing it.** "B1" means all lessons of B1 done. The UI says "Finish B1". Assumption: the alternative (reach = start the level) would roughly halve every pace; flagged for the owner.
2. **Lessons remaining** = lessons in units whose level is between the learner's *current* level and the target level inclusive, minus the ones they have completed. Counting from the current level, not from A1, means a learner who placed into B1 is not charged for A1. Real counts today: en A1 137, A2 119, B1 119, B2 117, C1 117; fr 115 per level; es 115-119 per level.
3. **Weeks left** = days from today to the target date, divided by 7, never below 1/7.
4. **Required per week** = remaining / weeks left, rounded **up** (a learner told "4.2 a week" should plan 5).
5. **Done recently** = distinct lessons IN SCOPE (same levels as definition 2) whose `completed_at` falls in the last 7 days (fresh-reviewer finding 2026-10-06: counting lessons below the learner's level let redoing old lessons look like progress) (a rolling window, not a calendar week, so time zones and week-start never matter). `lesson_completions` is upserted on `(user_id, lesson_id)` without touching `completed_at`, so `completed_at` is the **first** completion and replays cannot inflate the pace (verified in `complete-lesson/index.ts` and `sync.functions.ts`).
6. **Status**, first match wins: `done` (remaining is 0); `expired` (the target date is today or earlier and lessons remain: required per week is 0, a suggested date is offered from the recent pace, and the card asks for a new date; added after review because a weekly number for a date that has passed was nonsense); `just_started` (goal is under 7 days old, so there is no history to judge); `ahead` (done recently at least 1.25 times required); `on_track` (done recently at least required); otherwise `behind`.
7. **Realism label**, independent of status: `ambitious` above 14 lessons a week (two a day), `unrealistic` above 35. These are product-tuning constants, named in one place. Example: A1 to B1 in five months is about 250 lessons, roughly 12 a week.
8. **Suggested date** (only when `behind` or `unrealistic`, and the 7-day pace is above 0): today plus remaining divided by the recent weekly pace, rounded up to a day. If the recent pace is 0 there is no suggestion; the UI says so rather than inventing one.

`goal.createdAt` is always ISO-8601 with milliseconds and `Z` (the route normalises PostgREST's microseconds and `+00:00`, which Swift's ISO-8601 decoders reject). The offline cache is per user and used only for network-offline failures, never for 401 or server errors. Output: `{ currentLevel, targetLevel, targetDate, lessonsRemaining, lessonsDoneLast7Days, requiredPerWeek, status, realism, suggestedDate | null, asOf }`.

Copy rule: the UI calls this "an estimate of lessons, not of fluency", never a prediction that the learner will reach the level.

## Clients

All three render `plan`; none compute it. Same states everywhere: no goal (a "Set a goal" prompt), setup (level, date with 3/6/12-month presets, live preview from the preview `GET`, shown as an inline panel in the card rather than a popup, then a Save step showing the weekly number), and the goal card (progress as lessons done of lessons in scope, status line, required per week, "move the date" and "remove goal"). Offline: show the cached plan with "as of <time>", and disable edit.

- **Web:** a goal card on the Learn page and a setup dialog; a shared fetch module like `saved-word-client.ts`.
- **iOS:** Kit client + models (decoding tests), SwiftUI card and setup; app-target code compiles in CI only. No build is cut by this work.
- **Android:** client on the existing `ApiHttp`, a ViewModel with the same states, a Compose card and setup. Merging code does not release it (store release stays owner-gated).

Each platform ships as its own PR in that order. The route and migration ship with the web PR (live on merge); the iOS and Android clients are inert for users until a build is cut.

## Cross-platform contract

The response shape is the contract. A shared golden file `src/lib/learning-goal.fixtures.json` (cases as input and expected output) is read by the TypeScript tests and copied by the iOS Kit and Android test suites for decoding tests, so a field rename fails all three. The maths itself is tested only once (server side), by design.

## Privacy and compliance

No new third party. The privacy policy gets one line (a learning goal: target level and date, is stored) in the same PR as the web feature, since web ships on merge. The App Store privacy answers and `PrivacyInfo.xcprivacy` are re-checked when the first iOS build containing the planner is cut (BACKLOG 0.0x). Account export and deletion cover the table (see Data).

## Errors and edge cases

Goal date passes while the goal exists: status becomes `expired` (see definition 6), never a weekly number. Target level equals current: allowed (finish this level). Learner changes level (band picker) after setting a goal: remaining recomputes; a target now below the current level returns the goal with `plan: null` and a prompt to change it, never an error. Content added to the curriculum: remaining grows; status follows the pace, so nobody is suddenly "behind" because of a baseline. Multi-course: one goal per course. A learner with no completions and no `language_progress` row is treated as A1.

## Testing

Pure `planGoal` table tests (every status, both realism labels, rounding up, placement-skip, past date, zero pace, 0 remaining), each rule broken on purpose to confirm a test fails. Route tests for auth, validation, preview not writing, upsert, delete, and database errors. Migration test pinning the CHECK and RLS like the saved-word migration test. Export/delete guard test. Client tests per platform: rendering each status, offline cache, error messages. The fixtures file is the cross-platform pin.

## Owner decisions on the open questions (2026-10-06)

1. "Finish B1" is the right meaning of the goal. Confirmed.
2. Free and Pro learners both get the planner. Confirmed.
3. The 14 and 35 lessons-per-week warning limits (the `ambitious` and `unrealistic` labels) stay as defaults; the owner asked what they are, and they are warning labels shown when the weekly number a goal needs is very high (about two lessons a day, then about five). They are named constants, easy to retune after real use.

## Rollout order

1. Migration + route + pure maths + web UI + privacy line + docs (one PR; live on merge).
2. iOS Kit client + SwiftUI (PR; in no build until you cut one).
3. Android client + Compose (PR; release stays owner-gated).
4. Device checks for 2 and 3 joined to the existing BACKLOG checklist.
