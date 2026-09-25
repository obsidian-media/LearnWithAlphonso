# Architecture

Written 2026-09-13, last substantially updated 2026-09-22 — re-verify
against `supabase/migrations/*.sql` and `src/routes/` before trusting a
detail here; this codebase's own audit history shows even a careful
point-in-time doc goes stale within weeks. This doc favors "where to look"
over "what the answer currently is," since the latter goes stale fast.

## Stack

- **Framework:** TanStack Start (SSR) on Vite 8 + Nitro, React 19
- **Routing:** TanStack Router, file-based (`src/routes/`, see
  `src/routes/README.md` for conventions)
- **Styling:** Tailwind CSS v4, hand-written components (no UI kit —
  `src/components/ui/` was removed 2026-09-13, confirmed unused)
- **Client state:** Zustand (`src/lib/progress.ts`)
- **Server state / data fetching:** TanStack Query + TanStack Start server
  functions (`createServerFn`, in `src/lib/*.functions.ts`)
- **Backend:** Supabase (Postgres + Auth + Row-Level Security + RPCs)
- **Package manager:** bun (`bun.lock` is authoritative; there is
  deliberately no `package-lock.json`)

## Request flow

1. A route component calls a server function from `src/lib/*.functions.ts`
   (e.g. `completeLessonRemote`, `fetchDueReviews`).
2. Every server function is wrapped in the `requireSupabaseAuth` middleware
   (`src/integrations/supabase/auth-middleware.ts`), which verifies the
   caller's Supabase JWT and hands the handler a request-scoped Supabase
   client authenticated **as that user** — so normal queries run under RLS,
   not admin privilege.
3. Handlers either query tables directly (RLS-scoped) or call a Postgres
   RPC for anything that needs to write across users (friend invites,
   leaderboard) or that needs a hardcoded server-side limit a client
   shouldn't control (AI quota/rate limit). RPCs are `SECURITY DEFINER`
   for exactly those two reasons — see `supabase/migrations/`.
4. `src/integrations/supabase/client.server.ts` (`supabaseAdmin`) is the
   only place with the service-role key, used sparingly and only from
   server-only code (never from a `*.functions.ts` file directly, since
   those ship to the client bundle — see the comment in that file).

## Database (see `supabase/migrations/*.sql` for the source of truth)

| Table                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                           | Display name, avatar seed, country — one row per `auth.users` row (see `handle_new_user` trigger)                                                                                                                                                                                                                                                                                                                                                           |
| `user_progress`                                      | Account-wide state: streak, longest streak, hearts, hearts refill timestamp, streak freezes                                                                                                                                                                                                                                                                                                                                                                 |
| `language_progress`                                  | Per-course state: xp, cefr_level, placement result, league tier. PK `(user_id, language)`                                                                                                                                                                                                                                                                                                                                                                   |
| `lesson_completions`                                 | Best score per lesson per course                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `activity_days`                                      | XP earned per calendar day, powers the activity heatmap and weekly-XP leaderboard scope                                                                                                                                                                                                                                                                                                                                                                     |
| `achievements` / `user_achievements`                 | Achievement catalogue + unlocks                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `friendships`                                        | `(user_id, friend_id, status)`, written both directions atomically by `accept_friend_invite`                                                                                                                                                                                                                                                                                                                                                                |
| `friend_activity_events`                             | Feed rows (`lesson_completed`/`streak_milestone`/`league_promotion`) written by `complete-lesson`/`completeLessonRemote` when something feed-worthy happens; read scoped to friends via `friendships`                                                                                                                                                                                                                                                     |
| `nudges`                                              | `(sender_id, recipient_id, read_at)` — the weaker, polling-based nudge-a-friend feature (see "Native iOS app" below); recipient's app checks for unread rows on foreground, not real push                                                                                                                                                                                                                                                                 |
| `review_items`                                       | SRS queue: `(user_id, item_key, language)` unique, `ease`/`interval_days`/`repetitions`/`due_on`/`lapses`. `source` (`"lesson"` default / `"weakness"`) discriminates a real lesson-question item from a synthetic weakness-detection item (`weakness_label`/`weakness_display`/`prompt`/`choices`/`answer_index`/`explanation` — embedded gradable content, no `lessons`/`questions` row to point at). See "AI integrations" below.                    |
| `ai_usage`                                           | Daily per-kind (chat/stt/tts) request counter, read by `consume_ai_quota`                                                                                                                                                                                                                                                                                                                                                                                   |
| `ai_rate_limits`                                     | Per-minute per-kind request counter, read by `consume_ai_rate_limit`                                                                                                                                                                                                                                                                                                                                                                                        |
| `levels` / `units` / `lessons` / `questions`         | Curriculum data mirrored from `src/data/curriculum.ts`/etc. into real tables (`scripts/seed-curriculum-db.ts` populates them) — exists so the `complete-lesson` Edge Function can validate a completion claim server-side without bundling curriculum JSON. **The web app itself still reads `curriculum.ts` directly, not these tables** — same precedent as `achievements` below. See `docs/superpowers/specs/2026-09-18-curriculum-db-schema-design.md`. |
| `vocab_images` / `placement_questions` / `scenarios` | Same mirroring, for the rest of the curriculum-adjacent static data (`src/data/vocab-images.ts`, `placement.ts`, `scenarios.ts`) — currently no consumer queries these yet                                                                                                                                                                                                                                                                                  |
| `teams` / `team_members` / `team_weekly_rewards`     | V4 #7 (deeper gamification) — persistent groups: invite code, public/private, `switch_locked_until` (7-day anti-hop lock), `_random_team_name`/`_join_team_impl` shared join logic with `FOR UPDATE` locking. Weekly-XP-sum leaderboard (`get_team_leaderboard`) and a lazy-resolved weekly win bonus (+100 XP to last week's #1 team's members, granted as a side effect of the next `get_my_team` read, no cron). Added `supabase/migrations/20260922040000_teams.sql`.                                                                                                                                                                                                                            |
| `season_cohorts` / `season_cohort_members` / `season_placements` | V4 #7 — Duolingo-style weekly promotion/demotion ladder, ~30-person cohorts ranked by weekly XP, 5 divisions. Resolved by the `get-season-status` Edge Function (below), not raw SQL — the ranking/promotion math (`floor(size/3)` promote, `floor(size/6)` demote) is unit-tested Deno/TS, not PL/pgSQL. No client RLS policy — only the Edge Function (service_role) touches these directly. Added `supabase/migrations/20260922050000_season_ladder.sql`.                                                                                                                                                                                                                                          |
| `challenge_templates` / `challenge_completions`      | V4 #7 — fixed weekly solo goals (6 seeded templates), same DB-seeded pattern as `achievements` rather than hardcoded TS constants (a deliberate deviation from that plan's original framing). `get_weekly_challenges()` RPC computes live progress per caller.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `duel_queue`                                          | V4 #7 — open/stranger duel matchmaking (as opposed to `duels`' friend-challenge flow): `join_open_duel_queue(_course, _match_by_level)` uses `FOR UPDATE SKIP LOCKED` to safely match two waiting rows concurrently, going straight to an `active` duel with XP baselines captured (mirroring `respond_to_duel`'s logic, since both sides already consented by queueing — no separate accept step). Added `supabase/migrations/20260922030500_weekly_challenges.sql`, which also fixed a real pre-existing bug: `duels.course`'s `CHECK` constraint only allowed `('en','fr')`, silently breaking Spanish duels since the V4 #1 Spanish launch.                                                    |

