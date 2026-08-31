# English Buddy App — Comprehensive Audit Report

**Date:** 2026-08-31
**Auditor:** Opencode (automated full-stack audit)
**Scope:** Security, architecture, accessibility, content, performance, UX, testing, maintainability

---

## Executive Summary

The app is a well-designed mobile-first English learning platform built on TanStack Start + Supabase + Lovable AI Gateway. It has strong visual polish and solid authentication, but **critical gaps in content depth, spaced repetition, testing, and accessibility** prevent it from being production-ready for serious learners.

| Category | Score (1-10) | Verdict |
|---|---|---|
| **Security** | 7/10 | Good basics; missing rate limiting, input hardening |
| **Architecture** | 6/10 | Clean but monolithic content, no SRS, duplicate clients |
| **Accessibility** | 3/10 | No ARIA, no keyboard nav, no screen reader support |
| **Content** | 2/10 | Only 24 lessons total; massive gaps at A2-C1 |
| **Performance** | 7/10 | Good SSR, but 38 unused shadcn components bloat bundle |
| **UX** | 5/10 | Polished shell; missing review, streaks, hearts UI |
| **Testing** | 0/10 | Zero tests of any kind |
| **Maintainability** | 5/10 | TypeScript + good structure, but no docs or tests |

---

## 1. SECURITY AUDIT

### 1.1 What's Good
- **Auth middleware** properly validates Supabase JWT on all protected routes
- **RLS policies** enabled on all tables (per migration 3)
- **Server-side admin client** isolated in `client.server.ts` (service role key not exposed to client)
- **AI quota system** prevents abuse: 60 chat / 60 STT / 80 TTS per day via atomic `consume_ai_quota` RPC
- **Zod validation** on all server function inputs (`completeLessonSchema`, `mergeSchema`, `setCefrLevel`)
- **`VITE_` prefix** used correctly for client-safe keys; `SUPABASE_SERVICE_ROLE_KEY` not in `.env`

### 1.2 Issues Found

| Severity | Issue | Location |
|---|---|---|
| **HIGH** | No rate limiting on API routes beyond daily AI quota. An attacker could spam `/api/chat` 60 times in 1 second, exhausting a user's daily quota. | `src/routes/api/chat.ts` |
| **HIGH** | `LOVABLE_API_KEY` checked at runtime (`process.env.LOVABLE_API_KEY`) — if missing, returns 500 with generic message, but no graceful degradation | `src/routes/api/chat.ts:10` |
| **MEDIUM** | `lessonId` validated only by length (`z.string().min(1).max(100)`) — no format/pattern check. Could inject arbitrary text stored in DB | `src/lib/sync.functions.ts:86` |
| **MEDIUM** | `completeLessonRemote` trusts client-sent `correct` and `total` values — a malicious client could claim perfect scores without answering. Server should validate against actual question data. | `src/lib/sync.functions.ts:96-97` |
| **MEDIUM** | No CSRF protection on server functions beyond the Bearer token (acceptable for SPA, but worth noting) | Global |
| **LOW** | Duplicate Supabase client creation across `client.ts`, `auth-middleware.ts`, `ai-quota.server.ts` — each creates its own `isNewSupabaseApiKey` check. Could drift out of sync. | Multiple files |
| **LOW** | `mergeGuestProgress` allows merging up to 500 completed lessons and 90 activity dates — no rate limiting on merge calls | `src/lib/sync.functions.ts:300` |
| **INFO** | Google OAuth via Lovable Cloud Auth — no direct key management needed, but dependency on Lovable's infra | `src/integrations/lovable/index.ts` |

### 1.3 Recommendations
1. Add per-minute rate limiting to API routes (e.g., 10 req/min per user for chat)
2. Add `z.string().regex(/^[a-z0-9_-]+$/i)` pattern validation to `lessonId`
3. Server-side lesson answer validation: store correct answers in DB or validate against curriculum data
4. Consolidate Supabase client creation into a single shared module

---

## 2. ARCHITECTURE AUDIT

### 2.1 Current Structure
```
Foundation: TanStack Start (SSR) + React 19 + Vite 8 + Nitro
Styling: Tailwind v4 + shadcn/ui (New York) + Framer Motion
State: Zustand (client) + TanStack Query (server)
Backend: Supabase (PostgreSQL + Auth + RPC)
AI: Gemini 3.6 Flash (chat) + GPT-4o-mini (TTS/STT) via Lovable Gateway
```

### 2.2 Issues Found

