# English Buddy App — Codebase Audit Report (Refresh)

**Date:** 2026-09-13
**Auditor:** Claude Code (full codebase index + manual review, not a doc-only pass)
**Supersedes:** the 2026-08-31 audit below is stale on several facts (AI provider
stack, SRS status, content activation) — this refresh re-verifies everything
against the current code and git history rather than trusting prior docs.
**Scope:** Security, architecture, accessibility, content, performance, UX,
testing, tooling/CI, documentation

---

## Executive Summary

The app has matured significantly since the last audit: most of that
document's "critical" architecture gaps are now closed — the generated
lesson bank is wired into the curriculum, a working SM-2 spaced-repetition
system exists end-to-end (`review_items` table + `review.functions.ts` +
`/review` route), lesson choices are real `<button>` elements, a friends
feature shipped with a correctly-designed `SECURITY DEFINER` RPC, and a real
AI-quota bypass was patched (migration `20260910000000`).

What's newly notable:

- **The AI provider stack has completely changed** and neither `AUDIT.md`
  (old) nor `AGENTS.md` reflected it until this pass: chat now calls
  **NVIDIA NIM** directly, TTS/STT call **Deepgram** directly. The "Lovable
  Gateway / Gemini / GPT-4o-mini" description in the old audit is wrong.
- **A real trust-boundary bug survived two content cycles**: `completeLessonRemote`
  accepted client-reported `correct`/`total` with no server-side check that
  the lesson even exists or that `total` matches its real question count.
  **Fixed in this session** — see §1.3.
- **Lint had silently drifted to 949 problems** (mostly Prettier formatting),
  with no CI to catch it. **Fixed in this session** via `npm run format`
  — down to 12 pre-existing, mostly cosmetic issues.
- **Still zero tests and no CI pipeline** — this is the single biggest
  structural risk in the repo today.

| Category          | Score (1-10) | Verdict                                                                    |
| ----------------- | ------------ | -------------------------------------------------------------------------- |
| **Security**      | 7/10         | Quota bypass and score-forgery bug now fixed; still no rate limiting       |
| **Architecture**  | 7/10         | Lesson bank activated, real SRS, clean multi-course (en/fr) abstraction    |
| **Accessibility** | 4/10         | Semantic buttons + `lang` attr shipped; still no ARIA landmarks/focus mgmt |
| **Content**       | 6/10         | Bank generator makes ~300 lessons structurally reachable; depth unverified |
| **Performance**   | 6/10         | Unused deps (recharts, cmdk, vaul, embla) still dead weight                |
| **UX**            | 6/10         | Friends UI shipped; hearts-blocking / streak-freeze UI still missing       |
| **Testing**       | 0/10         | Zero tests of any kind, no test runner installed                           |
| **Tooling/CI**    | 3/10         | No `.github/workflows` at all; lint had drifted uncaught                   |
| **Documentation** | 6/10         | `AGENTS.md`/old `AUDIT.md` now corrected; keep re-verifying vs. code       |

---

## 1. SECURITY AUDIT

### 1.1 What's Good

- Auth middleware (`src/integrations/supabase/auth-middleware.ts`) validates
  a real Supabase JWT (3-segment check + `getClaims`) on every protected
  server function.
- RLS enabled across the schema; sensitive multi-row writes (friend invite
  acceptance, leaderboard, friends list) go through `SECURITY DEFINER` RPCs
  rather than relying on client-side inserts across users — this is the
  right pattern for "write the other side of a relationship."
- `supabaseAdmin` (service-role client) is lazily constructed behind a
  `Proxy` and explicitly commented as server-only; not imported from any
  route or `*.functions.ts` file that ships to the client bundle.
- `consume_ai_quota` bypass (caller-supplied limit) was already fixed in
  migration `20260910000000` — limits are now hardcoded server-side.
- Zod validation on every server function input.

### 1.2 Issues Found