| `podcast_folders` / `podcast_episodes` / `podcast_playback` / `podcast_play_events` | Podcast library Phase 1a — a self-referencing folder tree of arbitrary depth (the editorial Course/Level/Series shape is a convention for filling it, not a schema constraint), published episodes, per-user resume positions, and play events. Only `service_role` writes folders and episodes; there is no client insert/update policy on either. Two constraints carry weight: root folder slugs need their own partial unique index because Postgres treats `NULL` parent_id values as mutually distinct, and cycle prevention lives in `src/lib/podcast-tree.ts` (tested) rather than a trigger, since only the CLI writes. Added `supabase/migrations/20260926030000_podcast_library.sql`. **`podcast_play_events` is written only through `record_podcast_play_event()`** -- the direct INSERT grant it shipped with let any signed-in client write arbitrary `seconds_listened`, arbitrary `started_at`, and any episode id including unpublished ones (foreign keys do not consult RLS), on the one table Phase 2's XP and SRS wiring is meant to trust. Hardened the same way the gamification tables were in `20260920050000`; see `20260926223031_podcast_play_event_rpc.sql`. `podcast_playback` deliberately keeps its direct grant: falsifying your own resume position affects only you. |

**Podcast audio storage.** Episodes live in a **public-read** Supabase
Storage bucket, `podcast-audio`, with no client write policy — only
`scripts/podcast-tool.ts` (service role) uploads. Consequence worth
knowing before anyone builds on it: `podcast_episodes.published` hides
the **row**, not the **file**, so an unpublished episode's audio is
still fetchable by anyone with the URL. That is acceptable only while
this content is free for everyone. **A public bucket cannot enforce a
Pro entitlement** — if podcasts are ever gated, the move to a private
bucket with signed URLs must happen first, and it is the expensive,
hard-to-reverse part of the design. Audio egress is also far heavier
than this app's existing text-and-thumbnail traffic and Supabase
bandwidth is metered: a 6-minute 64kbps mono episode is ~2.9 MB, so 100
episodes played once each by 100 learners is ~29 GB.

RPCs worth knowing (all `SECURITY DEFINER`, all in `supabase/migrations/`):
`get_leaderboard`, `get_friends_progress`, `accept_friend_invite`,
`consume_ai_quota`, `consume_ai_rate_limit`, `restore_hearts_if_due`,
`record_podcast_play_event` (validates the episode is published and bounds
`seconds_listened` by its real duration -- the podcast analytics table has
no direct client INSERT grant),
`buy_heart_with_xp`, `claim_review_clear_bonus` (the last three: atomic,
row-locked hearts-economy operations — see "Hearts economy" below),
`lose_heart`, `set_cefr_level`, `save_placement_result` (added
2026-09-20 — the iOS client's remaining direct-write replacements, see
"Known rough edges" below), and (V3 package 2, same day)
`buy_streak_freeze_with_xp`, `create_duel`, `respond_to_duel`,
`get_my_duels`, `claim_weekly_quest` — see CHANGELOG.md's V3 entry. V4
#7 (2026-09-22) added `weekly_xp` (extracted out of `get_leaderboard`,
the shared building block the rest of this batch depends on),
`join_team`/`join_public_team`/`auto_join_team`/`leave_team`/
`get_my_team`/`get_team_leaderboard`, `get_weekly_challenges`,
`join_open_duel_queue`/`leave_duel_queue`, and
`get_cohort_weekly_xp` (service_role-only, called by the
`get-season-status` Edge Function below, not client-callable).

