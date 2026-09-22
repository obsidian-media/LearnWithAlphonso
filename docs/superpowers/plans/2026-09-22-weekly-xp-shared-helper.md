# Weekly XP Shared Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the weekly-XP computation currently inlined in `get_leaderboard` into a standalone, `week_start`-parameterized SQL function, so Teams and the Season Ladder (both built in separate plans on top of this one) can reuse the exact same logic instead of reimplementing it.

**Architecture:** One new PL/pgSQL function, `public.weekly_xp(_user_id uuid, _week_start date)`, added in a migration. `get_leaderboard` is refactored (`CREATE OR REPLACE FUNCTION`) to call it instead of its own inline subquery. No client-facing behavior change — `get_leaderboard`'s signature, return shape, and computed values are identical before and after; this is a pure internal refactor.

**Tech Stack:** PostgreSQL / PL/pgSQL (Supabase migration), no TypeScript/Swift changes in this plan.

**Spec:** `docs/superpowers/specs/2026-09-22-deeper-gamification-design.md` ("Shared building blocks" section)

## Global Constraints

- Migrations live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`.
- Every `SECURITY DEFINER` function in this project (except two legacy ones predating the convention) does `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated` — `weekly_xp` is called only from other `SECURITY DEFINER` functions, not directly by clients, so it does NOT need its own `GRANT EXECUTE TO authenticated` — only `service_role` and the calling functions (which run as the function owner) need access. Grant `EXECUTE` to nothing extra; leave it at Postgres's default (owner + superuser), matching how internal-only helper functions are handled elsewhere in this schema.
- Week boundary: Monday-start ISO week — `_week_start` is always the Monday of the week in question, and the range covered is `[_week_start, _week_start + 7)`.
- Migrations need explicit human go-ahead before being applied to the live Supabase project (this plan's tasks only create the migration file and verify it via a real CI-deployed preview or local review — actually merging to `main`, which triggers the live deploy, requires that go-ahead separately).

---

### Task 1: Add `weekly_xp` function and refactor `get_leaderboard` to use it

**Files:**
- Create: `supabase/migrations/<timestamp>_weekly_xp_helper.sql` (run `ls supabase/migrations | sort | tail -1` first to pick a timestamp safely after the current latest)
- Reference (read-only, do not modify): `supabase/migrations/20260922020000_leaderboard_course_aware_xp.sql` — this is `get_leaderboard`'s current, already-correct body (fixed earlier in the V3 backlog work to sum `language_progress.xp` for all-time ranking); the new migration's `get_leaderboard` replacement must preserve that fix exactly, only replacing the weekly-XP subquery.

**Interfaces:**
- Produces: `public.weekly_xp(_user_id uuid, _week_start date) RETURNS integer` — callable by any other `SECURITY DEFINER` function in this schema (Teams' and Season Ladder's plans depend on this exact name and signature).

- [ ] **Step 1: Read the current `get_leaderboard` body to copy forward exactly**

Run: `grep -n "CREATE OR REPLACE FUNCTION public.get_leaderboard" -A 55 supabase/migrations/20260922020000_leaderboard_course_aware_xp.sql`

Confirm the all-time branch reads `COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp WHERE lp.user_id = pool.id), 0)` and the weekly branch reads `COALESCE((SELECT SUM(a.xp_earned)::int FROM public.activity_days a WHERE a.user_id = pool.id AND a.day >= wk), 0)`. These are the two pieces being preserved/extracted.

- [ ] **Step 2: Write the migration file**

```sql
-- Extracts the weekly-XP computation out of get_leaderboard into a
-- standalone, week_start-parameterized function -- V4 candidate #7
-- (deeper gamification, docs/superpowers/specs/2026-09-22-deeper-
-- gamification-design.md) needs the exact same "how much XP did this
-- user earn in a given week" logic for Teams' weekly scoring and the
-- Season Ladder's cohort resolution (including resolving *past*
-- weeks, not just the current one). Parameterizing by an explicit
-- _week_start (rather than always "now") is what makes both possible
-- without three copies of this subquery drifting apart over time.
--
-- Range covered: [_week_start, _week_start + 7) -- a caller passing
-- the Monday of any ISO week gets that week's Mon-through-Sun total.
CREATE OR REPLACE FUNCTION public.weekly_xp(_user_id uuid, _week_start date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.xp_earned)::int, 0)
  FROM public.activity_days a
  WHERE a.user_id = _user_id
    AND a.day >= _week_start
    AND a.day < _week_start + 7;