| Severity                      | Issue                                                                                                                                                                                                                                                                            | Location                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **HIGH (fixed this session)** | `completeLessonRemote` trusted client-sent `correct`/`total` with no check the lesson exists or that `total` matches its real question count — a crafted request could mint XP for a nonexistent or short lesson.                                                                | `src/lib/sync.functions.ts`                                |
| **HIGH**                      | No per-minute rate limiting on `/api/chat`, `/api/tts`, `/api/stt` beyond the daily quota RPC — a burst of requests still costs real NVIDIA/Deepgram spend before the quota check fails it out, and there's no protection against a user's key being hammered in a short window. | `src/routes/api/{chat,tts,stt}.ts`                         |
| **MEDIUM**                    | `lessonId`/`item_key` validated only by length (`z.string().min(1).max(N)`), no character allow-list — low risk since these are only ever compared/stored, not interpolated into queries, but worth tightening for defense-in-depth.                                             | `src/lib/sync.functions.ts`, `src/lib/review.functions.ts` |
| **LOW**                       | `isNewSupabaseApiKey`/`createSupabaseFetch` duplicated near-verbatim in `client.ts`, `client.server.ts`, `auth-middleware.ts`, and again inline in `ai-quota.server.ts` — four copies that can drift.                                                                            | Multiple files                                             |
| **LOW**                       | `mergeGuestProgress` allows merging up to 500 completed lessons / 90 activity dates in one call with no rate limit on the endpoint itself (mitigated by only firing once per first sign-in, but not enforced server-side).                                                       | `src/lib/sync.functions.ts`                                |
| **INFO**                      | Secrets hygiene is good: `.env.example` documents server-only vs. `VITE_`-prefixed vars correctly, `.gitignore` excludes all `.env*`, no keys found committed.                                                                                                                   | Global                                                     |

### 1.3 Fix applied this session

`completeLessonRemote` now looks up the lesson via `getCourse(course).findLesson(lessonId)`
and rejects the request unless the lesson exists and `total` equals its real
question count, before computing XP or touching any table. This closes the
score-forgery gap without requiring a full redesign of the answer-submission
flow (which would need per-question answer submission to fully close the
"claim all correct" case — see Recommendation 1 below for that follow-up).

### 1.4 Recommendations

1. Follow-up: today's fix stops fabricated lesson IDs/lengths, but a client can still report `correct = total` truthfully-shaped for a real lesson without having answered it. Closing that fully requires submitting per-question answers to the server (or at minimum a signed session token issued at lesson-start) — worth scoping as a follow-on if score integrity matters for leaderboards/leagues.
2. Add per-minute rate limiting (e.g. a small token-bucket keyed by user id) in front of the three `/api/*` AI routes.
3. Consolidate the four copies of `isNewSupabaseApiKey`/`createSupabaseFetch` into one shared `src/integrations/supabase/fetch.ts`.
4. Add a regex allow-list to `lessonId`/`item_key` schemas.

---

## 2. ARCHITECTURE AUDIT

### 2.1 Current Structure (verified against code, not docs)

```
Foundation: TanStack Start (SSR) + React 19 + Vite 8 + Nitro
Styling:    Tailwind v4 + shadcn/ui (New York) + Framer Motion
State:      Zustand (client) + TanStack Query (server)
Backend:    Supabase (PostgreSQL + Auth + RLS + SECURITY DEFINER RPCs)
AI chat:    NVIDIA NIM (integrate.api.nvidia.com, OpenAI-compatible), model
            configurable via NVIDIA_CHAT_MODEL
AI voice:   Deepgram directly — Aura-2 for TTS, Nova-3 for STT
Content:    Two-course model (en/fr) via src/data/courses.ts, each course
            pairing hand-written units (curriculum.ts / curriculum-fr.ts)
            with a generator-produced bank (lesson-bank.ts / lesson-bank-fr.ts)
Extras:     An MCP server (src/lib/mcp) exposing get_my_progress,
            get_due_reviews, list_lessons, get_leaderboard over OAuth,
            forwarding the caller's token so RLS applies — well-scoped.
```

