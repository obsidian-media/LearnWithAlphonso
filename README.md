# English Buddy App

A full-stack mobile-first English learning app with gamification, AI-powered conversation practice, and a spaced repetition review system.

> Being decoupled from Lovable hosting/tooling as of TASK-078 — the
> `lovable.app` URL above will move once redeployed (Vercel planned, see
> `docs/DESIGN-english-buddy-33-decoupling.md` in the Boardroom repo).

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | TanStack Start (SSR) + React 19 + Vite 8 |
| **Styling** | Tailwind CSS v4 + shadcn/ui (New York) + Framer Motion |
| **State** | Zustand (client) + TanStack Query (server) |
| **Backend** | Supabase (PostgreSQL + Auth + RLS) |
| **AI** | NVIDIA NIM (chat, direct) + Deepgram Aura-2/Nova-3 (TTS/STT, direct) |
| **Routing** | TanStack Router (file-based) |

## Features

- **5 CEFR Levels**: A1 (Beginner) → C1 (Advanced) with 60 lessons per band
- **Spaced Repetition**: SM-2 algorithm for long-term retention of missed items
- **Placement Test**: 15-question adaptive test to set starting level
- **AI Conversation**: Voice-enabled chat with 6 scenarios
- **Gamification**: XP, streaks, hearts, leagues (Bronze → Diamond), 18 achievements
- **Leaderboards**: Global, friends, and country rankings

## Content Structure

Each level contains 12 units × 5 lessons = 60 lessons per band.

| Level | Units | Lessons | Questions |
|---|---|---|---|
| A1 | 12 | 60 | 480 |
| A2 | 12 | 60 | 480 |
| B1 | 12 | 60 | 480 |
| B2 | 12 | 60 | 480 |
| C1 | 12 | 60 | 480 |
| **Total** | **60** | **300** | **2,400** |

Each lesson contains 8 questions (MC + fill-in-blank) with explanations.

## Spaced Repetition System

The app uses the SM-2 algorithm to schedule review of missed items:

- **Quality 0-2**: Item resets, reviewed again tomorrow
- **Quality 3-5**: Interval increases based on ease factor
- **Ease factor**: Adjusts based on performance (min 1.3, starts at 2.5)
- **Review queue**: Due items shown on learn page with counter badge

## Development

### Prerequisites
- Node.js 18+ ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- npm or bun

### Setup
```sh
git clone <this-repository-url>
cd <repository-name>
npm i
cp .env.example .env  # Fill in your Supabase + AI provider keys
npm run dev
```

### Environment Variables
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # server-only, never VITE_-prefixed
NVIDIA_API_KEY=your-nvidia-api-key    # chat (integrate.api.nvidia.com)
DEEPGRAM_API_KEY=your-deepgram-api-key # TTS/STT (deepgram.com)
```

### Available Scripts
```sh
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # ESLint
```

## Project Structure

```
src/
├── components/          # React components (AppShell, icons, ui/)
├── data/               # Curriculum, levels, lesson bank, achievements
├── hooks/              # Custom React hooks
├── integrations/       # Supabase client
├── lib/                # Progress store, server functions, utils
└── routes/             # File-based routes (TanStack Router)
    ├── api/            # AI endpoints (chat, TTS, STT)
    └── _authenticated/ # Protected routes (learn, lesson, review, etc.)
```

## Documentation

- `AUDIT.md` — Full codebase audit (security, architecture, accessibility, content, performance, UX, testing)
- `LESSON_ASSETS.md` — Complete asset list for all lesson content (audio, images, icons, animations)
- `ARCHITECTURE.md` — Architecture decision records and system design

## License

Private project. All rights reserved.
