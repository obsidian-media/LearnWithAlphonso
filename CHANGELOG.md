# Changelog

Versioned history of Learn with Alphonso (repo internal name
`english-buddy-app-33`). Grouped by milestone, not strictly one entry
per PR — see `gh pr list --state merged` or `git log` for the literal
commit-by-commit history. PR numbers are given for traceability; this
file itself won't be kept perfectly current — treat entries as a guide
to *when* something shipped, and re-check the actual code for *how it
works now*.

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