`user_progress`, `language_progress`, `lesson_completions`,
`user_achievements`, `activity_days`, and `review_items` all carry `CHECK`
constraints on their numeric/enum columns (added 2026-09-18), **and, as of
2026-09-20 (`supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql`),
no longer grant direct `INSERT`/`UPDATE` to `authenticated` at all** — the
real fix the 2026-09-18 migration's own comment deferred. Every write now
goes through either `supabaseAdmin` (web server functions -- the value was
already server-computed, so this is the same trust boundary the
complete-lesson/grade-review Edge Functions' own writes already use) or one
of three new `SECURITY DEFINER` RPCs (`lose_heart`, `set_cefr_level`,
`save_placement_result`) that the native iOS client (`ProgressSyncClient.swift`)
calls directly, replacing the three direct-write operations it used to
depend on. SELECT and the existing DELETE grants (GDPR export/delete,
`gradeReview`'s retire path) are unchanged. **A currently-shipped TestFlight
build predates this change** and will see permission-denied errors on
heart loss / CEFR level / placement save until a new build ships.

**Applying migrations:** `.github/workflows/ci.yml`'s `deploy-supabase` job
now runs `supabase db push` (and redeploys all three Edge Functions)
automatically on every push to `main`, gated on `lint-and-typecheck`/`e2e`
passing first (see "Known rough edges" below for the incident history that
motivated this, and the job's own comment for the required repo secrets).
Before this existed, every file under `supabase/migrations/` needed a
manual `supabase db push` or hand-applied SQL before the corresponding code
path worked in the real app -- a new RPC or table referenced by app code
but not yet pushed fails at request time (typically a 500), not at build
time. The manual path is still the fallback if the CI job's credentials
ever lapse.

`supabase/migrations/` doesn't fully reconstruct the live schema from
scratch: a 2026-09-20 repair found the remote migration-tracking table
carried 23 entries (`harden_function_search_paths`,
`tighten_rls_and_leaderboard`, `fix_fr_delete_own_predicate_regression`,
etc.) with no corresponding local file at all, applied at some point via
the Supabase MCP `apply_migration` tool directly against the live project
rather than through a committed `.sql` file. Live schema was verified
consistent with every local file's expected end state before repairing the
tracking table (`list_tables`/`pg_proc` against the full local migration
set), so this was safe to resolve as pure bookkeeping -- but it means a
handful of early hardening changes exist in prod with no SQL file to
reproduce them from a fresh project. Not solved here; if a from-scratch
rebuild is ever needed, `supabase db pull` against the live project first.

## Content model

`src/data/courses.ts`'s `getCourse(course)` is the single entry point for
lesson content — returns a `CourseBundle` (curriculum, question index,
placement pool) for `"en"`, `"fr"`, or `"es"`. Each course pairs
hand-written units (`curriculum.ts` / `curriculum-fr.ts` / `curriculum-es.ts`)
with a generator-produced bank (`lesson-bank.ts` / `lesson-bank-fr.ts` /
`lesson-bank-es.ts`, via `generatedUnits()`/`unitsFromBank()`). Actual
counts, verified 2026-09-24 (re-run the count rather than trusting this
without checking — see README.md's Content table for the same numbers,
kept in sync): English 609 lessons / 3,096 questions, French 500 lessons
/ 2,500 questions, Spanish 508 lessons / 2,540 questions. English is now
ahead of structural parity (it gained the listening, speaking and
translation types, with 125 questions each); French/Spanish still need a native-speaker review
pass for grammar/naturalness (`docs/BACKLOG.md`, gitignored).

**There are six question types**, not three: `mc`, `fill`, `reorder`,
`listening`, `speak`, and `translate`. `listening` (added 2026-09-24) plays
`audioText` via TTS and asks the learner to choose what they heard; `speak`
(added 2026-09-24) shows a phrase, records the learner saying it, and grades
the speech-to-text transcript; `translate` (added 2026-09-24) describes an
idea and has the learner write it, accepting any of a curated list of
wordings. Four things about them are load bearing:

- Every type except `mc` carries its answer as **text**, not as an index
  (`listening` stores the correct choice's text; `speak` stores the phrase and
  has no choices at all).
  That matches `fill`/`reorder` and is why `srs.ts`'s
  `deriveAnswerCorrectness` — and both web players' non-`mc` comparison —
  grade it with no type-specific code. Adding a variant with a numeric
  answer would break that, since several call sites narrow `mc` away and
  then assume the remainder has a string answer.
- A new question type must be wired into **both** players on **both**
  platforms: `lesson.$id.tsx` AND `review.tsx` on web,
  `LessonPlayerView.swift` AND `ReviewQueueView.swift` on iOS, plus
  `QuestionGrading.swift` and `VocabDerivation.swift` (three switches) in
  the Kit. A type handled only in the lesson player renders as a blank card
  in spaced review — silently on web, as a compile error on iOS.
- Anything graded with a rule of its own needs that rule in
  `deriveAnswerCorrectness` (`src/lib/srs.ts`), not in the player. The
  review server re-derives correctness independently, so a rule that lives
  only client-side shows the learner "Still got it" and then lapses the item
  behind their back. `speak` is the case in point: its tolerant transcript
  match (`src/lib/spoken-answer.ts`) exists in **three** hand-kept copies —
  TypeScript, the `grade-review` Deno mirror, and `SpokenAnswer.swift` — with
  the same test vectors in all three suites, which is the only thing keeping
  them honest.

- **`translate` is graded in three places, and they must agree.** Its rule
  is hybrid: the curated `acceptableAnswers` decide it locally and for free,
  and only what they reject is put to an AI grader
  (`src/lib/translation-grader.server.ts`, mirrored for Deno). That AI half
  runs **server-side in all three paths that grade** —
  `/api/grade-translation` for the lesson player, `gradeReview` in
  `review.functions.ts` for web review, and the `grade-review` Edge Function
  for iOS review. Putting it in only one would recreate the lapse-behind-your-
  back bug: a wording accepted on screen and re-derived by string comparison
  in the scheduler. The review players therefore **display the verdict from
  the same call that scheduled the item** rather than grading it a second
  time — `gradeReview` returns `correct` on web, and `grade-review` does the
  same for iOS, which grades on Check rather than on Next so there is one call
  and one verdict. A first attempt had iOS *displaying* a verdict from
  `/api/grade-translation` while `grade-review` independently decided the
  schedule: two AI calls, two answers, no guarantee they matched. A `null` from the grader (vendor
  down, no key, quota spent, unparseable reply) always means "no opinion" and
  leaves the local verdict standing — it never means "wrong".


**The placement exam assesses three of the six types**, not one: `mc`,
`listening` and `translate`. It used to be multiple-choice only, which meant a
learner was placed by a text-only exam and then met a course that is roughly
one-eighth listening, speaking and translation — assessed on nothing they would
actually do.

`speak` is excluded **deliberately**. Including it would gate onboarding on a
microphone-permission prompt before the learner has any reason to grant one,
and a denial makes the question unanswerable; the typing fallback that rescues
a speaking question inside a lesson would here be assessing writing while
claiming to assess speaking. That is a product decision, argued in
`docs/superpowers/plans/2026-09-24-placement-question-types.md`, not a
technical limitation — one type the exam still does not cover, but as a stated
gap rather than an accidental one.

Two properties hold the exam together and are easy to break:

- **Every question must resolve to an answer.** There is no skip. A translation
  with no network keeps its local verdict; listening questions are removed from
  the pool entirely on a browser with no TTS, *before* the three-per-band draw
  (`playablePool`), rather than falling back to printing the sentence the way a
  lesson does — here the sentence is the answer. Filtering after the draw is the
  same bug in the other direction: it can leave a band holding one question,
  and a band needs two correct. An unanswerable lesson question costs a heart —
  an unanswerable placement question mis-places the learner, or leaves the exam
  unable to finish and them with no level at all.
- **Grading takes the submitted TEXT, for every type** (`isPlacementAnswerCorrect`
  in `src/data/placement-grading.ts`). The exam used to compare an option
  index, which only multiple choice can express.

`placement_questions` mirrors the pool into Postgres, but **nothing reads it at
runtime** — the app uses bundled content and `scripts/seed-curriculum-db.ts` is
its only writer.

`Question` decoding on iOS **fails loudly** on an unrecognised `type`. A
lenient version (decoding to a filtered `.unsupported` case) was tried and
reverted: content ships inside the same binary and CI fails the build if the
exported JSON drifts from source, so an app older than its own bundle cannot
happen — while skipping a question leaves the lesson with fewer questions than
the server's copy, and `deriveLessonCompletion` throws on that mismatch, so the
learner finishes and silently receives no XP, no streak and no unlock. When
over-the-air content exists this needs a real migration story, not leniency.

Listening and speaking questions contribute no vocabulary (`deriveVocab` skips
them, same as `reorder` — a whole-sentence answer makes a nonsense vocab card),
so those lessons go straight from overview to quiz with no vocabulary step.

Speech capture is one implementation, not one per feature:
`src/lib/use-speech-capture.ts` on web (used by the conversation route and
`SpeakAnswer.tsx`) and `SpeakQuestionCard.swift` on iOS. Both only report a
transcript that still says something once normalised — hesitation noise ("Um.")
is non-empty but normalises to nothing, and every failure path surfaces an error
and reports nothing, because a grading caller handed "nothing" would take a
heart for a microphone problem.

Whenever speech cannot be captured the control degrades to **typing the
phrase** — and that is driven by actual failure, not only by feature detection.
A denied microphone, a dead network, a failing `/api/stt` and silence all reach
it, as does the absence of `getUserMedia` (and, on iOS, being offline, since
transcription is a network call). Feature detection alone was not enough: a
learner who denied the microphone kept a mic button that could never produce an
answer, on a question with no skip, which makes the lesson unfinishable — no
XP, no streak, no unlock, and nothing on screen explaining why. iOS asks for
microphone permission **explicitly** for the same reason: a denial does not
throw, `AVAudioRecorder.record()` simply returns false and records silence.

Server-side score validation (`completeLessonRemote` in
`src/lib/sync.functions.ts`) looks lessons up through this same
`getCourse().findLesson()` path, so the curriculum data doubles as the
server's source of truth for "does this lesson exist and how many
questions does it have."

## Generative content pipeline (pilot, English-only, `src/data/generative/`)

Added 2026-09-22 (PR #76) — a `generate` subcommand on
`scripts/pack-tool.ts` that produces real course content from
hand-authored grammar templates and an LLM-proposed, compiler-validated
vocabulary dataset, feeding the *existing*, unmodified
`validate`/`preview`/`apply --confirm` pipeline (`src/lib/
pack-authoring.ts`) — a generated pack looks identical to a
hand-authored one once it lands in `lesson-bank.ts`.

- `src/data/generative/templates.ts` — hand-authored grammar skeletons
  (`TEMPLATES`, currently `svo-present`/`svo-past` only) and the fixed
  7-word `PRONOUNS` closed class. Templates are never LLM-proposed.
- `src/data/generative/vocab.ts` — `GENERATIVE_VOCAB`, grows only
  through the CLI (never hand-edited) after each candidate passes a
  real part-of-speech cross-check against `compromise`'s own tagging.
  "be" is permanently excluded (needs a full person-varying present
  paradigm this pipeline doesn't derive).
- `src/data/generative/compile.ts` — `baseForm`/`thirdPersonForm`/
  `pastForm` conjugate via a verified fixed-context derivation
  (`nlp("I " + verb)`/`nlp("he " + verb)`), never trusting `compromise`'s
  own subject-agreement detection directly — a hands-on spike found it
  mis-conjugates "you" as 3rd-person-singular and fails to conjugate a
  bare isolated word to past tense with no context. `compileLine`
  compiles one template + slot assignment into a literal
  `"sentence|answer"` line, capitalized, with `a`/`an` articles on
  countable noun slots.
- `src/data/generative/expand.ts` — combinatorial template × vocab
  expansion, deduped to one verb per (subject, object) pair (prevents
  the same prompt appearing twice with different "correct" answers),
  verb pool capped at 4 per pack (bounds — doesn't eliminate —
  cross-verb multiple-choice distractor pollution, since
  `bank-engine.ts`'s `pickDistractors` is shared/unmodified), then
  sampled via `sampleStratified` (groups by subject, round-robins
  across groups) so every pronoun's agreement class is proportionally
  represented — a naive sort-by-hash was found to cluster picks into
  one or two pronoun classes.
- `src/lib/generative-vocab.server.ts` — LLM vocab-candidate proposal
  (same NVIDIA NIM integration as every other AI feature) +
  `verifyCandidatePos` (the real POS cross-check gate) +
  `proposeVocabForTopic` orchestration.
- `src/lib/generative-vocab-authoring.ts` — pure `mergeVocabEntries`
  (unions topics into an existing entry rather than duplicating it) and
  `replaceVocabArrayInSource` (splices `vocab.ts`'s array via
  bracket-depth counting, not a literal string search — the real
  committed file collapses an empty array onto one line, which a naive
  `"\n];"` search couldn't find).

**Known, documented limitations** (not silently solved): French/Spanish
out of scope; cross-verb MC distractors reduced but not eliminated
(would need semantic verb/object modeling or a shared `bank-engine.ts`
change, both out of scope for the pilot); a new LLM-proposed verb
beyond the 7 spike-verified ones (have/go/do/walk/run/eat/play) is
never re-checked against a known-correct conjugation table before
compiling; the POS cross-check still false-rejects some genuinely
ambiguous common words (book/cook-class) — a context-based fix was
investigated and found to be a *worse* regression (verified it
wrongly accepts "coffee" as a verb, "relax" as a noun), so the
fail-safe bare-word check stays. Full detail, every finding, and the
verified spike data: `docs/superpowers/specs/
2026-09-22-generative-sentence-content-design.md`.

## Edge Functions (Deno, `supabase/functions/`)

Trust-sensitive write/issue paths that aren't TanStack Start server
functions, because the native iOS client has no server layer of its own
to run them in. Also home to `get-season-status`, which needs genuinely
complex server-side logic (not just a trust boundary) — see below. All
are deployed and live in production (project `qhcjpfbxfcltjbiuknyt`):

- **`complete-lesson`** — 1:1 port of `completeLessonRemote`
  (`src/lib/sync.functions.ts`) to Deno, reading curriculum data from the
  `lessons`/`units`/`questions` tables above instead of the in-process
  `curriculum.ts` the web app uses. Also upserts `review_items` rows for
  any missed questions (folds in `recordMisses`' logic, since this
  function already has the validated lesson/question data recordMisses
  would otherwise need a second session-token round trip to re-verify).
- **`start-lesson-session`** — issues the HMAC session token
  `complete-lesson` requires as proof a lesson was actually opened. On
  the web app this comes from `startLessonSession`, a TanStack Start
  server function reachable only via the web app's own RPC layer — this
  is that same issuance exposed over plain HTTP so iOS can call it too.
- **`grade-review`** — 1:1 port of `gradeReview`
  (`src/lib/review.functions.ts`): re-derives an SRS review answer's
  correctness server-side against the real question (never trusts a
  client-supplied `correct` boolean), rejects grading an item that isn't
  due yet, updates/retires the item. Branches on `review_items.source`:
  a `"weakness"` row derives correctness from its own embedded
  `choices`/`answer_index` instead of looking up a `questions` row.
- **`send-push`** — V4 real-push-notifications work: sends a real APNs
  push (`supabase/functions/_shared/apns.ts`) for nudge-a-friend and
  leaderboard-overtake, upgrading those from the weaker
  polling-on-foreground/in-app-toast approaches described elsewhere in
  this doc. No-ops gracefully when `APNS_KEY_P8`/`APNS_KEY_ID`/
  `APNS_TEAM_ID`/`APNS_BUNDLE_ID` aren't all set (see `ci.yml`'s "Sync
  APNs secrets" step) — same "do nothing until configured" precedent as
  `REVENUECAT_API_KEY`.
- **`get-season-status`** — V4 #7 (deeper gamification): resolves the
  caller's previous week's season-ladder cohort lazily (a side effect
  of this call, same no-cron pattern as `get_my_duels`), ensures a
  current-week cohort exists (room-or-create, same pattern as Teams'
  `auto_join_team`), and returns live division/rank/cohort-size. Unlike
  the three above, this isn't wrapping a trust boundary an existing web
  server function already has — the ranking/promotion math itself is
  genuinely complex enough to want real unit tests (`season-math.ts`/
  `season-math.test.ts`, pure functions, no Supabase client), which is
  why this system is an Edge Function instead of a PL/pgSQL RPC like
  every other V4 #7 write path.

**Not an Edge Function, deliberately**: `/api/analyze-weaknesses`
(weakness detection, see "AI integrations" below) is a plain TanStack
Start API route (`createFileRoute`, same shape as `api/chat.ts`), not a
fourth Edge Function — it needs both NVIDIA NIM access and
`ai-quota.server.ts`'s quota enforcement, both of which only exist in
the TanStack Start runtime, and nothing on the web side calls it (only
iOS does), so there's no portability reason to duplicate it in Deno. It
writes `review_items` using the caller's own RLS-scoped client (anon
key + bearer token), **not** service-role — the trust boundary it
protects is "the LLM decides the question content, not the caller,"
which holds regardless of which key signs the request.

Because Edge Functions bundle each function directory independently,
each carries its own Deno copies of the pure math it needs
(`complete-lesson/{progress-math,hearts,lesson-session}.ts`,
`start-lesson-session/lesson-session.ts`, `grade-review/srs.ts`) rather
than importing across the `supabase/functions/` boundary — **these must
be kept byte-for-byte in sync with their TypeScript source of truth by
hand**. `srs.ts`/`hearts.ts` now have a parity guard (`deno-tests` in
`.github/workflows/ci.yml`, running `grade-review/srs.test.ts` and
`complete-lesson/hearts.test.ts`, which mirror `src/lib/srs.test.ts`/
`hearts.test.ts`'s exact vectors) so a future drift fails CI instead of
surfacing as a silent behavior mismatch between web and iOS; `progress-math.ts`
and `lesson-session.ts` don't have this yet. Deployed via `supabase
functions deploy <name>` (or the Supabase MCP `deploy_edge_function`
tool); `complete-lesson` and `start-lesson-session` both need the
`LESSON_SESSION_SECRET` Edge Function secret to match the web app's own
env value exactly, or tokens issued by one side won't verify on the
other (`grade-review` doesn't use session tokens at all — the `due_on <=
today` check is what prevents grading a never-actually-reviewed item).
See `docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md`.

## Hearts economy

`src/lib/hearts.ts` (ported to Deno for the Edge Function, and to Swift as
`ios/LearnWithAlphonsoKit/.../HeartsEconomy.swift`) is the pure math for:
passive regen (`hearts_refill_at` resolves back to full once its time
passes — resolved lazily on the next read/write, not via a cron job),
+1 heart for a perfect lesson, a full refill at every 7-day streak
milestone, +1 heart for spending XP (`buy_heart_with_xp` RPC), and +1/day
for clearing the SRS review queue (`claim_review_clear_bonus` RPC, guarded
by `user_progress.last_review_bonus_date`). The three RPCs exist
specifically to make "check current state, then write" atomic under
concurrent calls (`FOR UPDATE` row lock) — the equivalent logic in
`completeLessonRemote`/the Edge Function doesn't need its own RPC since a
single server-function invocation is already atomic from the client's
perspective.

## Themes

Three user-selectable themes on web (`meadow` default, `studio-ink`,
`manuscript`), defined as CSS custom properties per `[data-theme="..."]`
block in `src/styles.css` plus a design-tokens JSON per theme
(`src/design-tokens/*.json`, currently informational/export-only — the
CSS is the real source of truth the app reads). `src/lib/theme.ts` is a
small Zustand store: resolves server value (from `profiles.theme`) over
localStorage over the `meadow` default, and an inline `<script>` in
`src/routes/__root.tsx` applies the stored theme before first paint to
avoid a flash of the wrong theme. `profiles.theme` is validated by both a
Zod enum (`leaderboard.functions.ts`'s `updateProfile`) and a Postgres
`CHECK` constraint — both need updating together when a theme is added
(see `supabase/migrations/20260918140000_add_manuscript_theme.sql` for the
pattern: drop and re-add the constraint, since it isn't named per-value).
**As of 2026-09-23, iOS has a fourth theme, `canopy`, that is deliberately
NOT in this rule's scope** — see the "Native iOS app" section's Design
system paragraph below for why.

## Native iOS app (`ios/`)

Two pieces: `LearnWithAlphonsoKit` (a plain Swift Package — content
models, `ContentStore` bundled-JSON loader, SRS/progress-math/hearts-economy
ports, and network clients: `SupabaseAuthClient`, `ProgressSyncClient`
(PostgREST + the `complete-lesson`/`start-lesson-session`/`grade-review`
Edge Functions), `AIConversationClient` (this repo's own
`/api/chat`/`/api/tts`/`/api/stt`), `TutorConversationClient` +
`DeviceEnrollmentClient` (AlphonsoCompanion's Cloud Voice, Pro-only — see
below)) and `LearnWithAlphonso` (the SwiftUI app target, scaffolded via
XcodeGen so the `.xcodeproj` is generated from `project.yml` rather than
hand-clicked/committed).

There is no local Xcode/macOS in this development environment. The Kit
was written and tested on Windows via
`ios/LearnWithAlphonsoKit/swift-test.ps1` (zero UIKit/SwiftUI
dependency, so this works); the app target's *only* compile
verification is CI — `.github/workflows/ci.yml`'s `ios-app-build` job
runs a real `xcodebuild` on a macOS GitHub Actions runner on every PR,
and `.github/workflows/ios-release.yml` (manual trigger) produces a
real signed archive/`.ipa` and can optionally upload it to TestFlight,
using an App Store Connect API key (`-allowProvisioningUpdates`) rather
than any interactive Apple ID login. Empirically confirmed (two full
runs) that this signing flow does not permanently accumulate
certificates on the Apple account, despite each CI run starting from an
empty keychain — no certificate-persistence (`.p12`/fastlane-match)
infrastructure was needed.

**Two separate AI-conversation modes, two separate backends:**
- **Free** — `ConversationView.swift` / `AIConversationClient.swift`:
  calls this repo's own already-deployed AI endpoints directly (same
  backend, same Supabase account/session the rest of the app uses).
- **Pro** ($9.99/month, RevenueCat-gated) — `HectorView.swift` /
  `TutorConversationClient.swift`: AlphonsoCompanion's Cloud Voice
  backend (`voice.obsidianmedia.online`), which requires its own
  separate email-OTP sign-in and device enrollment
  (`HectorSession.swift` / `DeviceEnrollmentClient.swift`) against a
  **different Supabase project** (`ywavjlmjbxuslbxactsx`) — a second,
  deliberate account system, not a bug. Speech-to-text for this mode
  still goes through the app's own `/api/stt` (only the chat reply + its
  TTS audio come from Cloud Voice). That Cloud Voice Supabase project
  auto-paused (`INACTIVE`) once already during this project's
  lifetime — if Hector stops working, check its status first.

**RevenueCat**: `EntitlementStore.swift` wraps the SDK
(`Purchases.configure` in `LearnWithAlphonsoApp.init`) — every
Pro-gated view reads only `EntitlementStore.isPro`/`.packages`, never
touches `Purchases` directly. Currently configured with a **Test Store**
key; no real Offering/Package exists in the RevenueCat dashboard yet, so
`PaywallView` shows a "not available yet" state rather than a working
purchase button until a real App Store Connect subscription product is
created and connected. See `AGENTS.md`'s RevenueCat note for the exact
remaining steps.

App Store Connect app record exists: "Learn With Alphonso", app id
`6813969159`, bundle `com.obsidianmedia.learnwithalphonso`, Team ID
`9Y6GYPM3K5`.

**Design system** (`ios/LearnWithAlphonso/Sources/DesignSystem/`,
2026-09-22, extended to a full theme system 2026-09-22, extended again
2026-09-23 with a fourth, iOS-only theme — see below): originally ported
all three of the web app's themes (`src/styles.css`'s `:root`/Meadow,
`[data-theme="studio-ink"]`, `[data-theme="manuscript"]` blocks) rather
than inventing a separate native-only look, so web and iOS read as one
product. `AlphonsoTheme.swift` defines `AlphonsoThemeID` — **raw values
matched the web's `THEME_NAMES`/`profiles.theme` CHECK constraint
exactly until 2026-09-23; `canopy` is now a real exception, present in
`AlphonsoThemeID` and the CHECK constraint but deliberately absent from
`THEME_NAMES`** (web has no CSS for it and never offers it as a picker
option; `resolveInitialTheme` already falls back safely to `meadow` for
any value not in `THEME_NAMES`, so this doesn't break web) —
`AlphonsoPalette` (colors converted from each theme's oklch
values to sRGB via a standard OKLab conversion — computed, not
eyeballed — plus each theme's font base names/optical-size range and a
`ColorScheme`), and `AlphonsoThemeManager` (an `@Observable` singleton,
`UserDefaults`-backed — the iOS equivalent of the web's `theme.ts`
Zustand store). `AlphonsoColor`'s members are computed properties
reading the active theme's palette rather than fixed constants, so
adding a theme required zero changes at any of the ~16 already-styled
screens' call sites.

Each theme's font pair is bundled as its upstream **variable** font
file(s) (`Sources/Fonts/*.ttf`, all from google/fonts, OFL-licensed:
Fraunces/Geist for Meadow, Instrument Serif/Instrument Sans for Studio
Ink, Newsreader/Source Sans 3 for Manuscript — Instrument Serif is the
one static-only exception, a single Regular face, since the web app
never loads a bold weight for it) and `AlphonsoFont.swift` resolves a
specific weight/optical-size instance at request time via CoreText's
`kCTFontVariationAttribute`, rather than depending on iOS's per-OS-
version support for resolving a variable font's named instances by
PostScript name. Fonts are registered via `Info.plist`'s `UIAppFonts`
array (the same "merged custom Info.plist" mechanism already used for
Google Sign-In's `CFBundleURLTypes`) — no `project.yml` change needed,
since XcodeGen already treats non-Swift files under a `sources:` path
as Copy Bundle Resources.

`RootView` applies `.preferredColorScheme(theme.colorScheme)` around
the whole app (including `AuthView`, shown before sign-in) so SwiftUI's
own dynamic/system colors — navigation-bar titles, `ContentUnavailableView`,
segmented-Picker tint — resolve against the *active theme's*
light-or-dark-ness rather than the device's own system Dark Mode
setting. This is a real-bug fix, not speculative hardening: a Meadow-
only build (no `preferredColorScheme` override) shipped to TestFlight
and was illegible on a device in system Dark Mode — native chrome
flipped to light-on-dark text while the app's then-fixed-light palette
stayed put. Studio Ink is a genuinely dark theme by design (not "Meadow
following system dark mode"), so this same mechanism is what makes it
render correctly too, not just Meadow/Manuscript.

`SettingsView.swift` (new — the app had no settings screen before this)
is the in-app theme picker, reachable from a gear button on the Learn
tab. Picking a theme applies instantly (via `AlphonsoThemeManager`) and
syncs to `profiles.theme` in the background
(`ProgressSyncClient+Profile.swift`, new Kit extension) — a plain
PostgREST GET/PATCH, since `profiles` (unlike the gamification tables)
never had its direct-write grant revoked; RLS's `profiles_update_own`
policy is the same one the web's `updateProfile` server function relies
on. `restRequest` widened from `private` to `internal` in
`ProgressSyncClient.swift` so this extension file can call it, same
precedent as `ProgressSyncClient+Season.swift`'s earlier widening.

`AlphonsoComponents.swift` has the reusable button styles (the primary
one replicates `styles.css`'s `.hard-shadow` pressed effect),
card/badge/progress-bar/empty-state views, `SpringEntrance` (promoted
out of `LessonPlayerView`'s original private copy), and
`alphonsoInputBackground()` (parchment fill + a visible hairline
border, applied to every text-input field app-wide — added after a
real device showed parchment-on-surface alone was too subtle to read as
an input field). Still deliberately deferred: no in-app light/dark
override independent of the chosen theme, and no grain-texture effect
(no trivial SwiftUI equivalent to the CSS `feTurbulence` noise).

**Liveliness pass + mascots** (2026-09-22, direct real-device feedback
after the theme system shipped): `CoursePicker` (`AlphonsoComponents.swift`)
replaced a duplicated `Picker` in both `LessonBrowserView` and
`ReviewQueueView` that used full course names ("English"/"Français"/
"Español") in `.segmented` style — with no room to spare in the toolbar,
this truncated to a single indistinguishable letter each on a real
device. Now flag + 2-letter code (2026-09-22 correction: flag+code alone
still wasn't enough -- `.segmented` itself is too narrow a control for a
`.topBarLeading` slot competing with a large `navigationTitle`, clipping
even the compact labels to unreadable slivers on a real device; switched
to `.pickerStyle(.menu)`, which only ever renders one selection plus a
chevron in the toolbar). `StatusHeaderView.swift` (new) shows
streak/hearts/XP/league tier at the top of the Learn tab — reads
`SyncQueueStore`'s already-cached last-known progress, no new network
call — with a continuously pulsing flame (`PulsingGlow` modifier,
`AlphonsoComponents.swift`) as the one element that's always quietly
animating rather than only reacting to a tap. `AlphonsoPrimaryButtonStyle`
moved from a flat fill to a subtle top-to-bottom gradient. Lesson and
leaderboard rows use `.springEntrance` with a small index-based delay so
they cascade in as they scroll into view (`List` is lazy — each row's
own `onAppear` fires independently, so this doesn't animate an entire
long list at once).

Two named personas (**Alphonso**, the app's own namesake/host;
**Hector**, the Pro AI tutor) had zero visual form anywhere in the app
or its docs before this — confirmed by search, not assumed
(`LESSON_ASSETS.md`'s own status banner says its image/character section
was never built). The user generated real character portraits for both
and provided them directly; both cropped to tight face/shoulders avatars
and compressed for bundle size (`Assets.xcassets`'
`Alphonso.imageset`/`Hector.imageset` — originals were 1.1MB/6.6MB,
now ~470KB/~750KB). **Alphonso does wrong-answer help**: a new
`AlphonsoTipCard` (his portrait + "Alphonso says" + the question's
explanation) slides in from the trailing edge on a wrong answer, via a
shared `ExplanationView` (`question`/`picked` in, a plain caption for a
correct answer vs `AlphonsoTipCard` for a wrong one out) so every
question-type call site across `LessonPlayerView`'s `QuestionCard`/
`GeneratedPracticeSection` and `ReviewQueueView`'s `ReviewQuestionCard`
shares one decision point. **Deliberately Alphonso, not Hector, for
this** — Hector is a $9.99/mo persona; giving him away for free in the
ordinary lesson/review flow would undercut the subscription. Hector
instead gets real presence in his own paid screen: his portrait on
Hector's sign-in step, a small avatar beside his chat bubbles during
conversation. Alphonso also now greets the user on the app's own
sign-in screen (`AuthView`), replacing the generic SF Symbol icon the
liveliness pass had used there. `QuestionCard`/`ReviewQuestionCard`'s
`body` (a bare `switch` before this) is now wrapped in `Group { switch
... }` so `.animation(value: checked)` can drive the slide-in transition
— without an explicit animation tied to that state change, the card
would just pop in instead of animating.

**`AlphonsoTipCard` redesign** (2026-09-22, same day): the user sent a
mockup showing Alphonso larger and speaking through a real speech
bubble rather than the original small circular-avatar-in-a-card design,
and asked for exactly one version, not both. New `SpeechBubbleShape` (a
real `Shape` — rounded rect + a tail pointing at the portrait, not a
plain box); portrait grew from a 52pt circle to an 88×112pt rounded
rectangle. Deliberately kept in-flow (same `VStack` as the Check/
Continue button below it, never an absolute overlay) specifically
because the user's own mockup had Alphonso's cape covering the Check
button — this can't repeat that regardless of portrait size. The
card's public API (`explanation:` only) didn't change, so no call site
needed touching.

**Canopy theme (2026-09-23)**: a fourth, iOS-only theme — emerald/coral,
mascot-forward — added as the new default for installs/accounts with no
saved theme preference, following direct feedback ("too much like a
book and wordish") that the original three themes' serif-display
pattern and a real usage gap (mascot art bundled but barely used, e.g.
`PaywallView` was an SF Symbol and plain text) read as generic and
lifeless. Meadow/Studio Ink/Manuscript are unchanged. New shared
components: `AlphonsoMascotBanner` (mascot portrait + message on a
`moss`→`mossDeep` gradient) and `AlphonsoRowCard` (replaces plain
`List` text rows). Two new per-theme tokens, `onPrimary`/`onAccent`,
fix a real contrast bug (Canopy's bright coral `ember` fails WCAG with
light text); a third, `onMossGradient`, fixes a second one found in
review (Studio Ink's `moss`/`mossDeep` are medium-bright, not dark, so
`onPrimary` — correct for its solid-fill button — drops to 2.16:1
against `mossDeep` in the new banner's two-stop gradient). Full design:
`docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md`.

See `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` for the
original design (note: that doc's plan to reuse Cloud Voice for *all* AI
conversation, and its V2 deferral of hearts/streak-freezes, were both
superseded in practice — see this file's git history / session
decisions rather than trusting that doc's roadmap section as current).

## AI integrations

- **Chat:** NVIDIA NIM (`integrate.api.nvidia.com`, OpenAI-compatible),
  model configurable via `NVIDIA_CHAT_MODEL` — `src/routes/api/chat.ts`
- **TTS/STT:** Deepgram directly (Aura-2 / Nova-3) —
  `src/routes/api/tts.ts`, `src/routes/api/stt.ts`
- **Weakness detection:** `src/routes/api/analyze-weaknesses.ts`
  (iOS-only caller — see "Native iOS app" below) sends a Hector/free
  conversation transcript to NVIDIA NIM with a prompt constrained to a
  fixed 15-category taxonomy (`past-tense`, `articles`, `prepositions`,
  `subject-verb-agreement`, `plurals`, `question-formation`,
  `modal-verbs`, `word-order`, `pronouns`, `comparatives`,
  `conditionals`, `phrasal-verbs`, `negation`, `vocabulary-choice`,
  `spelling`), defensively parses the response (no structured-output
  mode assumed — strip code fences, `JSON.parse`, zod-validate, empty
  array on any failure), dedupes against the caller's existing
  not-yet-retired weakness items by category, and inserts survivors
  into `review_items`. No dedicated unit tests exist for this route (7%
  coverage — see `AGENTS.md`'s Testing section) or the two web routes it
  parallels (`api/chat.ts`/Edge Functions) — verified via
  `lint-and-typecheck`/`e2e` CI plus manual smoke-testing, same as
  those.
- All three chat/tts/stt endpoints (weakness-detection reuses the
  `"chat"` quota bucket rather than adding a fourth) are gated by
  `consumeQuota` (`src/lib/ai-quota.server.ts`): per-minute rate limit
  checked first, then the daily quota RPC.

## Known rough edges

(A full audit is kept locally, gitignored, not in this repo — see the
note in README.md's Documentation section for why.)

- **A custom SwiftUI color palette that doesn't set `.preferredColorScheme`
  will look broken on a device in system Dark Mode, even if every color
  is a fixed/explicit value.** Found for real on TestFlight (2026-09-22):
  the iOS design system's Meadow palette (`AlphonsoColor`, all fixed
  hex values, not adaptive) shipped without a `.preferredColorScheme`
  override. On a device in Dark Mode, every *system*-styled element this
  app didn't explicitly restyle (`.navigationTitle` text,
  `ContentUnavailableView`'s icon/title, segmented-Picker chrome) still
  resolves its color against the *device's* Dark Mode setting via
  SwiftUI's dynamic/semantic colors (`.primary`, etc.) — so those
  elements rendered light-colored text, while this app's fixed-light
  background colors stayed put, making titles and empty states
  unreadable. Fixed by applying `.preferredColorScheme(theme.colorScheme)`
  at the app root (`RootView`) — this pins every dynamic system color to
  resolve against the *chosen theme's* light-or-dark-ness instead of the
  device's setting. Generalizes beyond Meadow: Studio Ink is
  legitimately a dark theme (see "Design system" above), and this same
  mechanism is what makes its dynamic system colors resolve correctly
  too, not a special case.
- **SwiftUI `Section { content } header: { header }` silently misparses
  if the content closure is missing its own closing brace** — found
  twice while restyling every screen for the design-system pass
  (2026-09-22). When a `Section`'s sole content is a bare
  `ForEach(...) { ... }` with no wrapping `if`/`else`, it's easy to
  write only one closing brace before `header:` instead of two (one for
  `ForEach`, one for `Section`'s own content closure) — Swift then
  parses `header:` as a second trailing closure on `ForEach` itself
  ("extra trailing closure passed in call"), not on `Section`. This
  compiles as an ordinary Swift file — `swift -frontend -parse` (the
  only syntax check available without local Xcode/macOS) doesn't catch
  it, since it's a semantic overload-resolution error, not a syntax
  error; only a real `ios-app-build` CI run surfaces it. Safest fix when
  a `Section`'s content is a bare `ForEach`: assign the `ForEach` to a
  `let` constant first and reference it by name inside `Section`'s
  content closure (see `DuelsView.swift`'s `pendingSection`/
  `pastDuelsSection`) — that leaves no nested unclosed brace for
  `header:` to misattach to, rather than relying on getting the
  indentation/brace-count exactly right by eye.
- **Found 2026-09-21, mid-fix: this Supabase project's auth emails were
  never usable for real (non-team) users, and iOS's OTP sign-in never
  actually showed a code.** Two compounding issues, found while
  investigating "the app asks for a 6-digit code but the email I get is
  a login link (which doesn't load)": (1) the project was still on
  Supabase's built-in mailer (`noreply@mail.app.supabase.io`, confirmed
  via `mail_type:"magic_link"` in the auth logs) — per Supabase's own
  docs, that mailer **refuses to deliver to any address outside the
  project's own organization team**, so no real end user (web or iOS —
  same Supabase Auth instance, same mailer, for both) could receive any
  auth email at all until custom SMTP is configured; (2) iOS's OTP flow
  (`SupabaseAuthClient.requestEmailOTP`, `POST /auth/v1/otp`) shares
  Supabase's single "Magic Link" template with every OTP request, and
  that template ships showing only a clickable link, never the raw
  `{{ .Token }}` code the iOS UI asks the user to type in — so even a
  successfully-delivered email was the wrong shape for iOS's flow.
  `scripts/configure-custom-smtp.ts` (Resend) and `scripts/
  update-auth-email-template.ts` fix these via the Supabase Management
  API directly (no CLI/MCP wrapper exists for either setting), runnable
  via the `configure-auth-emails.yml` workflow. Also surfaced a real
  scope gap, not a regression: iOS has no Google OAuth at all —
  `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` scoped
  iOS auth as "the existing web app's auth pattern, ported," but the web
  app actually uses password + Google OAuth, never OTP; iOS's OTP-only
  design was built on that incorrect premise and Google was simply never
  added.
- `src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts}`
  carry "auto-generated, do not edit" banners from the Lovable Supabase
  connection tool and duplicate a `createSupabaseFetch` helper 3 ways;
  consolidating them risks a future regeneration reverting the change (see
  `src/integrations/supabase/fetch.ts`'s comment for the one file that was
  safe to consolidate).
- `bun run dev` still doesn't boot in the Windows sandbox this has been
  developed in, so nothing UI-level has been visually verified there —
  `bun run build` does work now, though (the Windows path-separator bug
  was in `@lovable.dev/mcp-js`'s Vite plugin, removed along with the MCP
  feature this repo used to expose at `/mcp`).
- **Fixed 2026-09-20: Supabase migrations and Edge Functions now auto-deploy
  on push to `main`** via the `deploy-supabase` job in
  `.github/workflows/ci.yml` — previously every file in
  `supabase/migrations/` needed a manual `supabase db push`, and every
  `supabase/functions/` change needed its own manual `supabase functions
  deploy`, both easy to forget (this bit a real session that added several
  migrations in one sitting). The CI job needs `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, and `LESSON_SESSION_SECRET` set as repo secrets
  (see the job's own comment) — if those lapse or the job is disabled, the
  manual `supabase db push`/`supabase functions deploy` path (or the
  dashboard SQL editor / Supabase MCP `apply_migration`) is still the
  fallback, and the same "feature works in code but 500s in prod" symptom
  is the tell that it has lapsed.
- **`scripts/export-ios-content.ts` was manual; CI-enforced since
  2026-09-24.** Both it and `scripts/seed-curriculum-db.ts` used to be
  "someone has to remember to run this" — the exact class of gap
  `deploy-supabase` was created to close for migrations/functions above —
  and it bit for real during V3 package 4a: package 2's expanded
  achievement catalog (18 -> 24) shipped to web and prod's
  curriculum-data tables, but nobody re-ran `export-ios-content.ts`, so
  the iOS-bundled `achievements.json` (and a Kit test asserting its
  count) silently stayed at 18 until it was caught while regenerating for
  pkg 4a's new question formats.
  `seed-curriculum-db.ts` got a CI step first (`deploy-supabase` job,
  no-ops without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). This entry
  used to argue that `export-ios-content.ts` *couldn't* have one, because
  its output is committed JSON rather than a DB write — **that reasoning
  was wrong**, and the fix is the standard generated-artifact pattern:
  `ci.yml`'s "Bundled iOS content is up to date" step regenerates and
  fails on any diff. A forgotten re-export now breaks the PR instead of
  silently shipping stale content. The fix when it fails is always to run
  the script and commit the result, never to hand-edit the JSON.
  The script's own documented invocation was also wrong until the same
  date — it said `node_modules/.bin/tsx …`, but `tsx` is not and never
  has been a dependency here. Use `bun scripts/export-ios-content.ts`.
- **A new Edge Function directory needs its own `deno.json` import map**,
  and until 2026-09-24 nothing caught a missing one until the real
  deploy — found 2026-09-22 shipping `get-season-status`. `deno check`
  and `deno test` both pass without it (they resolve `npm:`/bare
  specifiers differently), but `supabase functions deploy` (the Supabase
  CLI's own bundler, used by the `deploy-supabase` job) fails with
  `Relative import path "@supabase/supabase-js" not prefixed with / or
  ./ or ../`. The fix is a `deno.json` with
  `{"imports": {"@supabase/supabase-js": "npm:@supabase/supabase-js@2"}}`,
  matching every sibling function directory — copy one of theirs when
  creating a new Edge Function.
  **CI-enforced since 2026-09-24**: the deno-tests job checks that every
  `supabase/functions/*/` directory except `_shared` has a `deno.json`.
  This mattered more than it looks: `deploy-supabase` runs on `main`
  *after* merge, so a missing import map used to break `main` rather than
  the PR that introduced it.
- **`eslint .` used to lint every other branch's code** (fixed 2026-09-24,
  PR #85). `.claude/worktrees/` holds full checkouts of other branches
  physically nested inside this repo, and the root ESLint config never
  ignored them, so `bun run lint` walked into all 15 of them: 3,632
  reported problems, of which 3,630 came from other branches and 2 were
  real. Fixed by adding `.claude/worktrees/**` to the `ignores` list in
  `eslint.config.js` rather than by deleting worktrees, so a future one
  can't reintroduce it.
  **The more important half of this**: CI never saw that noise (it lints
  a clean checkout), but it *was* failing on one of the two real
  findings — a `prettier/prettier` break in
  `scripts/upload-review-screenshot.ts`, introduced in `566b71c`. That
  quietly red-X'd `lint-and-typecheck` on **every open PR** until PR #84
  happened to carry the fix. Worth remembering as a diagnostic pattern:
  when several unrelated PRs fail the same check, suspect `main` before
  suspecting the PRs. The remaining live-tree finding is a long-standing
  harmless `react-refresh/only-export-components` warning in
  `CookieConsent.tsx`, deliberately left alone.
- **`src/integrations/supabase/types.ts` is stale** — found 2026-09-23.
  Seven tables added by the gamification/push batches
  (`challenge_completions`, `device_tokens`, `duel_queue`,
  `season_cohort_members`, `season_placements`, `team_members`, `teams`)
  were never regenerated into it, so `supabase.from()`'s literal-union
  parameter rejects real, existing table names and any typed query
  against them fails to compile. Worked around locally in
  `account.functions.ts` with a widened `from` helper; the real fix is
  regenerating the file against the live project, which needs the
  Supabase CLI and credentials this sandbox doesn't have. Until then,
  assume the generated types under-describe the schema rather than
  trusting them as complete.
- `account.functions.ts`'s GDPR table lists drifted a **fourth** time and
  are now enforced by a test (2026-09-23). The earlier three bugs (wrong
  table name, wrong filter column for `profiles`, two missing tables) were
  each silent because neither handler checks query errors; the fourth was
  the whole gamification + push batch — 9 user-scoped tables added by PRs
  #59/#64–67 that `exportMyData` never exported, so every "download my
  data" file had been incomplete since those landed. Account *deletion*
  was unaffected: all 9 are `ON DELETE CASCADE` from `auth.users`, so
  `deleteUser()` always cleaned them up.
  The list is now split in two, because the two handlers genuinely need
  different sets: `USER_ID_EXPORT_TABLES` (every table with a `user_id`
  column) plus `OTHER_OWNED_EXPORT_TABLES` (`nudges`/`duels`, user-owned
  but keyed by `sender_id`/`challenger_id`/etc., so a `user_id` scan can
  never reach them) for export, and `USER_DELETE_TABLES` for deletion —
  deliberately only the tables `authenticated` actually holds a DELETE
  grant on, since the gamification tables revoked direct writes
  (`20260920050000_revoke_direct_gamification_writes.sql`) and widening it
  would only add silently-failing requests. `account.functions.test.ts`
  now parses `supabase/migrations/` and fails the build when a new
  user-scoped table isn't covered, so this can't silently rot a fifth
  time. Its scan assumes no migration adds `user_id` via `ALTER TABLE`
  and none drops a table — both true when written, re-check if it ever
  starts under-reporting.
- App Store upload validation (error 90474) rejects an archive whose
  `UISupportedInterfaceOrientations` declares fewer than all four
  orientations, even for an iPhone-only (`TARGETED_DEVICE_FAMILY=1`)
  app — found via a real failed `ios-release.yml` upload, fixed in
  `ios/LearnWithAlphonso/project.yml`. Worth knowing if a future Info.plist
  change reintroduces a narrower orientation list.
- Cloud Voice's Supabase project (`ywavjlmjbxuslbxactsx`, Hector's
  separate account system) auto-paused once already this project's
  lifetime — Supabase free-tier inactivity pausing. If Hector sign-in
  fails with a connection error, check that project's status
  (`mcp__claude_ai_Supabase__get_project`) before assuming a code bug.
- **Offline-first (iOS) has two known, deliberately-unsolved edge cases**
  (see `docs/v2-kickoffs/01-offline-first.md` for the full design):
  concurrent-device review grading, and streak continuity across an
  offline gap. If a queued-offline review grade is replayed against
  `grade-review` after the same item was already graded on another
  device (online) in the meantime, it applies on top of stale SM-2 state
  — single-device usage (the overwhelming common case, since there's only
  ever one local queue) has no such issue. Separately, `complete-lesson`
  derives the completion date from the sync's *execution* time, not when
  the lesson was actually played offline — a lesson played on day N but
  synced on day N+1 records as completed on day N+1, which can break a
  streak the user was relying on that lesson to keep alive. Neither is
  solved by heavier machinery (vector clocks, a client-submitted-date
  trust exception) preemptively; revisit only if real usage shows either
  is a frequent complaint.
- **Vercel's GitHub integration lost this repo across the org transfer,
  then was reconnected and fully confirmed the same day (2026-09-20)**
  — (personal account → `obsidian-media`, transfer done to fix a GitHub
  Actions billing block). Between the transfer and the reconnect, every
  merge to `main` since PR #49 (leaderboards base) went undeployed
  until a manual `vercel deploy --prod` catch-up. **Fully confirmed
  working, both ways, same day**: the Vercel project's git link shows
  `org: "obsidian-media", repo: "LearnWithAlphonso"`
  (`mcp__plugin_vercel_vercel__get_git_deployment_context`); a real
  git-sourced deployment built and went `READY`; and — the real
  end-to-end test — a plain `git push` to `main` (no manual trigger)
  produced a new deployment with `source: "git"` on its own within
  ~90 seconds, proving the webhook itself fires correctly, not just
  that Vercel *can* pull from the repo when asked. Auto-deploy-on-push
  is genuinely restored. `.vercelignore` (added the same day, still
  relevant for any future manual CLI deploy as a fallback) scopes what
  gets uploaded — without it, a deploy from this local machine picks
  up unrelated `.claude/worktrees/` content from other parallel
  sessions (hit a real mid-upload failure
  this way, a file vanished from a live worktree during upload).
- **Test coverage was near-zero before 2026-09-20's PR #46** — now 502
  tests across 72 files, ~91% line / ~90% statement coverage (`bun run
  test:coverage`, see `AGENTS.md`'s Testing section for the full
  per-file breakdown and what's still thin: `HeartsModal.tsx` ~70%,
  `__root.tsx` ~18%, `analyze-weaknesses.ts` ~8% — server routes this
  codebase doesn't unit-test as a matter of established pattern, not an
  oversight).
- **Nudge-a-friend (iOS) is deliberately the weaker V2 approach, not the
  finished feature** — a `nudges` table (`supabase/migrations/
  20260920020000_nudges.sql`) the recipient's app polls for on foreground/
  screen-appear, not real push. A nudge only surfaces once the recipient
  next opens the Friends tab, which the kickoff doc (`docs/v2-kickoffs/
  04-friends-and-social.md`) flagged as largely defeating the point of a
  "nudge" (reaching someone who *hasn't* opened the app). Built anyway per
  explicit direction, with this note as the promised V3 follow-up marker.
  A real V3 version needs: an APNs Auth Key (Apple Developer Console →
  Keys), a `device_tokens` table (RLS-scoped to `auth.uid()`), device-token
  registration on app launch requesting *remote* notification permission
  (a materially different flow than this app's existing local-only
  `NotificationScheduler`), and a server-side trigger — Supabase has no
  built-in cron for Edge Functions as of this note; verify current
  capabilities before assuming `pg_cron` + a `SECURITY DEFINER` function
  is the only path. The same infrastructure would also serve
  leaderboards' "you've been overtaken" feature (currently an in-app
  toast, same reasoning) if that's ever upgraded to real push too — worth
  building once for both rather than twice.
- **`pickDistractors`/`packQuestions` (content-pack question generation)
  is duplicated verbatim in both `src/data/lesson-bank.ts` (English) and
  `src/data/bank-engine.ts` (the shared engine French/Spanish import) —
  English predates the shared engine and was never consolidated onto
  it.** Found live 2026-09-22 while fixing a real bug in this logic
  (case-sensitive distractor deduping let a cloze pack reusing the same
  word for two differently-capitalized lines surface both casings as
  separate, visually-duplicate multiple-choice options — see
  `src/data/curriculum-consistency.test.ts`, added the same day as a
  standing automated scan against this whole class of content bug). The
  fix had to be applied identically in both files; a future fix to this
  logic that only touches one copy will silently miss the other.
  Consolidating English onto `bank-engine.ts` wasn't done as part of
  that fix — it changes core content-generation code that all users'
  review-item ids are keyed against (`lessonId:questionId`), so it needs
  its own careful pass confirming lesson/unit id output is byte-for-byte
  identical before/after, not a rider on an unrelated bug fix.
- **`bun run vitest run` (the full ~90-file suite, one isolated worker
  per file) can hang indefinitely with zero output in this project's
  Windows development sandbox, after a long agent session has
  accumulated enough lingering `bun.exe`/`node.exe` processes.** Hit
  repeatedly 2026-09-22 (multiple 10-20+ minute hangs across two
  separate sessions, each confirmed via `tasklist | grep -i bun` showing
  8-9+ stale processes at the time). Not a code defect — a *scoped* run
  (`bun run vitest run <specific files/dirs>`) against the exact same
  code consistently completes in seconds. If the full suite hangs,
  don't assume a real regression: scope to the changed files first, and
  treat a genuinely-needed full-suite confirmation as something to run
  in a fresh session/shell rather than deep into a long one.