$$;

-- get_leaderboard now calls weekly_xp instead of inlining the same
-- subquery -- behavior is unchanged (same date range, same column),
-- this is a pure refactor. The all-time branch (language_progress.xp
-- sum) is untouched, copied forward exactly from the previous
-- version.
CREATE OR REPLACE FUNCTION public.get_leaderboard(_scope text, _period text)
RETURNS TABLE (user_id uuid, display_name text, country text, avatar_seed text, xp integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_country text;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.country INTO my_country FROM public.profiles p WHERE p.id = me;

  RETURN QUERY
  WITH pool AS (
    SELECT p.id, p.display_name, p.country, p.avatar_seed
    FROM public.profiles p
    WHERE
      CASE _scope
        WHEN 'friends' THEN p.id = me OR p.id IN (
          SELECT f.friend_id FROM public.friendships f
          WHERE f.user_id = me AND f.status = 'accepted'
        )
        WHEN 'country' THEN my_country IS NOT NULL AND p.country = my_country
        ELSE true
      END
  ), scores AS (
    SELECT pool.id,
           pool.display_name,
           pool.country,
           pool.avatar_seed,
           CASE WHEN _period = 'weekly' THEN
             public.weekly_xp(pool.id, wk)
           ELSE
             COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp
                       WHERE lp.user_id = pool.id), 0)
           END AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$$;
```

- [ ] **Step 3: Verify the migration file is syntactically well-formed**

Run: `cat supabase/migrations/<timestamp>_weekly_xp_helper.sql` and re-read it end to end — confirm there is exactly one `CREATE OR REPLACE FUNCTION public.weekly_xp` and one `CREATE OR REPLACE FUNCTION public.get_leaderboard`, both terminated with `$$;`, no stray `BEGIN`/`END` mismatches. This repo has no local Postgres to run the migration against directly — real verification happens in Step 4.

- [ ] **Step 4: Open a PR and let CI verify the migration applies (do not merge yet)**

```bash
git checkout -b feat/weekly-xp-shared-helper main
git add supabase/migrations/<timestamp>_weekly_xp_helper.sql
git commit -m "feat: extract weekly_xp helper out of get_leaderboard

V4 #7 (deeper gamification) needs the same weekly-XP computation for
Teams and the Season Ladder, parameterized by an explicit week_start
rather than hardcoded to \"now\". Pure refactor -- get_leaderboard's
behavior is unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push -u origin feat/weekly-xp-shared-helper
gh pr create --title "V4 #7 foundation: extract weekly_xp shared helper" --body "$(cat <<'EOF'
## Summary
Extracts the weekly-XP computation out of get_leaderboard into a standalone, week_start-parameterized function, per docs/superpowers/specs/2026-09-22-deeper-gamification-design.md's "Shared building blocks" section. Pure refactor -- get_leaderboard's signature/behavior is unchanged; this just gives Teams and the Season Ladder (separate follow-up plans) a single reusable implementation instead of three copies.

## Test plan
- [ ] CI (lint-and-typecheck, deno-tests, e2e) -- no client code changed, this just confirms nothing else broke
- [ ] Migration not yet applied to the live project -- needs explicit go-ahead before merge, same as every other production change in this repo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Watch the PR's CI checks (`gh pr checks <number> --watch`). This PR touches no TypeScript/Swift, so the meaningful signal is that CI still passes at all (nothing about this migration should break lint/typecheck/tests, since no application code changed) — treat any failure as a real problem, not noise.

- [ ] **Step 5: Report status, do not merge**

This task's deliverable is the open, CI-verified PR — merging it (which deploys the migration to the live Supabase project) needs the human's explicit go-ahead, per this repo's established convention for every production/migration change. Stop here and report the PR URL.