### 2.2 Issues Found

| Severity     | Issue                                                                                                                                                                        | Detail                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **RESOLVED** | ~~`generatedUnits()` never called~~                                                                                                                                          | Now called from `curriculum.ts:259` (and the French equivalent from `curriculum-fr.ts`) — the bank is live.                                 |
| **RESOLVED** | ~~No spaced repetition system~~                                                                                                                                              | `review_items` table + SM-2-style grading in `review.functions.ts`, surfaced at `/review`, wired into lesson completion via `recordMisses`. |
| **MEDIUM**   | Duplicate Supabase client bootstrap code across 4 files                                                                                                                      | See §1.2                                                                                                                                    |
| **MEDIUM**   | `recharts`, `cmdk`, `vaul`, `embla-carousel-react` still in `package.json` with zero usage outside their own unused `src/components/ui/*` wrapper files (confirmed via grep) | Bundle bloat, no functional benefit                                                                                                         |
| **LOW**      | `useStreakFreeze` server function has no UI trigger (button) anywhere in the routes                                                                                          | `src/lib/sync.functions.ts`                                                                                                                 |
| **LOW**      | Hearts decrement and set a refill timer, but no blocking "out of hearts" screen exists                                                                                       | UX/architecture overlap, see §7                                                                                                             |
| **INFO**     | File-based routing via TanStack Router remains clean; the en/fr course abstraction (`getCourse`) is a good pattern for adding more languages later.                          |                                                                                                                                             |

### 2.3 Recommendations