| Severity | Issue | Detail |
|---|---|---|
| **HIGH** | All 24 lessons hardcoded in TypeScript | No database content, no CMS, no way to add lessons without code changes |
| **HIGH** | `generatedUnits()` function exists but is NEVER called | 150 potential generated lessons (30 per level) sit unused in `lesson-bank.ts` |
| **HIGH** | No spaced repetition system | Completed lessons show checkmarks forever; no review queue, no SRS scheduling |
| **MEDIUM** | Duplicate code across Supabase client modules | `isNewSupabaseApiKey` and `createSupabaseFetch` duplicated in 3+ files |
| **MEDIUM** | `recharts` dependency installed but unused | Adds ~200KB to bundle for nothing |
| **MEDIUM** | 38 shadcn/ui components installed, ~10 actually used | Bundle bloat from unused components (accordion, calendar, chart, carousel, command, etc.) |
| **LOW** | No service worker / offline support | All content requires network; lessons fail offline |
| **LOW** | `useStreakFreeze` server function exists but has no UI trigger | Server logic is complete but no button in any route calls it |
| **LOW** | Hearts system half-implemented | Hearts decrement, refill timer set, but no "out of hearts" blocking UI |
| **INFO** | File-based routing via TanStack Router — clean and conventional | |

### 2.3 Recommendations
1. **Activate the lesson bank**: Import `generatedUnits()` into `curriculum.ts` and merge with manually-written units
2. **Add spaced repetition**: Create a `review_items` table with SRS fields (ease_factor, interval, next_review, repetitions)
3. **Move content to database**: Migrate lessons from TypeScript to Supabase tables for non-code updates
4. **Remove unused dependencies**: `recharts`, unused shadcn components
5. **Complete the hearts/streak-freeze UI**: Add blocking screen when hearts = 0, add freeze button in profile

---

## 3. CONTENT AUDIT

### 3.1 Current Lesson Count

| Level | Units | Lessons | Questions/Lesson | Total Questions |
|---|---|---|---|---|
| **A1** | 3 (u1-u3) | 12 | 8 | 96 |
| **A2** | 2 (u4-u5) | 4 | 6 | 24 |
| **B1** | 2 (u6-u7) | 4 | 6 | 24 |
| **B2** | 1 (u8) | 2 | 6 | 12 |
| **C1** | 1 (u9) | 2 | 6 | 12 |
| **TOTAL** | **9** | **24** | — | **168** |

### 3.2 Generated Lesson Bank (UNUSED)

| Level | Packs | Items/Pack | Potential Lessons (5q each) |
|---|---|---|---|
| A1 | 6 | 25 | 30 |
| A2 | 6 | 25 | 30 |
| B1 | 6 | 25 | 30 |
| B2 | 6 | 25 | 30 |
| C1 | 6 | 25 | 30 |
| **TOTAL** | **30** | **150** | **150** |

### 3.3 Critical Content Gaps

1. **A1 is the only level with adequate content** (12 lessons). A2-C1 are severely underserved.
2. **No listening/speaking exercises** — only MC and fill-in-blank (reading/writing skills only).
3. **No conversation practice in lessons** — the `/converse` route exists but is separate from the learning path.
4. **Lesson inconsistency**: A1 lessons have 8 questions; A2-C1 have 6. No standardized length.
5. **No grammar explanations** — just one-line explanations per question. No teaching, only testing.
6. **No vocabulary lists** — words appear only in context of questions.
7. **No cultural context** — all content is language-only, no cultural notes.
8. **No progression indicators** — users don't know what they'll learn next.

### 3.4 Expansion Plan: 60+ Lessons Per Band

**Target: 60 lessons per CEFR level × 5 levels = 300 total lessons**

| Level | Current | Target | New Lessons Needed | New Units Needed |
|---|---|---|---|---|
| A1 | 12 | 60 | 48 | ~10 |
| A2 | 4 | 60 | 56 | ~12 |
| B1 | 4 | 60 | 56 | ~12 |
| B2 | 2 | 60 | 58 | ~12 |
| C1 | 2 | 60 | 58 | ~12 |
| **TOTAL** | **24** | **300** | **276** | **~58** |

**Lesson structure per level (recommended 12 units × 5 lessons each):**

