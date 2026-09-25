# Learn with Alphonso

A full-stack mobile-first English, French, and Spanish learning app with gamification, AI-powered conversation practice, and a spaced repetition review system — web app plus a native iOS app sharing the same backend/account.

> Decoupled from Lovable hosting/tooling (TASK-078) as far as this repo's
> code is concerned: AI calls go straight to NVIDIA/Deepgram (not a Lovable
> gateway), and deploy targets Vercel.
>
> Repo lives at `github.com/obsidian-media/LearnWithAlphonso` (transferred
> from a personal account to the `obsidian-media` org to fix a GitHub
> Actions billing block; the codebase's internal project name is still
> `english-buddy-app-33` in a few config/directory references — cosmetic
> only, not worth a mass rename). Vercel's own GitHub integration was
> not carried over by that transfer, then reconnected the same day
> (2026-09-20) — see "Deployment" below for what's confirmed vs. what
> still needs a real push to verify.

## Tech Stack

| Layer               | Technology                                                           |
| ------------------- | -------------------------------------------------------------------- |
| **Framework**       | TanStack Start (SSR) + React 19 + Vite 8                             |
| **Styling**         | Tailwind CSS v4 + hand-written components + Framer Motion            |
| **State**           | Zustand (client) + TanStack Query (server)                           |
| **Backend**         | Supabase (PostgreSQL + Auth + RLS + RPCs)                            |
| **AI**              | NVIDIA NIM (chat, direct) + Deepgram Aura-2/Nova-3 (TTS/STT, direct) |
| **Routing**         | TanStack Router (file-based)                                         |
| **Testing**         | Vitest (unit) + Playwright + axe-core (E2E/accessibility)            |
| **Package manager** | bun (`bun.lock` is authoritative; no `package-lock.json`)            |

See `ARCHITECTURE.md` for the full request flow, database schema, and design notes.

## Features

