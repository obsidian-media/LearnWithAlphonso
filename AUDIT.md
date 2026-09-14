# English Buddy App — Codebase Audit Report (Refresh)

> **Update (2026-09-14):** a second, independent deep-dive audit ran across
> four angles in parallel (security, architecture/code-quality,
> performance/dependencies, accessibility/testing), each re-verifying this
> document's claims from scratch against current code rather than trusting
> it, plus a live check of the actual production Supabase project (this
> repo's `config.toml` had been pointing at the wrong project ref until
> fixed this session — see below). **Two migrations that had been merged to
> `main` for a day were never applied to production** (`ai_rate_limits`
> table, anon-execute revoke on friend RPCs) — both are now applied live.
> New findings not in the original report below are marked **(2026-09-14)**.
>
> **Security: clean bill.** No new exploitable vulnerability found;
> everything the original report called "fixed" was re-verified as
> genuinely fixed (rate limiting fires before every AI call, session-token
> HMAC verification is timing-safe and fails closed, RLS/SECURITY DEFINER
> grants are correct, no injection/XSS vectors, no leaked secrets).
>
> **Real gaps found this pass:**
>
> - **(2026-09-14, HIGH)** Auth form (`auth.tsx`) has no `<label>` elements
>   at all — email/password/display-name rely solely on `placeholder` text.
>   Fails WCAG 1.3.1/4.1.2.
> - **(2026-09-14, HIGH)** Locked lesson nodes in `learn.tsx` render as
>   unlabeled, non-focusable `<div>`s — invisible to screen-reader users,
>   unlike active/blocked nodes which use `Link`/`button` + `aria-label`.
> - **(2026-09-14, HIGH)** `SegmentedControl` uses `role="tablist"`/`"tab"`
>   with no arrow-key navigation — non-conformant to the WCAG APG tab
>   pattern it claims. The `learn.tsx` course switcher (English/French
>   toggle) has no ARIA state at all (`aria-pressed`/`aria-selected`
>   missing).
> - **(2026-09-14, MEDIUM)** `HeartsModal` has `role="dialog"`/
>   `aria-modal="true"` but no real focus trap, no focus-on-open, no
>   return-focus-on-close, no Escape handler.
> - **(2026-09-14, MEDIUM)** `completeLessonRemote` — the exact function
>   this document credits with fixing the trust-boundary bug — has **zero**
>   test coverage, as does `gradeReview` (SM-2 grading) in
>   `review.functions.ts`. Only the pure helper (`srs.ts`) is tested, not
>   the server functions that call it.
> - **(2026-09-14, MEDIUM)** `src/routes/api/{chat,tts,stt}.ts` forward the
>   raw upstream NVIDIA/Deepgram error body straight to the client on
>   failure, with inconsistent response shapes across the three routes.
> - **(2026-09-14, MEDIUM)** Live Supabase performance advisor: **20 RLS
>   policies across every table** re-evaluate `auth.uid()` per row instead
>   of once per query (fix: wrap as `(select auth.uid())`) — mechanical,
>   safe, not yet applied. One FK (`user_achievements.achievement_id`) has
>   no covering index.
> - **(2026-09-14, MEDIUM)** `courses.ts` eagerly bundles both full lesson
>   banks (English ~3,439 lines, French) into one chunk regardless of
>   active course — no code-splitting by course. `learn.tsx` also runs
>   unmemoized `O(units × completions)` filtering on every render.
> - **(2026-09-14, LOW)** `get_leaderboard()` uses a correlated subquery per
>   pooled user instead of a `JOIN`/`GROUP BY` — fine at today's row counts,
>   a rewrite candidate before real scale.
> - **(2026-09-14, LOW)** Duplicated `isNewSupabaseApiKey`/
>   `createSupabaseFetch` in 3 auto-generated files remains (acceptable —
>   those files are marked do-not-edit); duplicated `courseSchema`
>   `z.enum(["en","fr"])` in two files.
> - Dependencies, images, DB query patterns (no N+1), and TypeScript
>   strictness all re-verified clean. `bun audit`'s 16 vulnerabilities
>   (11 high/3 moderate/2 low) are unchanged and confirmed build-tooling-only
>   (`js-yaml` via eslint, `esbuild` via vite dev server, `browserslist`/
>   babel) — none reachable from a deployed request path.

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
question count, before computing XP or touching any table. **Update, later
the same session:** the remaining gap (a truthfully-shaped but unearned
`correct = total` claim) is also closed now — see §1.4 Recommendation 1.

