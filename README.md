# Learn with Alphonso

A full-stack mobile-first English, French, and Spanish learning app with gamification, AI-powered conversation practice, and a spaced repetition review system — web app plus native iOS and Android apps sharing the same backend/account.

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
| **AI**              | NVIDIA NIM chat (default model `nvidia/nemotron-3.5-lightning-30b-a3b`, reasoning turned off on every call) + Deepgram Aura-2/Nova-3 (TTS/STT), all called directly |
| **Routing**         | TanStack Router (file-based)                                         |
| **Testing**         | Vitest (unit) + Playwright + axe-core (E2E/accessibility)            |
| **Package manager** | bun (`bun.lock` is authoritative; no `package-lock.json`)            |

See `ARCHITECTURE.md` for the full request flow, database schema, and design notes.

## Features

- **Listen** (web, Phase 1a — 2026-09-24): a browsable folder tree of short audio
  episodes with a persistent mini-player that survives navigation and resumes
  where you left off, across devices. Episodes are published by the account
  owner with `scripts/podcast-tool.ts` (or the admin app) — either an MP3 you
  recorded or a script spoken by a Deepgram Aura-2 voice (the audio is
  AI-narrated, and the app says so) — so the library grows without a deploy or
  an App Store release. **Licensed-only publishing is enforced**: every episode
  records its `voice_provider` and `voice_model`, only `deepgram` or `human`
  audio can be published, and a database CHECK enforces that for every write
  path. As of 2026-10-09 the library holds 16 published episodes (10 English,
  3 French, 3 Spanish); the unlicensed audio that used to be there was
  unpublished and deleted. The schema and the `podcast-audio` bucket are live (migrations
  auto-apply on merge). Play events are written only through
  `record_podcast_play_event`, not by a direct insert — that table is the
  evidence base Phase 2 will build on. Transcripts shipped in Phase 2a;
  **comprehension questions, XP and SRS wiring are Phase 2b and are not
  built**. On iOS, episodes can be **downloaded for offline listening**
  (Phase 3): downloads are explicit, nothing is ever deleted without you
  asking, and offline the downloaded set is listed flat rather than as the
  folder tree. The iOS player saves your position from the very first listen,
  explains a missing or offline episode with a Retry button instead of a
  silent Pause icon, follows the active course and hides folders with nothing
  published. See
  `docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`.
- **Admin app** — live at `admin.alphonsoecosystem.app` (sign in with
  Google or email/password), run locally with
  `bun run dev:admin` (port 8081). A separately-deployed
  surface for managing the podcast library: folders, episode metadata,
  audio upload, publish/unlist, and transcripts. Access is an explicit
  allowlist (`admin_users`) that only the server can read; the first
  admin is added by hand in the Supabase SQL editor, because every
  self-bootstrapping admin mechanism is a bypass waiting to happen. It
  shares every validation rule with `scripts/podcast-tool.ts` rather than
  reimplementing them, so the CLI and the UI cannot drift. See
  `docs/superpowers/specs/2026-09-25-podcast-phase4-admin-design.md`.
- **5 CEFR levels** per course, A1 (Beginner) → C1 (Advanced)
- **Three courses**: English, French, and Spanish, via a shared `getCourse()` content bundle
- **Spaced repetition**: SM-2 algorithm for long-term retention of missed items, with a due-count badge on the learn page
- **Placement test**: 15-question adaptive test to set starting level. In English it
  assesses multiple choice, listening and written translation — the same formats
  the course uses, so nobody is placed by an exam that tests something else.
  Speaking is deliberately excluded: it would require microphone permission during
  onboarding, and a denial would leave the question unanswerable