#### A1 — Beginner (60 lessons)
| Unit | Title | Lesson Topics |
|---|---|---|
| 1 | Everyday Basics | Greetings, Introductions, Numbers & Time, Small Talk, Politeness |
| 2 | The Daily Routine | Morning Habits, At Work, Free Time, Evening & Sleep, Weekly Activities |
| 3 | Polite Requests | Please & Thank You, At a Café, Asking Directions, Making Plans, Phone Basics |
| 4 | Family & People | Family Members, Describing People, Relationships, Jobs, Nationalities |
| 5 | Food & Drink | Meals, Fruits & Vegetables, Ordering Food, At the Restaurant, Cooking Verbs |
| 6 | My Home | Rooms, Furniture, At the Office, In the Garden, Housework |
| 7 | Shopping | Clothes, Sizes & Colours, At the Market, Bargaining, Returns & Exchanges |
| 8 | Travel | At the Airport, On the Plane, At the Hotel, Sightseeing, Emergencies |
| 9 | Health & Body | Body Parts, At the Doctor, Medicine, Exercise, Feelings & Emotions |
| 10 | Technology | Phone & Internet, Apps, Social Media, Computer Basics, Email |
| 11 | Weather & Nature | Seasons, Weather Words, Animals, Plants, The Environment |
| 12 | Review & Consolidation | Mixed Review 1-5, Weak Areas Focus, Speed Challenge, Final Test |

#### A2 — Elementary (60 lessons)
| Unit | Title | Lesson Topics |
|---|---|---|
| 1 | Past Tense Mastery | Regular Past, Irregular Past, Negative Past, Questions, Time Markers |
| 2 | Storytelling | Sequencing, Dialogue Narration, Fairy Tales, News Reports, Personal Stories |
| 3 | Comparisons | Comparatives, Superlatives, As...As, Modifiers, Preferences |
| 4 | Future Plans | Will, Going To, Present Continuous, Predictions, Schedules |
| 5 | Modals of Ability | Can/Could, May/Might, Have To, Be Able To, Permission |
| 6 | Describing Places | Towns, Buildings, Directions, Maps, Countries & Cultures |
| 7 | Shopping & Services | Prices, Sizes, Complaints, Services, Online Shopping |
| 8 | Travel & Transport | Tickets, Timetables, Complaints, Car Rental, Public Transport |
| 9 | Work & Study | Jobs, Skills, Education, Applications, Daily Tasks |
| 10 | Health & Wellness | Symptoms, Appointments, Medication, Fitness, Diet |
| 11 | Entertainment | Movies, Music, Books, Sports, Hobbies |
| 12 | Review & Consolidation | Mixed Review, Weak Areas, Speed Challenge, Final Test |

#### B1 — Intermediate (60 lessons)
| Unit | Title | Lesson Topics |
|---|---|---|
| 1 | Opinions & Debate | Agreeing, Disagreeing, Hedging, Persuasion, Discussion |
| 2 | Conditionals | First, Second, Third, Mixed, Inversion |
| 3 | Email & Writing | Formal Tone, Structure, Complaints, Proposals, Follow-ups |
| 4 | Meetings & Calls | Turn-taking, Clarification, Summarizing, Negotiation, Presentations |
| 5 | Phrasal Verbs | Common Verbs, Work Phrasal Verbs, Travel Phrasal Verbs, Slang, Idioms |
| 6 | Relative Clauses | Who/Which/That, Defining, Non-defining, Reduced, Advanced |
| 7 | Passive Voice | All Tenses, Questions, Reporting, Causatives, Get-Passive |
| 8 | Reported Speech | Statements, Questions, Commands, Mixed, Advanced |
| 9 | News & Media | Headlines, Bias, Opinion Pieces, Statistics, Interviews |
| 10 | Environment | Climate, Pollution, Solutions, Debate, Activism |
| 11 | Technology & Society | AI, Privacy, Social Media, Digital Divide, Innovation |
| 12 | Review & Consolidation | Mixed Review, Weak Areas, Speed Challenge, Final Test |

