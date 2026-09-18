# AGENTS.md — English Buddy App

## Project Overview

English Buddy is a mobile-first English learning app with 5 CEFR levels (A1-C1), spaced repetition review, AI conversation practice, and gamification. Also ships a much thinner French course (see Content Structure below).

## Key Files

| File                                       | Purpose                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/curriculum.ts`                   | Lesson content types + foundation units (A1)                                                                                            |
| `src/data/levels.ts`                       | Level definitions + advanced units (A2-C1)                                                                                              |
| `src/data/lesson-bank.ts`                  | Generated lesson packs (see Content Structure below for actual counts)                                                                  |
| `src/lib/progress.ts`                      | Zustand progress store (client-side state)                                                                                              |
| `src/lib/sync.functions.ts`                | Server functions (progress sync, lesson completion, SRS)                                                                                |
| `src/routes/_authenticated/learn.tsx`      | Learning path UI (units, lessons, progress)                                                                                             |
| `src/routes/_authenticated/lesson.$id.tsx` | Lesson player (MC + fill-in-blank)                                                                                                      |
| `src/routes/_authenticated/review.tsx`     | Spaced repetition review queue                                                                                                          |
| `src/routes/api/chat.ts`                   | AI chat endpoint (NVIDIA NIM)                                                                                                           |
| `src/routes/api/tts.ts`                    | Text-to-speech endpoint (Deepgram)                                                                                                      |
| `src/routes/api/stt.ts`                    | Speech-to-text endpoint (Deepgram)                                                                                                      |
| `src/lib/hearts.ts`                        | Hearts-economy pure math (regen, bonuses, XP purchase) — also ported to Deno (`supabase/functions/complete-lesson/hearts.ts`) and Swift |
| `src/lib/theme.ts`                         | Theme Zustand store (`meadow` / `studio-ink` / `manuscript`)                                                                            |
| `supabase/functions/complete-lesson/`      | Deno Edge Function: 1:1 port of `completeLessonRemote` for the native iOS client (no TanStack server layer on iOS)                      |
| `scripts/seed-curriculum-db.ts`            | Upserts curriculum tables (`levels`/`units`/`lessons`/`questions`/etc.) from `curriculum.ts` — idempotent, safe to re-run               |
| `ios/LearnWithAlphonsoKit/`                | Swift package: content models, SRS/progress-math/hearts ports, network clients — builds without Xcode (`swift-test.ps1` on Windows)     |

## Content Structure

Counted directly from `curriculum` / `curriculumFr` on 2026-09-13 (do not
trust a stale number here — re-run the count if this drifts):

| Course  | A1  | A2  | B1  | B2  | C1  | Total lessons |
| ------- | --- | --- | --- | --- | --- | ------------- |
| English | 122 | 104 | 104 | 102 | 102 | **534**       |
| French  | 25  | 25  | 25  | 25  | 25  | **125**       |

French has less than a quarter of English's lesson count — either treat it
as explicitly "in progress" in the UI, or prioritize closing the gap.

- **SM-2 spaced repetition** for missed items (all levels, both courses)

## Code Conventions

- **TypeScript** strict mode
- **React 19** functional components
- **Tailwind CSS v4** utility classes
- **Zustand** for client state
- **TanStack Router** file-based routing
- **Zod** for server-side validation
- **Framer Motion** for animations

## Testing

Vitest covers the pure logic (SRS grading, XP/streak/league math, hearts
economy, lesson-completion trust-boundary checks) in `src/lib/*.test.ts`;
Playwright covers E2E + accessibility (axe-core) smoke tests in
`e2e/*.spec.ts`, scoped to unauthenticated routes (no seeded test account
exists for CI to sign in with). `ios/LearnWithAlphonsoKit` has its own
XCTest suite (SRS/progress-math/hearts ports, network client tests via an
injected requester closure — no real network in tests). Lint, typecheck,
Vitest, Playwright, and the Swift package's tests are all wired into CI
(`.github/workflows/ci.yml`) on every PR and push to `main` (the Swift job
runs on a macOS runner):

```sh
bun run lint         # ESLint
bunx tsc --noEmit    # TypeScript
bun run test         # Vitest (src/lib/*.test.ts)
bun run test:e2e     # Playwright (e2e/*.spec.ts)
swift test --package-path ios/LearnWithAlphonsoKit   # or, on Windows, ios/LearnWithAlphonsoKit/swift-test.ps1
```

## Assets

See `LESSON_ASSETS.md` for the complete list of assets needed for all 300 lessons (audio, images, icons, animations).

## Deployment

`LESSON_SESSION_SECRET` (server-only, see `src/lib/lesson-session.server.ts`)
and `ai_rate_limits`/`ai_usage` quota tables must exist in the linked
Supabase project _and_ `LESSON_SESSION_SECRET` must be set in **both** the
deployment host's env vars _and_ as a `supabase secrets set` value for the
`complete-lesson` Edge Function (same value on both sides), or lesson
completion fails closed for web and/or iOS respectively. See
`.env.example` for the full required-env list. No migration or Edge
Function change is live until it's explicitly pushed/deployed — see
ARCHITECTURE.md's "Known rough edges" section.

## Audit

A full codebase audit (security, architecture, accessibility, content,
performance, UX, testing) is kept locally, not committed to this repo —
see README.md's Documentation section for why.