- **AI conversation**: voice-enabled chat with 12 scenarios plus a three-scene campaign, in English, French and Spanish (the active course picks the persona, the prompt and the native Aura-2 voice: Thalia, Agathe, Selena). Replies come back in about a second since the chat model's reasoning was turned off on every call (2026-10-09)
- **AI consent and safety**: every AI endpoint that sends learner input is gated by an account-level consent (generated practice, which sends only lesson text, is not) (`profiles.ai_consent_at`, enforced by the server on every AI endpoint; the consent screen and the Settings switch exist on web and iOS, withdrawal is immediate, and Android has no consent screen yet, so there AI features only work for an account that already granted consent on web or iOS). Without consent a written translation is graded against the curated answers only and speaking falls back to typing; lessons and review are never walled. Model text shown to learners is checked by the moderation filter, and every assistant reply has a "Report this response" action (the report stores the reply text and where it appeared)
- **Study together**: opt-in buddies (a friend, or a matched learner aged 13+ in the same course within one CEFR step), a shared weekly goal and a streak, and **preset messages only** (8 fixed encouragements, never free text). Block and Report are on every card
- **Public name and moderation**: a one-time "What should other learners call you?" step after first sign-in (Skip keeps a `Learner-XXXX` handle); display and team names pass one server-side filter, every refusal is explained in words, blocked users disappear from each other's team lists, leaderboards and matching, and a new report emails the owner within seconds
- **Save any word** (iOS and web: Hector, Practice and Campaign replies, English-course lesson explanations and podcast transcripts): tap a word in an assistant reply to save it with its sentence. One AI call writes the meaning, shown at once, and the word returns later in the review queue as a multiple-choice card. Limited to 40 new words a day and 500 per course
- **Gamification**: XP, streaks, streak freezes, hearts (regenerate over time, or earn back via a perfect lesson / a streak milestone / clearing the review queue / spending XP; the server refuses to start a lesson at 0 hearts and the apps offer "Review instead"), leagues (five tiers, shown to learners as Sprout, Sapling, Grove, Treetop and Summit; the database keys are unchanged), achievements, friend duels + open/stranger duel matchmaking, weekly challenges, persistent teams (weekly-XP competition plus a shared weekly team mission), and a season ladder (weekly promotion/demotion cohorts, separate from the permanent league)
- **Friends**: invite-link based, with a friends leaderboard scope; a `friend_activity_events` feed (lesson completions, streak milestones, league promotions) and nudge-a-friend, both native-only (iOS and Android, not on web; see "Native iOS app" below)
- **Leaderboards**: global, friends, and country rankings; overtake detection and a weekly recap, both native-only (iOS and Android)
- **Themes**: 4 user-selectable themes on web (Canopy, the default since the web port, then Meadow, Studio Ink and Manuscript — `/profile`), synced to the account and persisted locally
- **iOS navigation** (Phase 0, 2026-09-24): five tabs — **Learn · Listen · Practice ·
  Hector · Profile**. It was seven, and iPhone renders five before collapsing the rest
  into the system "More" list, so Achievements was already buried. League, Friends and
  Achievements now live behind **Profile**; the **review queue** is a row at the top of
  Learn with a due-count badge on the tab (Settings also keeps its gear on Learn).
  **Listen is real as of Phase 1b** (2026-09-24), so the Phase 0/1b release constraint is
  lifted: browse the folder tree, play an episode, keep playing with the screen locked
  (lock-screen and Control Center controls included), and resume where you left off —
  including across to the web app on the same account. (Phase 3 later added the
  explicit offline download described under Listen above.) See
  `docs/superpowers/specs/2026-09-24-podcast-phase0-ios-tabs-design.md` and
  `docs/superpowers/specs/2026-09-24-podcast-phase1b-ios-design.md`.
- **Native iOS app** (`ios/`): "Learn with Alphonso" — auth, lesson player, review queue, leaderboards, friends, achievements/leagues, push-notification-style local reminders, offline-first lesson completion/review grading, and AI-conversation weakness detection (Hector + free mode both feed the review queue). Has its own theme system (`ios/LearnWithAlphonso/Sources/DesignSystem/`) with 4 themes: the three web themes ported over (Meadow/Studio Ink/Manuscript — fonts, oklch-accurate palette, the hard-shadow pressed-button effect) plus a fourth, mascot-forward "Canopy" theme (iOS 2026-09-23, ported to the web afterwards and now the default there too), applied across every screen, with an in-app picker (Settings, from the Learn tab) that syncs to the same `profiles.theme` the web app reads — see the "Native iOS app" section below and `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` (original 3-theme port) / `docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md` (Canopy)

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
| **French**  | 115 | 115 | 115 | 115 | 115 | **575**       | 2,875           |
| **Spanish** | 115 | 116 | 119 | 117 | 116 | **583**       | 2,915           |

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

