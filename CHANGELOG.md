# Changelog

Versioned history of Learn with Alphonso (repo internal name
`english-buddy-app-33`). Grouped by milestone, not strictly one entry
per PR — see `gh pr list --state merged` or `git log` for the literal
commit-by-commit history. PR numbers are given for traceability; this
file itself won't be kept perfectly current — treat entries as a guide
to *when* something shipped, and re-check the actual code for *how it
works now*.

## V3 — Feature depth expansion (2026-09-20 – in progress)

Six-package initiative adding depth to existing features rather than new
surface area, sequenced by risk (self-contained/algorithmic first, the
largest product initiative in the middle, the most exploratory pieces
last): SRS scheduling, gamification engagement mechanics, conversation
experience, tutor/weakness system, curriculum formats, generative/adaptive
content.

**Smarter SRS scheduling** — two targeted, low-risk improvements to the
existing SM-2-style algorithm (not a full replacement — see
`src/lib/srs.ts`'s doc comments for why a novel stability-based model was
considered and deliberately not chosen): a lapse now halves repetitions
instead of resetting to zero, and a successful review well past its due
date grows the interval further (capped 1.5x), rewarding the real
spacing-effect finding from memory research. No schema change. Ported to
`supabase/functions/grade-review/srs.ts` (Deno) and
`ios/LearnWithAlphonsoKit/.../SRSEngine.swift` (Swift) with matching
parity tests in all three.