#### B2 — Upper Intermediate (60 lessons)
| Unit | Title | Lesson Topics |
|---|---|---|
| 1 | Nuance & Precision | Hedging, Qualifying, Precision Vocabulary, Formality, Register |
| 2 | Advanced Linking | Contrast, Cause/Effect, Addition, Concession, Sequence |
| 3 | Word Formation | Suffixes, Prefixes, Root Words, Confusables, Collocations |
| 4 | Essay Structure | Introduction, Body, Conclusion, Cohesion, Academic Style |
| 5 | Debate & Argument | Claim/Support, Rebuttal, Evidence, Rhetoric, Logical Fallacies |
| 6 | Business English | Meetings, Negotiations, Presentations, Reports, Correspondence |
| 7 | Science & Research | Methodology, Findings, Journals, Peer Review, Data Description |
| 8 | Culture & Society | Traditions, Diversity, Global Issues, Arts, Philosophy |
| 9 | Advanced Grammar | Inversion, Cleft Sentences, Subjunctive, Ellipsis, Fronting |
| 10 | Idiomatic Language | Idioms, Proverbs, Collocations, Fixed Expressions, Slang |
| 11 | Creative Writing | Narrative, Descriptive, Persuasive, Informative, Style |
| 12 | Review & Consolidation | Mixed Review, Weak Areas, Speed Challenge, Final Test |

#### C1 — Advanced (60 lessons)
| Unit | Title | Lesson Topics |
|---|---|---|
| 1 | Academic Register | Formal Verbs, Nominalisation, Hedging, Citation Language, Abstracts |
| 2 | Complex Structures | Inversion, Cleft Sentences, Subjunctive, Advanced Relative Clauses |
| 3 | Precise Vocabulary | Synonyms, Antonyms, Connotation, Denotation, Nuance |
| 4 | Discourse Management | Topic Shift, Summarizing, Signposting, Transition, Framing |
| 5 | Professional Communication | Boardroom, Legal, Medical, Technical, Cross-cultural |
| 6 | Literature & Style | Tone, Mood, Figurative Language, Rhetoric, Literary Analysis |
| 7 | Current Affairs | Politics, Economics, Technology, Environment, Social Issues |
| 8 | Advanced Idioms | Business Idioms, Academic Idioms, Phrasal Verbs, Proverbs |
| 9 | Research Writing | Literature Review, Methodology, Results, Discussion, Abstract |
| 10 | Presentation Skills | Structure, Delivery, Visual Aids, Q&A, Persuasion |
| 11 | Critical Thinking | Analysis, Evaluation, Synthesis, Argumentation, Logic |
| 12 | Review & Consolidation | Mixed Review, Weak Areas, Speed Challenge, Final Test |

---

## 4. SPACED REPETITION SYSTEM (SRS) AUDIT

### 4.1 Current State
**There is NO spaced repetition system.** The app has:
- `lesson_completions` table — stores best score per lesson (upsert on conflict)
- `answersByLesson` in Zustand — tracks `{correct, total}` per lesson
- Once a lesson shows a checkmark, it's never revisited

### 4.2 What Needs to Be Built

#### Database Schema
```sql
-- New table: review_items
CREATE TABLE review_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  question_id text NOT NULL,
  ease_factor float DEFAULT 2.5,  -- SM-2 algorithm
  interval integer DEFAULT 1,      -- days until next review
  repetitions integer DEFAULT 0,   -- successful reviews in a row
  next_review date NOT NULL,       -- when to review next
  last_review date,
  correct_streak integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, lesson_id, question_id)
);

-- Index for efficient review queue queries
CREATE INDEX idx_review_items_due ON review_items(user_id, next_review);
```

#### SM-2 Algorithm Implementation
```
Quality rating (0-5):
  0 = complete blackout
  1 = wrong answer
  2 = wrong but remembered after seeing answer
  3 = correct with difficulty
  4 = correct with hesitation
  5 = perfect, instant recall

If quality >= 3 (correct):
  repetitions += 1
  if repetitions == 1: interval = 1
  if repetitions == 2: interval = 6
  else: interval = round(interval * ease_factor)
  ease_factor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  ease_factor = max(1.3, ease_factor)
else (incorrect):
  repetitions = 0
  interval = 1

next_review = today + interval
```

#### UI Components Needed
1. **Review Queue** — new route `/review` showing due items
2. **Review Session** — same lesson player but filtered to due questions
3. **Due Counter Badge** — on the learn page, show number of items due for review
4. **Review Statistics** — progress chart showing items learned vs due
5. **Lesson Completion Flow** — after completing a lesson, automatically create review items for missed/wrong questions

#### Integration Points
- `completeLessonRemote` → after saving, insert/update `review_items` for each question
- Learn page → show "Review" tab with due count
- `lesson.$id.tsx` → after checking answer, update SRS data locally
- New server function: `fetchReviewQueue` — returns questions due for review
- New server function: `submitReview` — updates SRS data after review

---

## 5. ACCESSIBILITY AUDIT

### 5.1 Current State
**Accessibility is severely lacking.** The app is visually polished but functionally inaccessible.