**French phase 2** (`docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md`)
closed that type gap, one PR per generator change / question type: the
shared generator (`bank-engine.ts`) now knows all three new kinds, and
French has **translate**, **listening**, and **speak** content (375 new
questions, 125 each) — full question-type parity with English. Speak
required its own French speech-normalisation module
(`spoken-answer-fr.ts`), hand-kept in sync across all three code ports
(TS/Deno/Swift) the same way English's `spoken-answer.ts` is, because
French elision is a phonological rule with no relationship to English's
auxiliary-verb-contraction rules — see that module's header comment.
**Spanish's own phase 2**
(`docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md` §6-7)
followed the same one-PR-per-question-type shape, all four PRs now
merged: `bank-engine.ts` needed zero Spanish-specific changes (verified
against real Spanish content, not inferred from French); **translate**
content (125 questions) in Latin American Spanish (`tú`/`usted`/
`ustedes`, no `vosotros`/`vos` — measured against the existing bank
rather than chosen from preference); **listening** content (125
questions) using Spanish minimal pairs across seseo, b/v and yeísmo
mergers, measured (not assumed) at 96.0% confusability, matching
French's own benchmark; and **speak** content (125 questions) plus its
own speech-normalisation module (`spoken-answer-es.ts`, hand-kept in
sync across TS/Deno/Swift the same way French's is) — Spanish's
phonology needed different rules than either sibling (no elision like
French, but a categorical silent-h rule neither English nor French
needs). Spanish now has full six-type parity with English and French at
583 lessons / 2,915 questions.

Content correctness (grammar, natural phrasing) for French and Spanish
still needs a real native-speaker review pass — not done for either, just
structurally complete, and phase 2's new content adds to that same
unreviewed surface rather than reducing it (see `docs/BACKLOG.md`,
gitignored/local, for the full open-items list).

## Spaced Repetition System

The app uses an SM-2-style algorithm (with two deliberate departures from
vanilla SM-2, added 2026-09-20 — see `src/lib/srs.ts`'s doc comments) to
schedule review of missed items:

- **Wrong answer**: repetitions _halve_ (not reset to zero), ease
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
NVIDIA_CHAT_MODEL              # optional override; default nvidia/nemotron-3.5-lightning-30b-a3b
DEEPGRAM_API_KEY               # TTS/STT (deepgram.com)
LESSON_SESSION_SECRET          # signs lesson-session tokens (also an Edge Function secret)
```

Optional switches default on and are turned off only by the literal value
`false`: `ENFORCE_AI_CONSENT` and `ENFORCE_HEARTS_GATE`.

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

CI (`.github/workflows/ci.yml`, workflow name "CI") has these jobs on every
PR and push to `main`: `lint-and-typecheck` (lint, typecheck, the Vitest
suite, and a check that the bundled iOS content is up to date), `types-fresh`
(the generated Supabase types; advisory, it does not gate the deploy),
`admin-build`, `e2e` (Playwright + axe-core), `deno-tests`, `ios-swift-tests`
and `ios-app-build` (a real `xcodebuild` of the app target, plus a check that
RevenueCat resolved to the pinned version, both on a macOS runner). On a push
to `main`, `deploy-supabase` applies the migrations and redeploys the Edge
Functions once `lint-and-typecheck`, `e2e` and `deno-tests` pass. The Android
app has its own pipeline (`android-ci.yml`), and the release, App Store
Connect and QA tooling lives in manually-dispatched workflows (for example
`ios-release.yml`, `asc-release-ops.yml`, `capture-app-store-screenshots.yml`,
`build-simulator-app.yml`, `ios-ui-compat.yml`, `vocab-image-links.yml`).

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
nested local worktree directories). See `ARCHITECTURE.md`'s "Known rough edges" for
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
  three original web themes (Meadow/Studio Ink/Manuscript) plus a fourth,
  Canopy (also on the web now) — bundled variable fonts per theme resolved
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
- **Sign-in**: Apple's own "Continue with Apple" button, Google, or an emailed
  six-digit code (resend with a 60 s countdown, a different-email escape, an
  expired code told apart from a wrong one). A brand-new account then sees the
  one-time public-name step (prefilled from the Apple or Google first name,
  checked live against the server filter; Skip keeps a `Learner-XXXX` handle),
  and onboarding can never show an empty screen. Signing out or deleting the
  account clears the offline queue, caches, scheduled reminders, push token
  and RevenueCat identity so nothing leaks to the next account
- Lesson browser, lesson player (six question types), SM-2 review queue
  (never blank: the whole due queue is resolved against bundled content before
  anything is shown), progress sync (XP/streaks/hearts)
- **Free** AI conversation: 12 roleplay scenarios and a campaign in English,
  French and Spanish against this repo's own `/api/chat`/`/api/tts`/`/api/stt`
  (same backend the web app uses). One shared voice engine drives every mic
  screen, so a tab switch can no longer leave the microphone dead; every
  assistant reply has "Report this response"; AI features need the account's
  AI consent (Profile, Settings, AI features)
- **Pro** (auto-renewing subscription via RevenueCat; the paywall shows the
  StoreKit title and price, never a hardcoded one, with a loading skeleton, a
  Try again state and Terms/Privacy links): "Hector" — a second AI
  conversation mode, same backend and account as everything else in the
  app (decoupled from AlphonsoCompanion's separate Cloud Voice system
  2026-09-27; no separate sign-in anymore)
- **Weakness detection**: after either conversation mode ends (4+ turns),
  NVIDIA NIM identifies up to 3 grammar/vocabulary weaknesses and adds
  them as gradable multiple-choice items to the same SM-2 review queue —
  the same `review_items` table, discriminated by a new `source` column
  (`"lesson"` vs `"weakness"` vs `"saved_word"`) rather than a separate table
- **Save any word**: tap a word in an assistant reply (Hector, Practice or Campaign), save it with
  its sentence (`POST /api/define-word`, one NVIDIA call, own `define`
  quota), and it joins the same review queue as a self-contained
  `saved_word` multiple-choice card, first due the next day. Hector,
  Practice and Campaign replies, English-course lesson and review
  explanations, and podcast transcripts, on iOS and on the web (web: `SaveWordProvider` +
  `TappableText`, one confirmation dialog that tells the learner what is sent before sending it)
- **Learning goal**: pick "finish B1 by <date>" on the Learn page; the server works out lessons a week, on track / ahead / behind, and a suggested date. One computation (`planGoal`) behind `/api/learning-goal`, rendered by web, iOS and Android
- **Leaderboards** (global/friends/country, weekly/all-time): overtake
  detection (in-app toast) and a weekly recap sheet
- **Friends**: invite-link based, an activity feed, and nudge-a-friend
  (deliberately the weaker polling-based V2 version, not real push — see
  `ARCHITECTURE.md`)
- **Achievements/leagues**: browse screen + unlock celebrations
- **Team mission**: every team of two or more gets a weekly shared goal (members x 4 lessons); reaching it pays each
  contributing member +50 XP and a "Team player" badge. One server function (`get_team_mission`) behind web, iOS and
  Android; no cron. Language buddies (friend pairing, opt-in matching, a shared weekly goal, preset messages only) are
  built on web, iOS and Android: `docs/superpowers/specs/2026-10-06-study-together-design.md`
- **Teams, weekly challenges, open duels, season ladder**: persistent
  teams with weekly-XP competition (private teams are join-by-code only and are not listed on the board or readable by non-members); fixed weekly solo goals plus
  stranger-matchmaking duels (alongside friend duels); a weekly
  promotion/demotion season ladder distinct from the permanent league
  tier — linked from Leaderboards, real push (not push-style local
  reminders) planned as a fast-follow for whichever of these gets
  real usage first
- **Offline-first**: lesson completion and review grading both queue
  locally (SwiftData) and sync when connectivity returns. The queue never
  jams: transient failures (offline, timeout, 5xx, 429) back off up to 6 hours
  and are retried forever, only a permanent rejection goes to a dead-letter
  table, a finish refused at 0 hearts waits for a refill, and a lesson that
  could not be saved is announced on the Learn tab. Two edge cases are
  deliberately unsolved and documented in `ARCHITECTURE.md`
- Local (not push) notification scheduling: streak reminder, due-review
  nudge, weekly leaderboard recap
- Code signing via an App Store Connect API key (`.github/workflows/ios-release.yml`,
  manual trigger) — no interactive Apple ID login needed anywhere in the
  pipeline. App Store Connect app record exists ("Learn With Alphonso",
  bundle `com.obsidianmedia.learnwithalphonso`). The checked-in project is
  version 1.0, **build 50** (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in
  `ios/LearnWithAlphonso/project.yml`). Build numbers are set by hand, twice
  (app and widget), and **must be bumped before each upload** — App Store
  Connect rejects a duplicate and `ios-release.yml` fails an upload whose build
  number is not above App Store Connect's latest. The app is iPhone-only and
  its home-screen name is "Alphonso".

See `AGENTS.md`'s Key Files table for the full file-by-file breakdown,
and `ARCHITECTURE.md`'s "Native iOS app" section for how it's wired to
the backend(s).

## Native Android app

`android/LearnWithAlphonso/` is a Kotlin + Jetpack Compose app, on `main`
since 2026-10-01, sharing the backend, content and account with web and
iOS. All five plans are merged: auth, Learn, lessons, review, placement,
hearts/XP/streak, offline sync, themes and settings; social (League, Teams,
Friends, Duels, Achievements); audio, AI and Pro; podcasts, notifications,
push and a widget; and the signed-release workflow. It is **not on Google
Play yet**: the Play account, the subscription and the RevenueCat Android key
are owner-gated (`android/LearnWithAlphonso/OWNER-SETUP.md`). Android has not
received the newer iOS work (the account-level AI consent screen, the
public-name step and the hearts gate at lesson open). Build with the Gradle
wrapper (`android/LearnWithAlphonso/TOOLING.md`); CI is
`.github/workflows/android-ci.yml`. See `android/LearnWithAlphonso/README.md`.

## Project Structure

```
src/
├── components/          # React components (AppShell, icons, SegmentedControl, HeartsModal, ...)
├── data/                # Curriculum, levels, lesson bank, achievements, courses
├── hooks/                # Custom React hooks
├── integrations/         # Supabase clients (client.ts, client.server.ts, auth-middleware.ts)
├── lib/                  # Progress store, server functions (*.functions.ts), SRS/XP pure-math modules
└── routes/                # File-based routes (TanStack Router)
    ├── api/               # Server routes: AI (chat, TTS, STT, hector-respond, define-word,
    │                      #   generate-practice, grade-translation, analyze-weaknesses),
    │                      #   learning-goal, account export/delete, apple-link, internal/ (report-notify)
    └── _authenticated/    # Protected routes (learn, lesson, review, profile, league, converse, friends)
e2e/                      # Playwright + axe-core E2E/accessibility tests
supabase/
├── migrations/            # SQL migrations (auto-applied on merge to main by the
                            # `deploy-supabase` job — see ARCHITECTURE.md)
└── functions/             # Deno Edge Functions: the trust-sensitive write
                            # paths a native client can't run as a TanStack
                            # Start server function (complete-lesson,
                            # start-lesson-session, grade-review, send-push,
                            # get-season-status)
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
- `CHANGELOG.md` — versioned history (V1 web app through the current V5 batches)
- `docs/database-privileges.md` — the table-privilege model (new tables start with no client access) and how to check it
- `docs/sql-probes.md` — how to execute a new SQL function as a seeded user in a rolled-back transaction before trusting it
- `docs/mascot-provenance.md` — where the mascot art came from and its terms
- `android/LearnWithAlphonso/` — the Android app's own `README.md`, `TOOLING.md`, `OWNER-SETUP.md`, `DEVICE-CHECKLIST.md` and `play/` listing files
- `DEFERRED-WORDS.md` — granular postponed items too small for their own tracked task (gitignored, local-only)
- `LESSON_ASSETS.md` — asset plan for lesson content (audio, images, icons, animations) and the vocab-image pipeline; its status banner explains what's actually built vs. still aspirational
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design docs and implementation plans for major features (curriculum DB schema, the `complete-lesson` Edge Function, the native iOS app, theme foundation, every V2 iOS feature, the podcast library, study together). They are historical records: a dated status line under a title says what was built or later changed, and the code wins over the document
- `docs/v2-kickoffs/` — gitignored, local-only briefing docs used to hand off individual V2 feature slices to fresh sessions; kept as a reference for the pattern, verify against current code before trusting one
- `docs/v3-kickoffs/` — same pattern, for whatever's next after V2 (gitignored, local-only)

A full-codebase audit is kept locally (gitignored, not in this repo) rather
than committed — it goes stale within weeks of any real development and a
committed copy calcifies into documentation people trust instead of
re-checking against the code.

## License

Private project. All rights reserved.
