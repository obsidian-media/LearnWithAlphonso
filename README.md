# English Buddy App

A full-stack mobile-first English learning app with gamification, AI-powered conversation practice, and a spaced repetition review system.

**Live app**: https://english-buddy-app-33.lovable.app

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | TanStack Start (SSR) + React 19 + Vite 8 |
| **Styling** | Tailwind CSS v4 + shadcn/ui (New York) + Framer Motion |
| **State** | Zustand (client) + TanStack Query (server) |
| **Backend** | Supabase (PostgreSQL + Auth + RLS) |
| **AI** | Gemini 3.6 Flash (chat) + GPT-4o-mini (TTS/STT) via Lovable Gateway |
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
cp .env.example .env  # Add your Supabase + Lovable keys
npm run dev
```

### Environment Variables
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
LOVABLE_API_KEY=your-lovable-api-key  # For AI gateway
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
├── integrations/       # Supabase client, Lovable OAuth
├── lib/                # Progress store, server functions, utils
└── routes/             # File-based routes (TanStack Router)
    ├── api/            # AI endpoints (chat, TTS, STT)
    └── _authenticated/ # Protected routes (learn, lesson, review, etc.)
```

## Documentation

- `AUDIT.md` — Full codebase audit (security, architecture, accessibility, content, performance, UX, testing)
- `LESSON_ASSETS.md` — Complete asset list for all lesson content (audio, images, icons, animations)
- `ARCHITECTURE.md` — Architecture decision records and system design

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c8d49982-e065-4713-b385-a1a2eba6f01e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## License

Private project. All rights reserved.