1. Remove the four confirmed-unused dependencies and their wrapper components.
2. Add the hearts-blocking modal and a streak-freeze trigger (both server-side logic already exists, only UI is missing).
3. Consider whether `review_items`/SRS integration should also feed the `/learn` due-count badge (verify current wiring before assuming it's complete).

---

## 3. CONTENT AUDIT

`lesson-bank.ts` is now 3,439 lines and `curriculum.ts` imports and appends
`generatedUnits()` per level, so the structural path to ~300 English lessons
(and a French equivalent via `lesson-bank-fr.ts`, currently smaller at 847
lines) exists and is active. This audit did **not** hand-count final lesson/
question totals per CEFR band or grade content quality/pedagogical accuracy
— that requires either running the generator and inspecting output or a
dedicated content review pass, which is worth doing explicitly rather than
assuming the target in `AGENTS.md` ("300 lessons, 60 per level") is fully
met just because the code path exists.

### 3.1 Recommendations

1. Run the generator and produce an actual per-level lesson/question count (don't trust the aspirational number in `AGENTS.md` without checking).
2. Spot-check generated question quality/uniqueness — `lesson-bank.ts`'s scale (3,400+ lines) makes manual review of everything impractical; sample a few units per level instead.
3. Confirm French content (`lesson-bank-fr.ts`, `curriculum-fr.ts`) is at parity or explicitly scoped as "coming later" in user-facing copy.

---

## 4. SPACED REPETITION (SRS) — now implemented

`review_items` (schema in migrations `20260908020628` and
`20260912040533`) tracks `ease`, `interval_days`, `repetitions`, `due_on`,
scoped per `(user_id, item_key, language)`. `review.functions.ts` implements:

- `recordMisses` — called after a lesson to seed review items for missed questions
- `fetchDueReviews` — due-today + overdue, oldest first, capped at 20
- `gradeReview` — SM-2-style: wrong answer resets ease/interval to 0 and increments `lapses`; correct answer grows the interval, retiring the item after 4 clean repetitions

This is a reasonable, working implementation. Not verified in this pass:
whether `/learn` surfaces a due-count badge, and whether `lesson.$id.tsx`
actually calls `recordMisses` on every wrong answer (confirm before assuming
full integration).

---

## 5. ACCESSIBILITY AUDIT

### 5.1 Current State

Improved since the old audit but still the weakest category for a
learning app that should support diverse users.

### 5.2 Issues Found

| Severity     | Issue                                                                                                                                                                                                             | Location                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **RESOLVED** | ~~Lesson nodes use `<div>` instead of `<button>`~~                                                                                                                                                                | `lesson.$id.tsx` now uses real `<button>` elements for MC choices and controls — keyboard nav (Tab/Enter/Space) works natively. |
| **RESOLVED** | ~~No `lang` attribute~~                                                                                                                                                                                           | `<html lang="en">` present in `__root.tsx`.                                                                                     |
| **CRITICAL** | No skip-to-content link, no `<main>` landmark                                                                                                                                                                     | `__root.tsx`                                                                                                                    |
| **HIGH**     | No `aria-live` region for answer feedback                                                                                                                                                                         | `lesson.$id.tsx`                                                                                                                |
| **HIGH**     | Level switcher in `learn.tsx` has no `role="tablist"`/`role="tab"` — note `src/components/SegmentedControl.tsx` _does_ implement this pattern correctly and is used on the league page, it's just not reused here | `learn.tsx`                                                                                                                     |
| **MEDIUM**   | No `prefers-reduced-motion` handling anywhere in the Framer Motion usage                                                                                                                                          | Global                                                                                                                          |
| **MEDIUM**   | No visible focus-ring audit performed; verify Tailwind defaults aren't suppressing `:focus-visible`                                                                                                               | Global                                                                                                                          |
| **LOW**      | No axe-core or other automated a11y check in CI (moot until CI exists)                                                                                                                                            | —                                                                                                                               |

### 5.3 Recommendations

1. Reuse `SegmentedControl` (already accessible) for the level switcher in `learn.tsx` instead of ad-hoc buttons — this alone would close the tablist finding for free.
2. Add a skip link + `<main id="main">` in `__root.tsx`.
3. Add `aria-live="polite"` to the answer-feedback element in `lesson.$id.tsx`.
4. Wrap Framer Motion transition props behind a `prefers-reduced-motion` media-query check (a small shared hook).

---

## 6. PERFORMANCE AUDIT

No change from the prior audit's findings — confirmed still accurate by
grep against current source:

| Severity   | Issue                                                                          | Confirmed |
| ---------- | ------------------------------------------------------------------------------ | --------- |
| **MEDIUM** | `recharts` installed, zero usage outside its own unused `ui/chart.tsx` wrapper | Yes       |
| **MEDIUM** | `cmdk`, `vaul`, `embla-carousel-react` same pattern                            | Yes       |
| **LOW**    | No service worker / offline support                                            | Yes       |

### Recommendations

Remove the four dependencies and their dead wrapper components; re-measure bundle size after.

---

## 7. UX AUDIT

Largely unchanged from the prior audit except:

- **RESOLVED**: friend add/search UI now exists (`profile.friends.tsx`, `invite.$inviterId.tsx`) backed by the `accept_friend_invite` RPC.
- Hearts-blocking UI and streak-freeze UI trigger are still missing (server logic complete, no UI — same finding as before, re-verified).

---

## 8. TESTING & CI AUDIT

### 8.1 Current State

**Zero tests exist** — no `*.test.*`/`*.spec.*` files anywhere in the repo,
no test runner in `package.json`. **No CI** — no `.github/workflows`
directory at all. This was silently confirmed as a real gap this session:
`npm run lint` had drifted to 949 problems (949 formatting errors from
Prettier, plus a few real ESLint findings) with nothing catching it before
merge. **Fixed this session** via `npm run format` (down to 12 pre-existing,
mostly cosmetic issues: 3 `no-explicit-any`, a missing `useEffect` dep, some
`react-refresh/only-export-components` warnings).

### 8.2 Recommendations (highest priority in this whole report)

1. Add a GitHub Actions workflow running `npm run lint` and a typecheck (`tsc --noEmit`) on every PR — this alone would have caught the formatting drift automatically.
2. Add Vitest and cover the pure logic first: SM-2 grading (`review.functions.ts`), XP/streak/league math and achievement thresholds (`sync.functions.ts`), and the lesson-bank generators.
3. Add one Playwright smoke test for the golden path: sign in → complete a lesson → see it in `/review`.

---

## 9. DOCUMENTATION AUDIT

- `AGENTS.md` previously described the wrong AI provider stack (Gemini/GPT-4o-mini via "Lovable Gateway") — the actual stack is NVIDIA NIM (chat) + Deepgram (TTS/STT) directly, correctly documented in `.env.example` but not in `AGENTS.md`. **Update `AGENTS.md`'s "Key Files"/overview section to match `.env.example`.**
- The prior `AUDIT.md` (now superseded by this file) had gone stale on SRS status, lesson-bank activation, and the AI stack within roughly two weeks of commits — a sign this doc needs to be re-verified against code each time it's read, not treated as ground truth.
- No architecture/database-schema/deployment docs exist beyond `AGENTS.md`, `README.md`, and `src/routes/README.md` (routing conventions, still good).

---

## 10. PRIORITY ACTION PLAN

### Immediate (done this session)

- [x] Fix `completeLessonRemote` trust-boundary gap
- [x] Clear Prettier/lint drift (949 → 12 problems)
- [x] Refresh this document against actual code state

### Next up

1. Add CI (lint + typecheck on PRs) — cheapest structural fix with the highest leverage.
2. Add rate limiting to the three AI API routes.
3. Reuse `SegmentedControl` for the `learn.tsx` level switcher; add skip link + `<main>` landmark.
4. Remove `recharts`/`cmdk`/`vaul`/`embla-carousel-react` and their dead wrapper components.
5. Stand up Vitest for SRS/XP/streak/achievement logic.
6. Update `AGENTS.md`'s AI-provider description to match `.env.example`.
7. Verify (don't assume) the `/learn` due-review badge and `recordMisses` integration are fully wired.
8. Scope per-question answer submission if leaderboard/league score integrity matters (closes the remaining, smaller trust-boundary gap noted in §1.4).
9. Hand-count actual lesson/question totals per CEFR level; don't rely on the aspirational "300 lessons" figure in `AGENTS.md`.
10. Add the hearts-blocking modal and streak-freeze UI trigger.

---

## Appendix: File-by-File Security Notes (re-verified)

| File                                           | Notes                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.env.example`                                 | Accurate and well-commented; correctly documents server-only vs. `VITE_`-prefixed vars and the NVIDIA/Deepgram provider switch |
| `src/lib/sync.functions.ts`                    | Zod validation good; trust-boundary gap on `completeLessonRemote` fixed this session                                           |
| `src/lib/review.functions.ts`                  | Zod validation good; SRS logic correctly scoped to the authenticated user + course                                             |
| `src/lib/friends.functions.ts`                 | Correctly delegates cross-user writes to a `SECURITY DEFINER` RPC rather than direct client inserts                            |
| `src/routes/api/chat.ts`                       | NVIDIA NIM call; quota-gated but not rate-limited                                                                              |
| `src/routes/api/tts.ts`, `stt.ts`              | Deepgram calls; same rate-limit gap                                                                                            |
| `src/integrations/supabase/auth-middleware.ts` | Good — proper JWT verification, rejects malformed/missing tokens                                                               |
| `src/integrations/supabase/client.server.ts`   | Good — service-role key lazily loaded, server-only by convention and comment                                                   |
| `src/lib/mcp/*`                                | OAuth-gated MCP tools that forward the caller's token so RLS applies — no admin client used, well-scoped                       |
| `src/data/curriculum.ts`, `courses.ts`         | Hardcoded/generated content, no injection risk; now the source of truth used to validate lesson completions server-side        |