### 5.2 Issues Found

| Severity | Issue | WCAG | Location |
|---|---|---|---|
| **CRITICAL** | No skip-to-content link | 2.4.1 | `__root.tsx` |
| **CRITICAL** | No ARIA landmarks (nav, main, etc.) | 1.3.1 | Global |
| **CRITICAL** | Lesson nodes use `<div>` instead of `<button>` or `<a>` with proper roles | 4.1.2 | `learn.tsx:78` |
| **CRITICAL** | No focus management in lesson player | 2.4.3 | `lesson.$id.tsx` |
| **HIGH** | No `aria-label` on interactive elements (close button is `✕` with only `aria-label`) | 1.1.1 | `lesson.$id.tsx:121` |
| **HIGH** | Progress bar has no accessible label | 1.3.1 | `learn.tsx:166` |
| **HIGH** | Answer feedback not announced to screen readers | 4.1.3 | `lesson.$id.tsx:197` |
| **HIGH** | No keyboard navigation for MC choices (space/enter to select) | 2.1.1 | `lesson.$id.tsx:149` |
| **MEDIUM** | No `prefers-reduced-motion` support | 2.3.3 | Global (Framer Motion) |
| **MEDIUM** | Color contrast issues: `text-ink-soft/70` and `text-ink-soft/80` may fail 4.5:1 ratio | 1.4.3 | Global |
| **MEDIUM** | No visible focus indicator on buttons | 2.4.7 | Global |
| **MEDIUM** | Tab buttons in level switcher have no `role="tablist"`/`role="tab"` | 4.1.2 | `learn.tsx:131` |
| **LOW** | No `lang` attribute on `<html>` element | 3.1.1 | `__root.tsx` |
| **LOW** | Images (if any added) would need `alt` text | 1.1.1 | N/A currently |

### 5.3 Recommendations
1. Add `<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>` in root layout
2. Wrap lesson content in `<main id="main">` landmark
3. Add `role="tablist"` to level switcher, `role="tab"` to each button
4. Add `aria-live="polite"` to answer feedback area
5. Add `role="progressbar"` with `aria-valuenow` to progress bars
6. Implement focus trap in lesson player (focus should stay in lesson)
7. Add `prefers-reduced-motion: reduce` media query to disable animations
8. Ensure all text meets 4.5:1 contrast ratio (check `text-ink-soft/70` against `bg-surface`)
9. Add keyboard event handlers: Enter/Space to select choices, Escape to close
10. Add `aria-current="step"` to current lesson in the path

---

## 6. PERFORMANCE AUDIT

### 6.1 Current State
- **SSR via TanStack Start** — good for initial load
- **Vite 8** — modern build tool
- **Tailwind v4** — efficient CSS
- **Framer Motion** — adds ~40KB to bundle

### 6.2 Issues Found

| Severity | Issue | Impact |
|---|---|---|
| **HIGH** | `recharts` dependency imported but unused — ~200KB gzipped | Bundle bloat |
| **MEDIUM** | 38 shadcn/ui components installed, ~10 used | ~150KB unused code |
| **MEDIUM** | `cmdk` (command palette) installed but unused | ~30KB |
| **MEDIUM** | `vaul` (drawer) installed but unused | ~15KB |
| **MEDIUM** | `embla-carousel-react` installed but unused | ~20KB |
| **LOW** | No image optimization (no images currently, but future-proofing) | — |
| **LOW** | No service worker for offline caching | — |

### 6.3 Recommendations
1. Remove `recharts` from `package.json`
2. Import only used shadcn components (remove unused from `ui/` directory)
3. Remove `cmdk`, `vaul`, `embla-carousel-react` if not planned
4. Add lazy loading for lesson player: `React.lazy(() => import('./lesson.$id'))`
5. Consider adding a service worker for lesson content caching

---

## 7. UX AUDIT

### 7.1 Current Strengths
- Beautiful warm color palette (parchment, moss, ember)
- Mobile-first design (430px max-width)
- Nice micro-interactions (Framer Motion)
- Clear progress indicators
- Gamification elements (XP, streaks, hearts, leagues, achievements)

### 7.2 Issues Found