### 1.4 Recommendations

1. ~~Follow-up: today's fix stops fabricated lesson IDs/lengths, but a client can still report `correct = total` truthfully-shaped for a real lesson without having answered it.~~ — done in two steps: `completeLessonRemote` now derives `correct` from claimed-missed question ids (real question membership required), and `startLessonSession` (`src/lib/lesson-session.server.ts`) issues a signed, 3-hour HMAC token when the lesson player mounts that `completeLessonRemote` now requires and verifies — proving a real session was opened, not just that the claimed question ids are real. **Needs `LESSON_SESSION_SECRET` set in the real deployment environment before this ships** (same category of gap as the pending-migrations issue).
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
- **Content quality (English only): was a real bug, not just repetition —
  fixed.** The "73 same-lesson duplicate prompts / 8 prompts repeated
  12-13x" finding traced back to 4 of 35 "pair"-kind packs in
  `lesson-bank.ts` (Animals, Shapes & Sizes, Parts of the Body, Hobbies)
  whose fixed prompt string had no `%s` placeholder, so the generator's
  `.replace("%s", clue)` silently no-op'd — every question in those packs
  showed the exact same generic prompt (`"This animal is a… ___"`) with
  the actual distinguishing clue never appearing anywhere except in the
  post-answer explanation. That's not cosmetic repetition, it's a
  functionally-unanswerable-except-by-guessing question. Fixed to
  interpolate the clue like the other 30 packs already did; same-lesson
  duplicates dropped 73 → 13 (the remainder are legitimate themed
  collocation-drill packs sharing a prompt on purpose), and course-wide
  repeats dropped 8 → 0. French's `lesson-bank-fr.ts` was already fully
  correct (all 12 packs template properly).

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

Genuinely blocked in this environment (missing credentials/access, or
needs your explicit sign-off before an agent should do it unprompted):

1. **Apply the pending Supabase migrations to the real linked project**
   (`project_id = "bsymmgscbvvlkcwhfmqy"` in `supabase/config.toml`) — no
   CI/deploy step runs `supabase db push`, so every migration in this repo
   is just a file until someone applies it by hand. **This blocks more than
   before**: on top of `ai_rate_limits`, the AI routes will now also 500
   without `LESSON_SESSION_SECRET` set in the deployment environment (see
   §1.4 #1). Neither is optional before this ships.
2. **Verify the `e2e` CI job actually goes green on its first real run** —
   couldn't be locally verified; this Windows sandbox's `bun run dev` never
   reached Vite's own startup logging across three attempts. Requires
   pushing the branch to trigger CI, which wasn't done without asking first.
3. Extend E2E/accessibility coverage to the `_authenticated` routes once a
   seeded test Supabase project + account exists for CI to sign in with.
4. Confirm whether the Boardroom repo's `TASK-078` (Lovable decoupling) is
   actually closed — `README.md`'s note was softened to only assert what
   this repo's code can confirm, rather than guess at that repo's state.
5. Set up branch protection requiring CI to pass / CODEOWNERS review —
   `.github/CODEOWNERS` and a PR template were added, but turning on
   enforcement is a repo-settings change affecting every future
   contributor, not made without asking.
6. Re-measure bundle size after the shadcn/deps removal — needs a working
   build, blocked by the same Windows path bug as `bun run dev`.
7. Uptime/cost alerting on the AI routes — needs hosting-platform access.

Open product/content decisions, not made unilaterally:

8. Decide whether to label French "in progress" in the course-switcher UI,
   or prioritize closing the content-depth gap with English (§3).
9. ~~Diversify template-prompt variety in the English lesson bank~~ — turned
   out to be a real bug (4 packs missing `%s` clue interpolation, making
   those questions guessable-only), not a diversity nice-to-have. Fixed
   (§3).
10. Decide whether `@lovable.dev/mcp-js`'s MCP surface (`/mcp`) is an
    intentional, supported feature or leftover scaffolding — shapes
    whether it gets documented/promoted or trimmed.
11. Rename the `.lovable` OAuth consent route/path — only after confirming
    nothing external (Supabase project settings, MCP client configs)
    hardcodes the current path.

Lower priority, not clearly worth it yet:

12. A jsdom + `@testing-library/react` setup for component/hook-level unit
    tests — only pure-function Vitest tests and browser-level Playwright
    tests exist today; add this only if a specific hook/component needs
    isolated testing Playwright can't reach.

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