**Engagement mechanics** — four independent additions, all RPC-first from
day one (no direct-write debt like the original gamification tables had):
expanded achievement catalog (6 new diamond/gold tiers on existing
categories); `buy_streak_freeze_with_xp` RPC, mirroring the existing
hearts-purchase RPC, no cap unlike hearts; friend duels (`duels` table +
`create_duel`/`respond_to_duel`/`get_my_duels` RPCs, head-to-head XP
competition over a friend-accepted window, lazily resolved on read rather
than needing cron infrastructure this project doesn't have yet); weekly
quests (`weekly_quests` catalog + `user_weekly_quest_claims` +
`claim_weekly_quest` RPC, progress computed from already-durable
activity_days/lesson_completions data rather than a new counter). Caught
and fixed a real trust-boundary bug in review during this package's own
build: an early draft of `claim_weekly_quest` took metric/target/xp_reward
as caller-supplied RPC parameters, which would have let any caller invoke
it directly via PostgREST with an arbitrary reward -- fixed before it
shipped by moving the catalog server-side. Web server functions + Kit
client methods shipped and tested on both platforms; new UI surfacing
(making these reachable in the actual app, not just callable) is the
immediate next fast-follow, same "backend/client-method complete, UI
wiring follows" precedent this codebase already established for
`acceptFriendInvite`.

**Conversation experience** — three additions to the free-conversation
roleplay feature (web `/converse` and iOS's free mode; Hector/Pro is
untouched except a compile fix for a shared client method's changed
signature): 6 new scenarios (12 total, added a couple of Advanced-level
ones -- salary negotiation, friendly debate -- since all 6 originals were
Beginner/Intermediate); adaptive difficulty (`/api/chat` now takes an
optional `cefrLevel` and appends a vocabulary/complexity hint to the
scenario's system prompt -- a prompt-shaping hint, not a trust boundary,
so client-supplied without validation); pronunciation feedback via a
heuristic, not real phoneme scoring (Deepgram's own utterance-level STT
confidence, already present in the `/api/stt` response, surfaced as a
clear/okay/unclear badge -- zero new vendor, zero new cost). iOS had no
way to read a user's own current CEFR level at all before this --
`ProgressSyncClient.fetchCefrLevel` (a plain RLS-scoped read) is a small
new addition specifically to unlock adaptive difficulty there too.

**Tutor & weakness system (in progress)** — a weakness trend log
(`weakness_events`: 'detected'/'resolved' rows, plain RLS insert/select-own
since it's a non-value-bearing signal, not RPC-gated) now records every
time `/api/analyze-weaknesses` classifies a gap and every time a
weakness-sourced review item retires (mirrored in both
`review.functions.ts`'s `gradeReview` and the `grade-review` Edge
Function). The NVIDIA classification + parsing logic used by
`analyze-weaknesses` was extracted into a shared
`src/lib/weakness-detection.server.ts` module so a second call site could
reuse it without duplicating the taxonomy/prompt/Zod-parsing; that second
call site is new: `completeLessonRemote` now also runs weakness detection
directly against a lesson's own missed questions (previously this only
ran from free-conversation transcripts), so a learner gets weakness
tracking from graded lesson mistakes even if they never use `/converse`.
Best-effort and fully isolated behind a try/catch — a classification
failure never fails the lesson-completion response. Caught and fixed a
real, pre-existing production bug while exploring this area:
`analyze-weaknesses.ts`'s insert into `review_items` never included
`user_id` (a NOT NULL column with no default), meaning the route had
likely never successfully written a row in production; it also had zero
test coverage, which is how that went unnoticed. Fixed with proper
`user_id` resolution + `supabaseAdmin`, and given 7 new tests. A
weakness-trend read now surfaces that log: `getWeaknessTrend` aggregates
`weakness_events` into per-category detected/resolved counts, shown as a
"Weakness trend" section on web's `/profile` (still-working-on-it vs.
mastered) and iOS's Achievements screen (`ProgressSyncClient.
fetchWeaknessTrend`), with matching test coverage on both platforms. No
`course` param anywhere in this pipeline: weakness detection itself is
English-only today (`analyze-weaknesses.ts` hardcodes `language: "en"`),
so there's nothing to filter by yet. Tutor persona memory (Hector) is
also live: `TutorMemoryContext.buildPrimingMessage` (Kit, pure/tested)
turns a learner's current CEFR level + open weakness categories into one
priming history entry, prepended to every `TutorConversationClient.
respond()` call in `HectorView.swift` but never appended to the visible
`turns` transcript itself. This is *not* Hector recalling actual past
conversation -- that transcript lives entirely on AlphonsoEcosystem's
Cloud Voice backend, which this repo can't read (see the Hector
weakness-detection design doc's "what this does NOT change" section);
it's durable facts this repo already tracks, replayed as continuity each
new session. Proactive tutor nudges close out the package: a new
`weakness-practice-nudge` local notification kind (`NotificationLogic.
swift`'s `weaknessPracticeNudgeCopy`/`nextWeaknessPracticeNudgeDate`,
same pure-logic-in-the-Kit split as the existing streak/due-review/
weekly-recap nudges), scheduled from `AchievementsView.load()` reusing
its existing weakness-trend fetch -- no second network round trip, same
precedent as the due-review nudge reusing `ReviewQueueView`'s fetch.
Fires at a fixed 10am (distinct from the streak reminder's 8pm and the
due-review nudge's fixed hours-out, so the three kinds don't compete for
the same moment), named for the single most-open category to stay
concrete rather than a generic nag, and cancelled automatically once no
category is open. This closes out package 3b (tutor & weakness system);
curriculum formats and generative/adaptive content (packages 4a/4b)
remain.

**Curriculum formats** — two new question formats layered
onto the existing `mc` type rather than new discriminated cases (`imageKey`
shows a stock photo above the prompt for "image matching"; `audioText`
speaks via on-device TTS -- `src/lib/speech.ts` on web, `AVSpeechSynthesizer`
on iOS -- for "listening comprehension"; zero new grading/regrade logic
either way, since both are still plain `mc` questions underneath), plus a
genuinely new `reorder` type (tap a shuffled word pool into the correct
sentence order) with its own grading branch mirrored across
`srs.ts`/`bank-engine.ts`/`review.tsx`/`lesson.$id.tsx` and their iOS Kit
equivalents (`CurriculumModels.Question.Reorder`, `QuestionGrading.swift`,
`LessonPlayerView`/`ReviewQueueView`'s tap-to-assemble UI). A new migration
widens the curriculum-data tables' `question_shape_matches_type` CHECK to
accept `reorder` (same row shape as `fill`: `bank` holds the token pool,
`answer_text` the correct sentence) -- `grade-review`'s Deno function
needed no code change, since it already treats any non-`mc` row as a plain
text comparison. Three example questions (one of each new format) added to
the real `u1l2` lesson to exercise this live, both in tests and in prod.
Also added a `deploy-supabase` CI step that runs `scripts/
seed-curriculum-db.ts` automatically (no-ops until `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` repo secrets are added -- see that job's
comment), closing the same class of "manual script, easy to forget" gap
that already motivated the job's migration/function auto-deploy. Caught a
real instance of exactly that gap while regenerating `scripts/
export-ios-content.ts`'s bundled JSON for this work: package 2's
18->24 achievement catalog expansion, *and* package 3a's 6 new
conversation scenarios, had never been re-exported -- iOS had silently
been stuck on 18 achievements and the original 6 scenarios (missing
hotel/directions/apartment/returns/negotiation/debate entirely) since
those packages shipped. Fixed, and documented in ARCHITECTURE.md's "Known
rough edges" since `export-ios-content.ts` still has no equivalent
automated step (its output is committed JSON, not a DB write, so it can't
be a silent CI step the same way). Closes with the French course's
lesson-count gap: 75 new content packs (15 per CEFR level, A1-C1) added to
`lesson-bank-fr.ts` in the same compact pair/cloze format as the existing
25, taking French from 125 to exactly 500 lessons -- matching English's
534-lesson depth for the first time. New topics per level: A1 gets
everyday-life vocabulary (body parts, house, jobs, food service, tech,
transport, etc); A2 moves into applied grammar in context (reflexive
verbs, near future, negation, question formation) alongside more
vocabulary; B1-B2 add intermediate/upper-intermediate grammar (relative
pronouns, object pronouns, y/en, passive voice, plus-que-parfait,
conditionnel passé, the causative, double object pronouns) and register-
specific vocabulary (politics, law, economy, arts); C1 adds literary and
formal register (passé simple recognition, subjunctive past, false
friends, register shifts, academic writing phrases, nuanced modal
expressions). No new question types were needed -- all 75 packs reuse the
existing pair/cloze pack engine, which already auto-generates mc/fill
questions with distractors and shuffling. This closes out package 4a.

## V2 — Native iOS feature expansion (2026-09-19 – 2026-09-20)

Built as a batch of independent, parallel-safe feature slices against
the already-shipped V1 iOS app, following kickoff docs in
`docs/v2-kickoffs/` (gitignored, local-only — the pattern is
preserved for `docs/v3-kickoffs/`, see below).

**Design docs** (#47) — `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`
follow-ups scoped as five parallel-safe V2 slices, plus two decision
docs (offline-first, Hector weakness-detection) needing more thought
before implementation.

**Base features batch** (#48–#52, one PR each): local notification
scheduling infrastructure; leaderboards screen (global/friends/country,
weekly/all-time via the existing `get_leaderboard` RPC); friends screen
(invite-link based, via `get_friends_progress`); achievements/leagues
browse screen with unlock celebrations; vocab stock-photo images in the
lesson overview.

**Offline-first** (#53) — lesson completion and review grading both
queue locally (SwiftData: `PendingLessonCompletionRecord`,
`PendingReviewGradeRecord`, `CachedDueReviewRecord`) and sync when
connectivity returns (`NetworkMonitor`). The drain logic itself
(`SyncEngine.swift`) lives in the Kit, not the app target, specifically
to stay Windows-testable. Two known, deliberately-unsolved edge cases
(concurrent-device grading, offline streak-continuity) — see
`ARCHITECTURE.md`.

**Leaderboards + friends, deepened** (#54) — overtake detection (in-app
toast) and a weekly recap sheet for leaderboards; an activity feed
(`friend_activity_events`, written by `complete-lesson`) and
nudge-a-friend (`nudges` table, deliberately the weaker polling-based
V2 version, not real push) for friends. Extracted a shared `ToastBanner`
after noticing the overtake toast and nudge banner were near-duplicates.

**Hector/free-conversation weakness detection** (#55) — after either
AI-conversation mode ends (4+ turns), NVIDIA NIM identifies up to 3
weaknesses from a fixed taxonomy and inserts them as gradable
multiple-choice `review_items` rows (`source` column discriminates
lesson-derived vs. synthetic weakness items). New `/api/analyze-weaknesses`
TanStack Start route (deliberately not a fourth Edge Function).
`grade-review` and its web mirror (`review.functions.ts`) both branch
on `source`; the web `/review` page renders weakness items too (a gap
found and fixed mid-implementation — without it, a weakness item would
have been an invisible-but-still-due phantom on web).

**Test coverage** (#46) — from near-zero to 502 tests across 72 files
(data layer, lib utilities, components, hooks, Supabase integration,
route components), 90.55% statement / 91.56% line coverage. Added
`vitest.setup.ts` (React Testing Library + jsdom).

**Infrastructure fixes made along the way:**
- Repo transferred from a personal GitHub account to the `obsidian-media`
  org (fixed a GitHub Actions billing block) — broke Vercel's GitHub
  integration in the process; still needs manual reconnection (see
  `ARCHITECTURE.md`'s "Known rough edges").
- Manual Vercel production deploy (2026-09-20) to catch production up
  on everything merged since PR #49, which had gone undeployed. Added
  `.vercelignore`.
- `review_items` schema extended with `source`/`weakness_label`/
  `weakness_display`/`prompt`/`choices`/`answer_index`/`explanation`
  columns (migration `20260920040000`).

## V2 kickoff (2026-09-17 – 2026-09-19)

**Native iOS app, ground-up build** (#24, #27–#45): design spec, curriculum
DB schema + seed script, `complete-lesson`/`start-lesson-session`/
`grade-review` Edge Functions, app scaffold, lesson player (overview →
vocab → quiz → finish), SM-2 review queue, two AI-conversation modes
(free via this repo's own `/api/chat`/`/api/tts`/`/api/stt`, and Pro
"Hector" via AlphonsoCompanion's Cloud Voice + RevenueCat gating), app
icon, CI (`ios-app-build`, `ios-swift-tests`), signed release pipeline
with an optional TestFlight upload step, App Store orientation-
validation fix, `SupabaseSession.userID`.

## V1 — Web app (through 2026-09-18)

- **Lovable decoupling** (#1): moved off Lovable-hosted AI gateway/tooling
  — AI calls go straight to NVIDIA NIM/Deepgram, deploy targets Vercel
  directly.
- **Content buildout** (#3–#9, #14, #18, #21, #23): full 5-CEFR-level
  English curriculum (534 lessons), vocab-card images for 1,161+ terms
  (English + French), lesson-bank generator packs.
- **Rebrand** (#8, #10, #13, #20): Lingua → Alphonso across all
  user-facing text and the app icon.
- **French course** (#11, #12, #14, #16): full second course (125
  lessons across 5 levels), course switcher, course-aware SRS.
- **Placement test** (#15): randomized adaptive placement with seeded
  lesson-replay variation.
- **Friends v1** (#17): invite-link based friends feature.
- **Voice** (#19): TTS/STT swapped from OpenAI to Deepgram.
- **Themes** (#30, #33): 3 user-selectable themes (Meadow, Studio Ink,
  Manuscript).
- **Hardening** (#22, #29, #31, #34): security/a11y/testing-infra audit
  follow-up, hearts-economy fixes, gamification-table CHECK constraints,
  XP/hearts farming exploits closed.
- **Curriculum DB + iOS groundwork** (#24–#28): design spec and schema
  work that V2's native iOS app was built on top of.

## Phase 0 — Origins

Started as a Lovable-generated TanStack Start scaffold; Phase 1 (#1)
decoupled it from Lovable's hosted infrastructure while keeping the
generated code as the foundation. Everything above is original work on
top of that foundation.
