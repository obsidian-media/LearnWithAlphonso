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
| `supabase/functions/start-lesson-session/` | Deno Edge Function: issues the HMAC session token `complete-lesson` requires — the iOS equivalent of `startLessonSession` (a web-only TanStack server function iOS can't call) |
| `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift` | SwiftUI lesson player: overview → vocab (via `deriveVocab`) → quiz → finish; calls `start-lesson-session` then `complete-lesson` on finish |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/VocabDerivation.swift` | Port of `deriveVocab` (`src/lib/vocab.ts`) — vocabulary is derived from a lesson's own questions, not separate content; stock-photo lookup (`VOCAB_IMAGES`) not ported yet |
| `.github/workflows/ios-release.yml`        | Manual (`workflow_dispatch`) signed archive + `.ipa` export via an App Store Connect API key — see that file's header comment for the required repo secrets |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConversationClient.swift` | Calls this repo's own `/api/chat`, `/api/tts`, `/api/stt` (same backend the web app uses, same Supabase access token) — not AlphonsoEcosystem's Cloud Voice backend; see the type's doc comment |
| `ios/LearnWithAlphonso/Sources/ConversationView.swift` | Scenario picker + hold-to-talk conversation screen (record → `/api/stt` → `/api/chat` → `/api/tts` → play) |
| `supabase/functions/grade-review/`         | Deno Edge Function: 1:1 port of `gradeReview` (re-derives review-answer correctness server-side) for iOS |
| `ios/LearnWithAlphonso/Sources/ReviewQueueView.swift` | SM-2 review queue screen — due items one at a time, grading via `grade-review` |
| `ios/LearnWithAlphonso/Sources/HectorView.swift` | **Pro-only** ($9.99/mo): AlphonsoCompanion's Hector tutor persona via Cloud Voice — a genuinely separate account/sign-in (different Supabase project). Additional mode alongside, not a replacement for, `ConversationView`'s free standalone scenarios. Gated by `EntitlementStore.isPro` (RevenueCat SDK, currently a Test Store key — see the "RevenueCat" note below) |
| `ios/LearnWithAlphonso/Sources/EntitlementStore.swift` | Wraps the RevenueCat SDK — sole source of truth for `isPro`, purchase, and restore. See the "RevenueCat" note below |
| `ios/LearnWithAlphonso/Sources/PaywallView.swift`  | Subscribe/restore UI for any Pro-gated feature (currently just Hector) |
| `ios/LearnWithAlphonso/Sources/HectorSession.swift` | Cloud Voice sign-in (email OTP) + device enrollment state, mirrors `Session.swift` |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/DeviceEnrollmentClient.swift` | Registers this device with Cloud Voice (`POST /v1/voice/devices/enroll`) — required once per `HectorSession` before `TutorConversationClient` will accept requests |
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
(`.github/workflows/ci.yml`) on every PR and push to `main` (both Swift
jobs run on a macOS runner) — `ios-app-build` additionally runs a real
`xcodebuild` of the `LearnWithAlphonso` app target itself, the only
compile verification that exists for it (no local Xcode/macOS in this
development environment):

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
deployment host's env vars _and_ as a `supabase secrets set` value for
`complete-lesson` and `start-lesson-session` (same value on both sides;
`grade-review` does not need `LESSON_SESSION_SECRET`), or lesson
completion fails closed for web and/or iOS respectively. See
`.env.example` for the full required-env list. No migration or Edge
Function change is live until it's explicitly pushed/deployed — see
ARCHITECTURE.md's "Known rough edges" section. **Current state (2026-09-19,
verify before trusting): all migrations applied, all three Edge Functions
deployed and current (`complete-lesson` v5, `start-lesson-session` v1,
`grade-review` v1).**

**RevenueCat (Pro/"Hector" gating):** `EntitlementStore` (`ios/LearnWithAlphonso/Sources/EntitlementStore.swift`)
wraps the RevenueCat SDK (`Purchases.configure` in `LearnWithAlphonsoApp.init`);
every Pro-gated view reads only `EntitlementStore.isPro`/`.packages`, never
touches `Purchases` directly. Currently configured with a **Test Store**
API key (`AppConfig.revenueCatAPIKey`) and no offering created yet in the
RevenueCat dashboard, so `PaywallView` shows a "not available yet" state
rather than a real purchase button — expected, not a bug. Before a real
launch: create the App Store Connect subscription product ("Alphonso
Pro", $9.99/month), connect it in RevenueCat, create an Offering there
with a Package, and swap `AppConfig.revenueCatAPIKey` for the production
(non-`test_`-prefixed) public key. The entitlement identifier gating
Hector is `AppConfig.proEntitlementID` ("pro").

## Audit

A full codebase audit (security, architecture, accessibility, content,
performance, UX, testing) is kept locally, not committed to this repo —
see README.md's Documentation section for why.