- **Listen** (web, Phase 1a — 2026-09-24): a browsable folder tree of short audio
  episodes with a persistent mini-player that survives navigation and resumes
  where you left off, across devices. Episodes are published by the account
  owner with `scripts/podcast-tool.ts` — either an MP3 you recorded or a script
  spoken by Deepgram — so the library grows without a deploy or an App Store
  release. **Not live yet**: the migration still has to be applied and the
  `podcast-audio` bucket created (see the spec's "Implementation status").
  Transcripts, comprehension questions, XP and SRS wiring are Phase 2; the iOS
  client is Phase 1b. See
  `docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`.
- **5 CEFR levels** per course, A1 (Beginner) → C1 (Advanced)
- **Three courses**: English, French, and Spanish, via a shared `getCourse()` content bundle
- **Spaced repetition**: SM-2 algorithm for long-term retention of missed items, with a due-count badge on the learn page
- **Placement test**: 15-question adaptive test to set starting level. In English it
  assesses multiple choice, listening and written translation — the same formats
  the course uses, so nobody is placed by an exam that tests something else.
  Speaking is deliberately excluded: it would require microphone permission during
  onboarding, and a denial would leave the question unanswerable
- **AI conversation**: voice-enabled chat with 6 scenarios
- **Gamification**: XP, streaks, streak freezes, hearts (regenerate over time, or earn back via a perfect lesson / a streak milestone / clearing the review queue / spending XP), leagues (Bronze → Diamond), achievements, friend duels + open/stranger duel matchmaking, weekly challenges, persistent teams (weekly-XP competition), and a season ladder (weekly promotion/demotion cohorts, separate from the permanent league)
- **Friends**: invite-link based, with a friends leaderboard scope; a `friend_activity_events` feed (lesson completions, streak milestones, league promotions) and nudge-a-friend, both iOS-only so far (see "Native iOS app" below)
- **Leaderboards**: global, friends, and country rankings; overtake detection and a weekly recap, both iOS-only so far
- **Themes**: 3 user-selectable themes on web (Meadow, Studio Ink, Manuscript — `/profile`), synced to the account and persisted locally
- **iOS navigation** (Phase 0, 2026-09-24): five tabs — **Learn · Listen · Practice ·
  Hector · Profile**. It was seven, and iPhone renders five before collapsing the rest
  into the system "More" list, so Achievements was already buried. League, Friends and
  Achievements now live behind **Profile**; the **review queue** is a row at the top of
  Learn with a due-count badge on the tab (Settings also keeps its gear on Learn).
  **Listen is a placeholder until Phase 1b** — no App Store release should ship between
  the two, or users get a tab that does nothing. See
  `docs/superpowers/specs/2026-09-24-podcast-phase0-ios-tabs-design.md`.
- **Native iOS app** (`ios/`): "Learn with Alphonso" — auth, lesson player, review queue, leaderboards, friends, achievements/leagues, push-notification-style local reminders, offline-first lesson completion/review grading, and AI-conversation weakness detection (Hector + free mode both feed the review queue). Has its own theme system (`ios/LearnWithAlphonso/Sources/DesignSystem/`) with 4 themes: the three web themes ported over (Meadow/Studio Ink/Manuscript — fonts, oklch-accurate palette, the hard-shadow pressed-button effect) plus a fourth, iOS-only "Canopy" theme (2026-09-23) not mirrored on web, applied across every screen, with an in-app picker (Settings, from the Learn tab) that syncs to the same `profiles.theme` the web app reads — see the "Native iOS app" section below and `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` (original 3-theme port) / `docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md` (Canopy)

## Content

Counted directly from the actual `curriculum`/`curriculumFr`/`curriculumEs`
bundles (see `AGENTS.md`'s Content Structure table for how/when this was
last verified — re-run the count rather than trusting a number here if
it's been a while). **Corrected 2026-09-22** — this table previously
still showed only English/French with French at its old 125-lesson
count; French and Spanish both grew to full parity with English this
session:

| Course      | A1  | A2  | B1  | B2  | C1  | Total lessons | Total questions |
| ----------- | --- | --- | --- | --- | --- | ------------- | --------------- |
| **English** | 137 | 119 | 119 | 117 | 117 | **609**       | 3,096           |
| **French**  | 110 | 110 | 110 | 110 | 110 | **550**       | 2,750           |
| **Spanish** | 100 | 101 | 104 | 102 | 101 | **508**       | 2,540           |

English pulled ahead of parity on 2026-09-24: it gained three question
types — **listening comprehension**, **speaking practice** and **free-form
translation** — with 125 questions each (one pack per CEFR band, 25 lessons
per type). Speaking questions show a phrase, record the learner saying it,
and grade the speech-to-text transcript tolerantly: a transcript spells the
same utterance differently run to run, so "she's a doctor" and "she is a
doctor" both count. Translation questions describe an idea ("Ask someone
their name") and let the learner write it themselves, accepting any of a
curated list of wordings — and, for a valid wording the list did not
anticipate, asking an AI grader.

**French phase 2** (in progress, `docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md`)
is closing that type gap, one PR per generator change / question type: the
shared generator (`bank-engine.ts`) now knows all three new kinds, and
French has **translate** and **listening** content (250 new questions,
125 each). **Speak** is the remaining PR — it needs a new French
speech-normalisation module across three code ports before any content can
be authored against it. Spanish still has the original three types only;
its content is a separate, later job once the generator work is proven on
French.

Content correctness (grammar, natural phrasing) for French and Spanish
still needs a real native-speaker review pass — not done for either, just
structurally complete, and phase 2's new content adds to that same
unreviewed surface rather than reducing it (see `docs/BACKLOG.md`,
gitignored/local, for the full open-items list).

## Spaced Repetition System

The app uses an SM-2-style algorithm (with two deliberate departures from
vanilla SM-2, added 2026-09-20 — see `src/lib/srs.ts`'s doc comments) to
schedule review of missed items:

- **Wrong answer**: repetitions *halve* (not reset to zero), ease
  decreases, a lapse is recorded — one slip no longer erases arbitrarily
  much earned progress, a well-known real weakness of vanilla SM-2
- **Correct answer**: interval grows (1 day → 3 days → interval × ease ×
  an overdue-growth bonus), item retires after 4 clean repetitions in a
  row. The overdue-growth bonus rewards successfully recalling an item
  well past its due date (the "spacing effect") — capped at 1.5x so one
  very-overdue review can't cause a wild interval swing
- **Review queue** (`/review`): due items shown oldest-first; the learn page shows a live due-count badge

## Development

### Prerequisites

- [bun](https://bun.sh) (this repo uses bun's lockfile and `bunfig.toml`; npm/yarn aren't tested against it)
- A Supabase project (for local dev against a real backend) — see `ARCHITECTURE.md`'s "Applying migrations" note if you're standing up a fresh one

### Setup

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
cp .env.example .env  # fill in your Supabase + AI provider keys
bun run dev
```

### Environment Variables

See `.env.example` for the full, commented list. Summary:

```
SUPABASE_URL / VITE_SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only, never VITE_-prefixed
NVIDIA_API_KEY                 # chat (integrate.api.nvidia.com)
DEEPGRAM_API_KEY               # TTS/STT (deepgram.com)
```

### Available Scripts

```sh
bun run dev        # Start the dev server
bun run build       # Production build
bun run preview     # Preview a production build
bun run lint         # ESLint (includes eslint-plugin-jsx-a11y)
bun run format      # Prettier --write
bun run test         # Vitest (data/lib/components/hooks/routes/supabase integration)
bun run test:coverage  # Same, with v8 coverage report — see AGENTS.md's Testing section for the current %
bun run test:e2e    # Playwright + axe-core (e2e/*.spec.ts) — needs a running dev server
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, `test`, `test:e2e`,
and (on a macOS runner) both the `ios/LearnWithAlphonsoKit` Swift
package's test suite and a real `xcodebuild` of the `LearnWithAlphonso`
app target itself, on every PR and push to `main`.

## Deployment

Production is Vercel (`learn.alphonsoecosystem.app`, project
`learnwithalphonso` in the Vercel dashboard — renamed from
`english-buddy-app-33` on 2026-09-20 when the Git connection was fixed).
Vercel's GitHub integration lost this repo in the org transfer, then
was reconnected and **fully confirmed working, both ways, the same
day**: its project link shows `obsidian-media/LearnWithAlphonso`, a
manually-triggered git-sourced deployment built successfully, and — the
real proof — a plain `git push` to `main` with no manual trigger
produced a new deployment (`source: "git"`) on its own within ~90
seconds. Auto-deploy-on-push is genuinely restored. If a future check
ever shows otherwise, deploy manually as a fallback: `vercel deploy
--prod --token=<token>` from a clean checkout of `main` (a
`.vercelignore` keeps this scoped to the actual app, excluding `ios/`,
`docs/`, `supabase/functions/`, and any local
`.claude/worktrees/`). See `ARCHITECTURE.md`'s "Known rough edges" for
the full story and
`AGENTS.md`'s Deployment section for Supabase (migrations/Edge
Functions, a separate manual step from this).

## Native iOS app

"Learn with Alphonso" (`ios/`) shares this repo's Supabase project for
auth/lessons/progress — one account, not a separate system. Built and
CI-verified compiling (a real `xcodebuild` on a macOS GitHub Actions
runner, `ios-app-build` in `.github/workflows/ci.yml` — there is no local
Xcode/macOS in this development environment, so that CI job is the only
compile verification that exists):

- **Theme system** (`Sources/DesignSystem/`): the app's own port of the
  three web themes (Meadow/Studio Ink/Manuscript) plus a fourth,
  iOS-only theme (Canopy) — bundled variable fonts per theme resolved
  to a specific weight/optical-size via CoreText rather than static
  files (none of the seven font families ship those), oklch-accurate
  color palettes, and the `.hard-shadow` pressed-button effect —
  applied across every screen, switchable in-app (Settings, from the
  Learn tab) and synced to `profiles.theme`.
  `.preferredColorScheme` is pinned to whichever theme is active so
  system-styled chrome (nav titles, empty states) stays legible
  regardless of the device's own Dark Mode setting. Before this, the
  app had no design system at all and rendered as stock SwiftUI
  throughout
- **Mascots**: Alphonso (the app's own namesake/host) and Hector (the
  Pro AI tutor) both have real character portraits now — Alphonso
  greets you on sign-in and shows up with an explanation whenever a
  lesson/review answer is wrong (`AlphonsoTipCard`); Hector has his own
  portrait on his sign-in step and a small avatar beside his chat
  bubbles during conversation. Deliberately Alphonso, not Hector, for
  free wrong-answer help — Hector is Pro-gated ($9.99/mo)
- Auth (email/OTP), lesson browser, lesson player (multiple-choice +
  fill-in-blank), SM-2 review queue, progress sync (XP/streaks/hearts)
- **Free** AI conversation: 6 roleplay scenarios against this repo's own
  `/api/chat`/`/api/tts`/`/api/stt` (same backend the web app uses)
- **Pro** ($9.99/month, via RevenueCat): "Hector" — a second AI
  conversation mode using AlphonsoCompanion's Cloud Voice backend, which
  needs its own separate sign-in (a different Supabase project from this
  app's own account system)
- **Weakness detection**: after either conversation mode ends (4+ turns),
  NVIDIA NIM identifies up to 3 grammar/vocabulary weaknesses and adds
  them as gradable multiple-choice items to the same SM-2 review queue —
  the same `review_items` table, discriminated by a new `source` column
  (`"lesson"` vs `"weakness"`) rather than a separate table
- **Leaderboards** (global/friends/country, weekly/all-time): overtake
  detection (in-app toast) and a weekly recap sheet
- **Friends**: invite-link based, an activity feed, and nudge-a-friend
  (deliberately the weaker polling-based V2 version, not real push — see
  `ARCHITECTURE.md`)
- **Achievements/leagues**: browse screen + unlock celebrations
- **Teams, weekly challenges, open duels, season ladder**: persistent
  teams with weekly-XP competition; fixed weekly solo goals plus
  stranger-matchmaking duels (alongside friend duels); a weekly
  promotion/demotion season ladder distinct from the permanent league
  tier — linked from Leaderboards, real push (not push-style local
  reminders) planned as a fast-follow for whichever of these gets
  real usage first
- **Offline-first**: lesson completion and review grading both queue
  locally (SwiftData) and sync when connectivity returns, with two
  known, deliberately-unsolved edge cases documented in `ARCHITECTURE.md`
- Local (not push) notification scheduling: streak reminder, due-review
  nudge, weekly leaderboard recap
- Code signing via an App Store Connect API key (`.github/workflows/ios-release.yml`,
  manual trigger) — no interactive Apple ID login needed anywhere in the
  pipeline. App Store Connect app record exists ("Learn With Alphonso",
  bundle `com.obsidianmedia.learnwithalphonso`). TestFlight builds ship
  regularly now (build 17 as of 2026-09-23; the "no build has shipped
  this V2 work yet" note that stood here until 2026-09-24 was long
  stale). Build numbers are set by hand via `CURRENT_PROJECT_VERSION` in
  `ios/LearnWithAlphonso/project.yml` and **must be bumped before each
  upload** — App Store Connect rejects a duplicate.

See `AGENTS.md`'s Key Files table for the full file-by-file breakdown,
and `ARCHITECTURE.md`'s "Native iOS app" section for how it's wired to
the backend(s).

## Project Structure

```
src/
├── components/          # React components (AppShell, icons, SegmentedControl, HeartsModal, ...)
├── data/                # Curriculum, levels, lesson bank, achievements, courses
├── hooks/                # Custom React hooks
├── integrations/         # Supabase clients (client.ts, client.server.ts, auth-middleware.ts)
├── lib/                  # Progress store, server functions (*.functions.ts), SRS/XP pure-math modules
└── routes/                # File-based routes (TanStack Router)
    ├── api/               # AI endpoints (chat, TTS, STT)
    └── _authenticated/    # Protected routes (learn, lesson, review, profile, league, converse, friends)
e2e/                      # Playwright + axe-core E2E/accessibility tests
supabase/
├── migrations/            # SQL migrations (not auto-applied — see ARCHITECTURE.md)
└── functions/             # Deno Edge Functions: the trust-sensitive write
                            # paths a native client can't run as a TanStack
                            # Start server function (complete-lesson,
                            # start-lesson-session, grade-review)
ios/
├── LearnWithAlphonsoKit/   # Swift package: content models, SRS/XP math ports,
                            # network clients -- no UI, builds on any platform
└── LearnWithAlphonso/      # SwiftUI app target (XcodeGen `project.yml`, no
                            # committed .xcodeproj) -- lesson player, review
                            # queue, AI conversation (free + Pro/Hector),
                            # RevenueCat paywall
    └── Sources/
        ├── DesignSystem/   # Meadow-theme tokens/fonts/components, applied
                            # app-wide -- see "Native iOS app" below
        └── Fonts/          # Bundled Fraunces/Geist variable-font .ttf files
```

## Documentation

- `ARCHITECTURE.md` — stack, request flow, database schema, content model, known rough edges
- `AGENTS.md` — conventions and key-file map for agents/contributors working in this repo
- `CHANGELOG.md` — versioned history (V1 web app, V2 native iOS batches)
- `DEFERRED-WORDS.md` — granular postponed items too small for their own tracked task (gitignored, local-only)
- `LESSON_ASSETS.md` — asset plan for lesson content (audio, images, icons, animations); its status banner explains what's actually built vs. still aspirational
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design docs and implementation plans for major features (curriculum DB schema, the `complete-lesson` Edge Function, the native iOS app, theme foundation, every V2 iOS feature)
- `docs/v2-kickoffs/` — gitignored, local-only briefing docs used to hand off individual V2 feature slices to fresh sessions; kept as a reference for the pattern, verify against current code before trusting one
- `docs/v3-kickoffs/` — same pattern, for whatever's next after V2 (gitignored, local-only)

A full-codebase audit is kept locally (gitignored, not in this repo) rather
than committed — it goes stale within weeks of any real development and a
committed copy calcifies into documentation people trust instead of
re-checking against the code.

## License

Private project. All rights reserved.
