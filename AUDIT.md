# English Buddy App — Codebase Audit Report (Refresh)

**Date:** 2026-09-13
**Auditor:** Claude Code (full codebase index + manual review, not a doc-only pass)
**Supersedes:** the 2026-08-31 audit below is stale on several facts (AI provider
stack, SRS status, content activation) — this refresh re-verifies everything
against the current code and git history rather than trusting prior docs.
**Scope:** Security, architecture, accessibility, content, performance, UX,
testing, tooling/CI, documentation

> **Update (2026-09-13, same day):** items 1-5 of the priority action plan
> below were implemented immediately after this audit: CI (§8.2 #1), AI
> route rate limiting (§1.4 #2), a Vitest suite for SRS/XP/streak/league
> math (§8.2 #2 — see `src/lib/*.test.ts`), the `learn.tsx` level switcher
> now reuses `SegmentedControl` (§5.3 #1), and the four unused dependencies
> are removed (§6). The scores/tables below are left as originally written
> to preserve the audit as a point-in-time record — treat "Testing 0/10"
> and "No CI" as describing the _pre-fix_ state this document was written
> against, not the current one.

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
- **RESOLVED, same day:** all 10 priority-action-plan items below were
  implemented in follow-up commits, including CI, a Vitest suite, and a
  Playwright + axe-core E2E suite. See the "Update" note further down and
  §10 for what changed and what's still genuinely open.

**Superseded by the same-day follow-up work — this table describes the
state at first read, before any fix in this doc was applied.** Kept as a
point-in-time record; see §10 for what's true now.

| Category          | Score (1-10) at first read | Verdict at first read                                                      |
| ----------------- | -------------------------- | -------------------------------------------------------------------------- |
| **Security**      | 7/10                       | Quota bypass and score-forgery bug now fixed; still no rate limiting       |
| **Architecture**  | 7/10                       | Lesson bank activated, real SRS, clean multi-course (en/fr) abstraction    |
| **Accessibility** | 4/10                       | Semantic buttons + `lang` attr shipped; still no ARIA landmarks/focus mgmt |
| **Content**       | 6/10                       | Bank generator makes ~300 lessons structurally reachable; depth unverified |
| **Performance**   | 6/10                       | Unused deps (recharts, cmdk, vaul, embla) still dead weight                |
| **UX**            | 6/10                       | Friends UI shipped; hearts-blocking / streak-freeze UI still missing       |
| **Testing**       | 0/10                       | Zero tests of any kind, no test runner installed                           |
| **Tooling/CI**    | 3/10                       | No `.github/workflows` at all; lint had drifted uncaught                   |
| **Documentation** | 6/10                       | `AGENTS.md`/old `AUDIT.md` now corrected; keep re-verifying vs. code       |

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

| Severity     | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Detail                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RESOLVED** | ~~`generatedUnits()` never called~~                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Now called from `curriculum.ts:259` (and the French equivalent from `curriculum-fr.ts`) — the bank is live.                                                                                     |
| **RESOLVED** | ~~No spaced repetition system~~                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `review_items` table + SM-2-style grading in `review.functions.ts`, surfaced at `/review`, wired into lesson completion via `recordMisses`.                                                     |
| **RESOLVED** | ~~Duplicate Supabase client bootstrap code across 4 files~~                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Consolidated the one safe-to-edit copy (`ai-quota.server.ts`) into `src/integrations/supabase/fetch.ts`; the other 3 are auto-generated files left alone on purpose, see that file's comment.   |
| **RESOLVED** | ~~`recharts`, `cmdk`, `vaul`, `embla-carousel-react` unused~~                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Removed, along with discovering the entire `src/components/ui/` directory (42 files) was _also_ unused — zero imports outside itself. Gone too, plus every dependency that only existed for it. |
| **RESOLVED** | ~~`useStreakFreeze` server function has no UI trigger~~ — turned out not to be "missing UI," it was a design gap: the function only decremented `streak_freezes` and did nothing else, while `completeLessonRemote`'s own streak math already auto-consumes a freeze on a 2-day gap independent of whether this was ever called. Removed rather than left as dead-and-misleading code, since it was unused (zero call sites) and wiring a UI button to it would have let users burn a freeze for zero benefit. | `src/lib/sync.functions.ts`                                                                                                                                                                     |
| **RESOLVED** | ~~Hearts decrement and set a refill timer, but no blocking "out of hearts" screen exists~~                                                                                                                                                                                                                                                                                                                                                                                                                     | `HeartsModal` + `useCountdown`, wired into `learn.tsx`'s lesson nodes.                                                                                                                          |
| **INFO**     | File-based routing via TanStack Router remains clean; the en/fr course abstraction (`getCourse`) is a good pattern for adding more languages later.                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                 |

### 2.3 Recommendations

1. ~~Remove the four confirmed-unused dependencies and their wrapper components~~ — done, and expanded once the whole `ui/` directory turned out to be dead too.
2. ~~Add the hearts-blocking modal~~ — done. `useStreakFreeze` was removed instead of given a UI trigger — see the RESOLVED row above.
3. ~~Consider whether `review_items`/SRS integration should also feed the `/learn` due-count badge~~ — verified `recordMisses` wiring is correct and added the badge.

---

## 3. CONTENT AUDIT

**Update (2026-09-13):** the three recommendations below have now been run
for real, against the actual `curriculum`/`curriculumFr` bundles (not the
generator source) — see the table in `AGENTS.md`'s Content Structure
section for the authoritative counts.

- **English: 534 lessons, 2,718 questions** across A1-C1 — well past the
  "300 lessons" figure `AGENTS.md` previously claimed (that number
  undercounted, not overcounted).
- **French: 125 lessons, 625 questions** — a complete 5-level course, but
  less than a quarter of English's depth. Not a placeholder/broken course,
  just meaningfully thinner. Whether to label it "in progress" in the
  course-switcher UI (`learn.tsx`'s `COURSES.map`) or prioritize closing
  the gap is a product call, not made in this pass.
- **Content integrity (English + French): no structural corruption** — 0
  malformed answer options, 0 answers pointing outside their own
  choices/bank, across all 3,343 questions in both courses.
- **Content quality (English only): heavy template reuse.** 73 instances of
  the exact same question prompt appearing twice within the same lesson,
  and 8 distinct prompts (e.g. `"This animal is a… ___"`, `"Point to
your… ___"`) each repeated 12-13 times across the whole course — a
  templated vocab-drill generator reusing the same sentence frame for many
  different words. Not a bug, but confirms the earlier "generic templated
  questions, no teaching, only testing" content note. French did not show
  this pattern (0 same-lesson duplicates, 0 prompts repeated >5x).

### 3.1 Recommendations

1. ~~Run the generator and produce an actual per-level lesson/question count~~ — done, see above and `AGENTS.md`.
2. ~~Spot-check generated question quality/uniqueness~~ — done; structurally sound, but template-prompt diversity in the English bank is worth a content pass if pedagogical variety matters.
3. Confirm French content parity or explicitly scope it as "coming later" in user-facing copy — still open, product decision.

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
- **RESOLVED**: hearts-blocking UI now exists (`HeartsModal`).
- `useStreakFreeze` removed rather than given a UI trigger — see §2.2's RESOLVED row.

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

**Update (2026-09-13, later the same day): all 10 items below are done.**
See the individual git commits from this session for what changed in each.

1. ~~Add CI (lint + typecheck on PRs)~~ — done, plus a `test` step once Vitest landed (#5).
2. ~~Add rate limiting to the three AI API routes~~ — done (`ai_rate_limits` table + RPC).
3. ~~Reuse `SegmentedControl` for the `learn.tsx` level switcher; add skip link + `<main>` landmark~~ — done, plus `aria-live` feedback and `MotionConfig reducedMotion="user"`.
4. ~~Remove `recharts`/`cmdk`/`vaul`/`embla-carousel-react` and their dead wrapper components~~ — done, expanded to the entire `ui/` directory once it turned out to be fully unused (see §2.2).
5. ~~Stand up Vitest for SRS/XP/streak/achievement logic~~ — done (`src/lib/srs.ts`, `src/lib/progress-math.ts`, 24+ tests).
6. ~~Update `AGENTS.md`'s AI-provider description to match `.env.example`~~ — done.
7. ~~Verify the `/learn` due-review badge and `recordMisses` integration are fully wired~~ — verified `recordMisses` was already correct; the due-count badge was missing and is now added.
8. ~~Scope per-question answer submission if leaderboard/league score integrity matters~~ — done: `completeLessonRemote` now derives `correct` from claimed-missed question ids instead of trusting a raw number.
9. ~~Hand-count actual lesson/question totals per CEFR level~~ — done (English 534, French 125 — see §3).
10. ~~Add the hearts-blocking modal and streak-freeze UI trigger~~ — hearts modal done; `useStreakFreeze` removed instead (see §2.2).

### Still open, discovered along the way

1. Decide whether to label French "in progress" in the course-switcher UI, or prioritize closing the content-depth gap with English (§3).
2. Diversify template-prompt variety in the English lesson bank if pedagogical repetition matters (§3, 73 same-lesson duplicate prompts).
3. **Verify the new `e2e` CI job (Playwright + axe-core, `playwright.config.ts` / `e2e/*.spec.ts`) actually goes green on its first real run** — it could not be locally verified: this Windows sandbox's `bun run dev` never reached Vite's own startup logging across three attempts, consistent with (or compounding) the already-documented Windows-only build bug. If it's red, that's the first thing to look at, not a regression in the app.
4. Extend E2E/accessibility coverage to the `_authenticated` routes (learn, lesson, review, profile, league, converse) once a seeded test Supabase project + account exists for CI to sign in with — the current suite deliberately only covers the 5 routes that render without one.
5. A jsdom + `@testing-library/react` setup still doesn't exist for component/hook-level unit tests (only pure-function Vitest tests and now browser-level Playwright tests) — not clearly worth adding on top of Playwright unless a specific hook/component needs isolated testing Playwright can't reach.
6. **Apply the pending Supabase migrations to the real linked project** (`project_id = "bsymmgscbvvlkcwhfmqy"` in `supabase/config.toml`) — no CI/deploy step runs `supabase db push`, so every migration in this repo (including this session's `ai_rate_limits`, GDPR fixes, and RPC-grant fixes) is just a file until someone applies it. Until then, `consumeQuota()` will 500 on every chat/TTS/STT call once this code ships.
7. Rewrite `README.md` and reconcile `LESSON_ASSETS.md` — both still describe the pre-session state (shadcn/ui, old lesson counts, npm-based setup).

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
