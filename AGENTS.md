# AGENTS.md — English Buddy App

## Project Overview

English Buddy is a mobile-first English learning app with 300 lessons across 5 CEFR levels (A1-C1), spaced repetition review, AI conversation practice, and gamification.

## Key Files

| File | Purpose |
|---|---|
| `src/data/curriculum.ts` | Lesson content types + foundation units (A1) |
| `src/data/levels.ts` | Level definitions + advanced units (A2-C1) |
| `src/data/lesson-bank.ts` | Generated lesson packs (SM-2 compatible, 150 potential lessons) |
| `src/lib/progress.ts` | Zustand progress store (client-side state) |
| `src/lib/sync.functions.ts` | Server functions (progress sync, lesson completion, SRS) |
| `src/routes/_authenticated/learn.tsx` | Learning path UI (units, lessons, progress) |
| `src/routes/_authenticated/lesson.$id.tsx` | Lesson player (MC + fill-in-blank) |
| `src/routes/_authenticated/review.tsx` | Spaced repetition review queue |
| `src/routes/api/chat.ts` | AI chat endpoint (Gemini) |
| `src/routes/api/tts.ts` | Text-to-speech endpoint |
| `src/routes/api/stt.ts` | Speech-to-text endpoint |

## Content Structure

- **300 lessons** (60 per CEFR level × 5 levels)
- **12 units per level** × **5 lessons per unit**
- **8 questions per lesson** (MC + fill-in-blank)
- **SM-2 spaced repetition** for missed items

## Code Conventions

- **TypeScript** strict mode
- **React 19** functional components
- **Tailwind CSS v4** utility classes
- **Zustand** for client state
- **TanStack Router** file-based routing
- **Zod** for server-side validation
- **Framer Motion** for animations

## Testing

No test runner is installed yet (no Vitest/Playwright) despite earlier docs
claiming otherwise — see `audits/2026-09-09_ClaudeCode_EnglishBuddyApp33FullAudit.md`
in the Boardroom repo. Only lint is currently wired up:

```sh
npm run lint        # ESLint
```

## Assets

See `LESSON_ASSETS.md` for the complete list of assets needed for all 300 lessons (audio, images, icons, animations).

## Audit

See `AUDIT.md` for the full codebase audit covering security, architecture, accessibility, content, performance, UX, and testing.