| Severity | Issue | Detail |
|---|---|---|
| **HIGH** | No way to review completed lessons | Once done, lessons are locked to "done" state |
| **HIGH** | No "out of hearts" experience | Hearts decrement but no blocking/paywall |
| **HIGH** | No streak freeze usage UI | Server function exists but no button |
| **MEDIUM** | No friend add/search UI | Friendship tables exist but no UI |
| **MEDIUM** | No dark mode toggle | CSS defines `.dark` theme but no switch |
| **MEDIUM** | No lesson preview/description before starting | Users click a node and jump straight in |
| **MEDIUM** | No audio pronunciation in lessons | TTS exists for conversation but not lessons |
| **LOW** | No achievement notification (toast) on unlock | Achievements show on finish screen only |
| **LOW** | No social sharing of progress | — |
| **LOW** | No onboarding flow for new users | Placement test prompt is good but minimal |

### 7.3 Recommendations
1. **Add review tab** on learn page with due items counter
2. **Add hearts blocking UI** — modal when hearts = 0 with refill timer
3. **Add streak freeze button** in profile or as a pop-up when streak would break
4. **Add lesson preview** — show topic, difficulty, estimated time before starting
5. **Add TTS pronunciation** for key words in lessons
6. **Add dark mode toggle** in profile/settings
7. **Add friend search/add** UI using existing friendship tables
8. **Add onboarding tutorial** — 3-4 screens explaining XP, streaks, hearts

---

## 8. TESTING AUDIT

### 8.1 Current State
**Zero tests exist.** No test files, no test framework, no test scripts.

### 8.2 What's Needed

| Priority | Type | Coverage Target |
|---|---|---|
| **P0** | Unit tests for SRS algorithm | `sync.functions.ts`, `progress.ts` |
| **P0** | Unit tests for lesson bank generator | `lesson-bank.ts` |
| **P1** | Integration tests for server functions | `completeLessonRemote`, `fetchProgress` |
| **P1** | Component tests for lesson player | `lesson.$id.tsx` |
| **P2** | E2E tests for critical flows | Login → Placement → Lesson → Review |
| **P2** | Accessibility tests | axe-core integration |

### 8.3 Recommended Stack
- **Vitest** (fast, Vite-native)
- **React Testing Library** (component tests)
- **Playwright** (E2E tests)
- **axe-core** (accessibility testing)

---

## 9. DOCUMENTATION AUDIT

### 9.1 Current State
- `README.md` — Basic project readme, no architecture docs
- `AGENTS.md` — Only Lovable connection warnings
- `src/routes/README.md` — Routing conventions (good)
- `.lovable/plan.md` — Feature build plan

### 9.2 Missing Documentation
- Architecture overview
- Database schema documentation
- API documentation
- Deployment guide
- Contributing guidelines
- Lesson content structure guide
- SRS algorithm documentation
- Accessibility guidelines
- Testing guide

---

## 10. PRIORITY ACTION PLAN

### Phase 1: Content Expansion (Week 1-2)
1. Activate `generatedUnits()` in curriculum.ts
2. Write additional manually-written lessons to reach 60 per level
3. Standardize lesson length (8 questions per lesson)
4. Add lesson metadata (estimated time, difficulty, topics)

### Phase 2: Spaced Repetition (Week 2-3)
1. Create `review_items` database table
2. Implement SM-2 algorithm
3. Build review queue UI
4. Integrate with lesson completion flow
5. Add due items counter on learn page

### Phase 3: Accessibility (Week 3-4)
1. Add skip links, ARIA landmarks, focus management
2. Add keyboard navigation
3. Add screen reader announcements
4. Add `prefers-reduced-motion` support
5. Fix color contrast issues

### Phase 4: Testing & Polish (Week 4-5)
1. Add Vitest + React Testing Library
2. Write unit tests for core logic
3. Add E2E tests for critical flows
4. Remove unused dependencies
5. Update all documentation

---

## Appendix: File-by-File Security Notes

| File | Notes |
|---|---|
| `.env` | Safe — all keys are publishable/client-side |
| `src/lib/sync.functions.ts` | Zod validation good; trust boundary issue on `correct`/`total` |
| `src/routes/api/chat.ts` | Rate limit needed; LOVABLE_API_KEY runtime check |
| `src/routes/api/tts.ts` | Same rate limit concern |
| `src/routes/api/stt.ts` | Same rate limit concern |
| `src/integrations/supabase/auth-middleware.ts` | Good — proper JWT verification |
| `src/integrations/supabase/client.server.ts` | Good — service role key server-only |
| `src/lib/progress.ts` | Client-only store, no security concern |
| `src/data/curriculum.ts` | Hardcoded content, no injection risk |
| `src/data/placement.ts` | Hardcoded, no risk |
