# English Buddy App

A full-stack mobile-first English (and French) learning app with gamification, AI-powered conversation practice, and a spaced repetition review system.

> Decoupled from Lovable hosting/tooling (TASK-078) as far as this repo's
> code is concerned: AI calls go straight to NVIDIA/Deepgram (not a Lovable
> gateway), and deploy targets Vercel.

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

- **5 CEFR levels** per course, A1 (Beginner) → C1 (Advanced)
- **Two courses**: English and French, via a shared `getCourse()` content bundle
- **Spaced repetition**: SM-2 algorithm for long-term retention of missed items, with a due-count badge on the learn page
- **Placement test**: 15-question adaptive test to set starting level
- **AI conversation**: voice-enabled chat with 6 scenarios
- **Gamification**: XP, streaks, streak freezes, hearts (regenerate over time, or earn back via a perfect lesson / a streak milestone / clearing the review queue / spending XP), leagues (Bronze → Diamond), achievements
- **Friends**: invite-link based, with a friends leaderboard scope
- **Leaderboards**: global, friends, and country rankings
- **Themes**: 3 user-selectable themes (Meadow, Studio Ink, Manuscript — `/profile`), synced to the account and persisted locally
- **Native iOS app** (`ios/`): "Learn with Alphonso" — see the "Native iOS app" section below and `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`

## Content

Counted directly from the actual `curriculum`/`curriculumFr` bundles (see
`AGENTS.md`'s Content Structure table for how/when this was last verified —
re-run the count rather than trusting a number here if it's been a while):

| Course      | A1  | A2  | B1  | B2  | C1  | Total lessons | Total questions |
| ----------- | --- | --- | --- | --- | --- | ------------- | --------------- |
| **English** | 122 | 104 | 104 | 102 | 102 | **534**       | 2,718           |
| **French**  | 25  | 25  | 25  | 25  | 25  | **125**       | 625             |

French is a complete 5-level course, just meaningfully thinner than English —
not a stub or placeholder.

## Spaced Repetition System

The app uses an SM-2-style algorithm to schedule review of missed items:

- **Wrong answer**: item resets to the start, ease decreases, a lapse is recorded
- **Correct answer**: interval grows (1 day → 3 days → interval × ease), item retires after 4 clean repetitions in a row
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
bun run test         # Vitest (src/lib/*.test.ts)
bun run test:e2e    # Playwright + axe-core (e2e/*.spec.ts) — needs a running dev server
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, `test`, `test:e2e`,
and (on a macOS runner) both the `ios/LearnWithAlphonsoKit` Swift
package's test suite and a real `xcodebuild` of the `LearnWithAlphonso`
app target itself, on every PR and push to `main`.

## Native iOS app

"Learn with Alphonso" (`ios/`) shares this repo's Supabase project for
auth/lessons/progress — one account, not a separate system. Built and
CI-verified compiling (a real `xcodebuild` on a macOS GitHub Actions
runner, `ios-app-build` in `.github/workflows/ci.yml` — there is no local
Xcode/macOS in this development environment, so that CI job is the only
compile verification that exists):

- Auth (email/OTP), lesson browser, lesson player (multiple-choice +
  fill-in-blank), SM-2 review queue, progress sync (XP/streaks/hearts)
- **Free** AI conversation: 6 roleplay scenarios against this repo's own
  `/api/chat`/`/api/tts`/`/api/stt` (same backend the web app uses)
- **Pro** ($9.99/month, via RevenueCat): "Hector" — a second AI
  conversation mode using AlphonsoCompanion's Cloud Voice backend, which
  needs its own separate sign-in (a different Supabase project from this
  app's own account system)
- Code signing via an App Store Connect API key (`.github/workflows/ios-release.yml`,
  manual trigger) — no interactive Apple ID login needed anywhere in the
  pipeline. App Store Connect app record exists ("Learn With Alphonso",
  bundle `com.obsidianmedia.learnwithalphonso`)

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
```

## Documentation

- `ARCHITECTURE.md` — stack, request flow, database schema, content model, known rough edges
- `AGENTS.md` — conventions and key-file map for agents/contributors working in this repo
- `LESSON_ASSETS.md` — asset plan for lesson content (audio, images, icons, animations); its status banner explains what's actually built vs. still aspirational
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design docs and implementation plans for major features (curriculum DB schema, the `complete-lesson` Edge Function, the native iOS app, theme foundation)

A full-codebase audit is kept locally (gitignored, not in this repo) rather
than committed — it goes stale within weeks of any real development and a
committed copy calcifies into documentation people trust instead of
re-checking against the code.

## License

Private project. All rights reserved.
