# Buddy Matching (Phase 3b: opt-in stranger matching) Implementation Plan

> Status (2026-10-09): implemented: server and web #244, iOS and Android #245; hardened in #248 and the demo account is kept out of the real pool by #265.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A learner can opt in to be matched with another learner of the same course and a similar level as a study buddy, on the server and the web (native in a follow-up PR), with guardrails that keep it a learning feature, not "random chat".

**Spec:** `docs/superpowers/specs/2026-10-06-study-together-design.md` Part 2 ("Opt-in matching"). **Owner decision 2026-10-07 (BACKLOG 0.0-ai):** minimum age 13 (App Store 13+), build 3b complete.

**Added in review (CodeRabbit):** a declared-age confirmation at join ("I'm 13 or older"): without it the server answers `age_required`; the app collects no birthdate, and Apple's guidelines name "verified or declared age" as the age-restriction mechanism.

**Why the guardrails (research 2026-10-07):** App Store guideline 1.2 (Feb 2026) says apps used *primarily* for "Chatroulette-style experiences, random or anonymous chat" do not belong on the App Store; Apple has not defined the terms. So: opt-in with an explanation; matched only by course and CEFR level within one step; never re-matched with a past buddy; preset messages only (no free text, Phase 5); only display name and progress visible; block and report on the buddy card; a server-side switch turns matching off for everyone without a release.

## Global Constraints

- Courses: `en`, `fr`, `es`. CEFR: `A1`, `A2`, `B1`, `B2`, `C1` (language_progress_cefr_valid); "within one step" = rank difference <= 1.
- `buddy_settings(id boolean PK CHECK (id), matching_enabled boolean NOT NULL DEFAULT true)`, one row, server-only (`-- client-grants: none`). Off = `UPDATE public.buddy_settings SET matching_enabled = false;` (documented in AGENTS and ARCHITECTURE).
- `buddy_pool(user_id PK -> auth.users ON DELETE CASCADE, course, cefr_level, joined_at)`; RLS; SELECT own row; exported via USER_ID_EXPORT_TABLES.
- Matching runs under one transaction-level advisory lock (`buddy:pool`) so two joiners cannot both take the same waiting learner; pairing itself still goes through `_create_buddy_pair` (per-person locks, block re-check), which now skips the friendship check for `source = 'match'` and deletes both people's pool rows.
- Never re-match: a candidate with ANY past `buddy_pairs` row with the caller is skipped. Never match across a block (either direction).
- New statuses: `waiting`, `left`, `not_waiting`, `matching_off`, `not_studying`. `get_my_buddy` gains `is_match boolean` (DROP + CREATE: the return type changes; re-grant).
- Every function SECURITY DEFINER, `SET search_path = public`, `SET timezone = 'UTC'`; no output column used unqualified.

## Review Focus

1. Two learners join at the same moment and a third is waiting -> exactly one pair, the other is `waiting` (pool lock).
2. A waiting learner pairs with a friend in the meantime -> the joiner does not get them (`_create_buddy_pair` re-checks under the per-person lock) and is put in the pool instead.
3. A blocked or past buddy is waiting -> never matched.
4. Matching switched off -> `matching_off`, nothing stored; a waiting learner can still leave.
5. A matched buddy is blocked from the card -> pair ends as `unfriended`, both see no buddy, and they are never matched again.

## Tasks

1. Wording + fixtures (statuses, pool intro, waiting line, find button, stop, matched label, course names) in `src/lib/buddy.ts` + fixtures + native copies; native wording tables gain the new statuses.
2. Migration `20261007120000_buddy_matching.sql` + static test + live proof (rolled back).
3. Server functions (`joinBuddyPool`, `leaveBuddyPool`, `getBuddyPool`; `MyBuddy.isMatch`), types, export.
4. Card: matching section in the no-buddy state; waiting state; "Matched learner" + block/report (SocialSafetyMenu) on a matched buddy; privacy line.
5. Ship: gate, docs, fresh review, PR, CI, merge, post-deploy probe, regenerate types; then the native PR.
