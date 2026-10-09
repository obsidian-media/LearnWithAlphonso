# Team Mission (server + web) Implementation Plan

> Status (2026-10-09): implemented (#230, types #231). Native: iOS #233, Android #234.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every team of 2+ members gets a weekly shared mission (members x 4 lessons); reaching it pays each contributing member +50 XP once, shown as a progress card on the team screen and the Learn page.

**Architecture:** All computation lives in one SECURITY DEFINER SQL function `get_team_mission()` (lazy resolution as a side effect of the read, the same shape as `get_my_team`'s weekly bonus: no cron). A thin TS module parses the row and owns the copy; a server function exposes it; a card renders it. A shared fixtures JSON pins the row->view-model contract so iOS and Android (Phase 2) reuse it byte for byte.

**Tech Stack:** Postgres/Supabase migration, TanStack Start server function, React + react-query, vitest.

**Scope note (spec: `docs/superpowers/specs/2026-10-06-study-together-design.md`, Part 1):** The "Team player" badge needs the achievements catalog on all three platforms (`src/data/achievements.ts`, iOS content export, Android), so it ships in Phase 2 with iOS/Android. Phase 1 ships the XP reward and a `team_mission_rewards` record the badge can key off.

**Worktree:** `<worktree>`, branch `feat/team-mission` (node_modules is a junction to the main checkout: `rmdir` it before removing the worktree).

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261006150000_team_missions.sql` | tables, helper + resolve + read functions, grants |
| `src/lib/team-mission-migration.test.ts` | pins the migration's constants, grants, guards |
| `src/lib/team-mission.ts` | `TeamMission` type, `parseTeamMission`, copy helpers |
| `src/lib/team-mission.test.ts` | unit tests + fixture contract |
| `src/lib/team-mission.fixtures.json` | row -> view-model contract (reused by iOS/Android in Phase 2) |
| `src/lib/teams.functions.ts` | add `getTeamMission` server function |
| `src/lib/teams.functions.test.ts` | test for it |
| `src/components/TeamMissionCard.tsx` + `.test.tsx` | the card |
| `src/routes/_authenticated/teams_.$teamId.tsx` (+ test) | card on the team screen |
| `src/routes/_authenticated/learn.tsx` | compact card on Learn |
| `src/integrations/supabase/types.ts` | hand-added table + function entries |
| `src/lib/account.functions.ts` | `team_mission_rewards` into the GDPR export |
| `src/routes/privacy.tsx` | one line |
| docs | ARCHITECTURE, CHANGELOG, README, AGENTS, BACKLOG (local) |

---

### Task 1: Migration test (RED)

**Files:**
- Create: `src/lib/team-mission-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006150000_team_missions.sql";

describe("team missions migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const code = () => sql().replace(/--[^\n]*/g, "");

  it("runs after the latest privilege migration", () => {
    expect(FILE.slice(0, 14) > "20261006140000").toBe(true);
  });

  it("keeps the spec's constants: 4 lessons per member, minimum 2 members, +50 XP", () => {
    expect(code()).toMatch(/members\s*\*\s*4\b/i);
    expect(code()).toMatch(/members\s*>=\s*2\b/i);
    expect(code()).toMatch(/\b50\b/);
  });

  it("team_missions is server-only: marker, no client grant, RLS on", () => {
    expect(sql()).toMatch(/--\s*client-grants:\s*none\s+public\.team_missions\b/i);
    expect(code()).toMatch(/ALTER TABLE public\.team_missions ENABLE ROW LEVEL SECURITY/i);
    expect(code()).not.toMatch(/GRANT[^;]*ON public\.team_missions[^;]*TO[^;]*\b(authenticated|anon)\b/i);
  });

  it("team_mission_rewards lets a member read only their own rows (export needs it) and nothing else", () => {
    expect(code()).toMatch(
      /CREATE POLICY team_mission_rewards_select_own ON public\.team_mission_rewards FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = user_id\)/i,
    );
    expect(code()).toMatch(/GRANT SELECT ON public\.team_mission_rewards TO authenticated/i);
    expect(code()).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.team_mission_rewards[^;]*TO[^;]*authenticated/i);
    expect(code()).not.toMatch(/\banon\b/i);
  });

  it("counts a member's lessons only from when they joined, and only this week", () => {
    expect(code()).toMatch(/GREATEST\(\s*_wk::timestamptz\s*,\s*tm\.joined_at\s*\)/i);
    expect(code()).toMatch(/lc\.completed_at\s*<\s*\(_wk \+ 7\)::timestamptz/i);
  });

  it("pays at most once per team-week with an atomic guard", () => {
    expect(code()).toMatch(/SET rewarded_at = now\(\)[\s\S]*?rewarded_at IS NULL/i);
    expect(code()).toMatch(/IF NOT FOUND THEN\s+RETURN;/i);
  });

  it("only the public read function is executable by clients; helpers are not", () => {
    for (const fn of ["_team_mission_count(uuid, date, uuid)", "_resolve_team_mission(uuid, date)"]) {
      const escaped = fn.replace(/[()]/g, "\\$&");
      expect(code()).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC, anon, authenticated`, "i"));
    }
    expect(code()).toMatch(/REVOKE ALL ON FUNCTION public\.get_team_mission\(\) FROM PUBLIC, anon/i);
    expect(code()).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_team_mission\(\) TO authenticated/i);
  });

  it("every function is SECURITY DEFINER with a pinned search_path", () => {
    const functions = code().match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi) ?? [];
    expect(functions).toHaveLength(3);
    for (const fn of functions) {
      expect(fn).toMatch(/SECURITY DEFINER/i);
      expect(fn).toMatch(/SET search_path = public/i);
    }
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
```

- [ ] **Step 2: Run it, expect RED**

Run: `cd <worktree> && bunx prettier --write src/lib/team-mission-migration.test.ts && bun run test src/lib/team-mission-migration.test.ts`
Expected: FAIL (ENOENT: the migration file does not exist).

- [ ] **Step 3: Commit**

```bash
git add src/lib/team-mission-migration.test.ts
git commit -m "test(team-mission): pin the migration (red)"
```

---

### Task 2: The migration (GREEN)

**Files:**
- Create: `supabase/migrations/20261006150000_team_missions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Team missions (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1).
--
-- Each team of 2+ members gets one shared goal per ISO week (Monday, UTC): members x 4 lessons. The target is
-- snapshotted on the first read of the week, so a member who joins later raises it only from next week. Progress is
-- the number of lessons (one lesson_completions row per user per lesson, so replays cannot farm it) first completed
-- this week by CURRENT members, counted from max(week start, the member's joined_at) so join-hopping cannot farm it.
-- When the total reaches the target, every member with at least one contributing lesson gets +50 XP on their active
-- course, once per team-week (atomic guard on team_missions.rewarded_at), resolved lazily on the next read (the previous
-- week is resolved too, so a mission finished and never viewed is still paid). No cron, same pattern as get_my_team's
-- weekly bonus. The "Team player" badge ships with the iOS/Android catalogs (Phase 2).
--
-- client-grants: none public.team_missions
-- (read only through get_team_mission(); team_mission_rewards is readable by its owner for the data export.)
--
-- ROLLBACK:
--   DROP FUNCTION public.get_team_mission();
--   DROP FUNCTION public._resolve_team_mission(uuid, date);
--   DROP FUNCTION public._team_mission_count(uuid, date, uuid);
--   DROP TABLE public.team_mission_rewards;
--   DROP TABLE public.team_missions;
-- (XP already granted is not taken back.)

CREATE TABLE public.team_missions (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  member_count integer NOT NULL CHECK (member_count >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  PRIMARY KEY (team_id, week_start)
);
ALTER TABLE public.team_missions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.team_missions TO service_role;

CREATE TABLE public.team_mission_rewards (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, week_start, user_id)
);
ALTER TABLE public.team_mission_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_mission_rewards_select_own ON public.team_mission_rewards FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.team_mission_rewards TO authenticated;
GRANT ALL ON public.team_mission_rewards TO service_role;

-- Lessons first completed in the week [_wk, _wk + 7) by current members of _team, each counted from the later of the week
-- start and that member's joined_at. _user NULL = the whole team, otherwise just that member.
CREATE OR REPLACE FUNCTION public._team_mission_count(_team uuid, _wk date, _user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.lesson_completions lc
  JOIN public.team_members tm ON tm.user_id = lc.user_id AND tm.team_id = _team
  WHERE (_user IS NULL OR lc.user_id = _user)
    AND lc.completed_at >= GREATEST(_wk::timestamptz, tm.joined_at)
    AND lc.completed_at < (_wk + 7)::timestamptz;
$$;

-- Pays the mission for _team / _wk if it exists, is unpaid and the target is met. Safe to call repeatedly and
-- concurrently: the UPDATE ... rewarded_at IS NULL is the single winner.
CREATE OR REPLACE FUNCTION public._resolve_team_mission(_team uuid, _wk date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.team_missions%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.team_missions WHERE team_id = _team AND week_start = _wk;
  IF NOT FOUND OR m.rewarded_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF public._team_mission_count(_team, _wk) < m.target THEN
    RETURN;
  END IF;

  UPDATE public.team_missions SET rewarded_at = now()
  WHERE team_id = _team AND week_start = _wk AND rewarded_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.team_mission_rewards (team_id, week_start, user_id, xp)
  SELECT _team, _wk, tm.user_id, 50
  FROM public.team_members tm
  WHERE tm.team_id = _team
    AND public._team_mission_count(_team, _wk, tm.user_id) >= 1
  ON CONFLICT DO NOTHING;

  UPDATE public.language_progress lp
  SET xp = lp.xp + r.xp
  FROM public.team_mission_rewards r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.team_id = _team AND r.week_start = _wk
    AND lp.user_id = r.user_id AND lp.language = p.active_language;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_mission()
RETURNS TABLE (
  team_id uuid,
  week_start date,
  week_end date,
  target integer,
  total integer,
  my_count integer,
  member_count integer,
  status text,
  reward_xp integer,
  rewarded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  my_team uuid;
  members integer;
  m public.team_missions%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO members FROM public.team_members tm WHERE tm.team_id = my_team;

  -- A mission finished last week and never viewed is still paid.
  PERFORM public._resolve_team_mission(my_team, wk - 7);

  SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;
  IF NOT FOUND AND members >= 2 THEN
    INSERT INTO public.team_missions (team_id, week_start, target, member_count)
    VALUES (my_team, wk, members * 4, members)
    ON CONFLICT DO NOTHING;
    SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;
  END IF;

  IF m.team_id IS NULL THEN
    RETURN QUERY SELECT my_team, wk, wk + 7, 0, 0, 0, members, 'needs_members'::text, 0, false;
    RETURN;
  END IF;

  PERFORM public._resolve_team_mission(my_team, wk);
  SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;

  RETURN QUERY
  SELECT my_team, wk, wk + 7, m.target,
         public._team_mission_count(my_team, wk),
         public._team_mission_count(my_team, wk, me),
         m.member_count,
         CASE WHEN public._team_mission_count(my_team, wk) >= m.target THEN 'complete' ELSE 'in_progress' END,
         50,
         (m.rewarded_at IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public._team_mission_count(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolve_team_mission(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_mission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_mission() TO authenticated;
```

- [ ] **Step 2: Format + run the migration test and the privilege guards**

Run: `bun run test src/lib/team-mission-migration.test.ts src/lib/migration-grants.test.ts src/lib/rls-client-writes.test.ts`
Expected: all PASS (the new-table guard finds the marker for `team_missions` and the grant for `team_mission_rewards`).

- [ ] **Step 3: Mutation-check the guards** (one at a time, restore after each; each must turn a test red)

1. change `members * 4` to `members * 5`;
2. change `members >= 2` to `members >= 1`;
3. remove `rewarded_at IS NULL` from the UPDATE guard;
4. remove `GREATEST(_wk::timestamptz, tm.joined_at)` (use `_wk::timestamptz`);
5. change `GRANT SELECT ON public.team_mission_rewards` to `GRANT ALL ...`;
6. delete the `REVOKE ALL ON FUNCTION public._resolve_team_mission` line;
7. delete `SET search_path = public` from one function.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261006150000_team_missions.sql
git commit -m "feat(team-mission): tables and lazy-resolved get_team_mission()"
```

---

### Task 3: Prove the SQL behaves (rolled-back live transaction)

The tests above pin the text; this proves the logic. Run through the Supabase MCP `execute_sql` (project `qhcjpfbxfcltjbiuknyt`) as ONE transaction that ends in `ROLLBACK`, so nothing persists. It defines the functions inside the transaction (transactional DDL), seeds two throwaway users, and checks six scenarios by calling the function as each user (`SET LOCAL request.jwt.claim.sub`).

- [ ] **Step 1: Run the scenario script** (paste the migration's function bodies first, inside the same transaction, then):

```sql
-- inside BEGIN; ... the migration SQL ... then:
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'tm-a-probe', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'tm-b-probe', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'tm-c-probe', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
-- profiles are created by the signup trigger; make sure language_progress rows exist for the XP check
INSERT INTO public.language_progress (user_id, language, xp, league_tier)
SELECT id, 'en', 0, 'bronze' FROM auth.users WHERE email LIKE 'tm-%-probe' ON CONFLICT DO NOTHING;
INSERT INTO public.teams (id, name, created_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'tm test team', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.team_members (team_id, user_id, joined_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', now() - interval '30 days');
-- 1) one member: needs_members
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
SELECT 'one-member' AS scenario, status, target FROM public.get_team_mission();
-- 2) second member joins: target is members*4 = 8 on the first read after joining (the 1-member read made no row)
INSERT INTO public.team_members (team_id, user_id, joined_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', now() - interval '30 days');
SELECT 'two-members' AS scenario, status, target, total, my_count FROM public.get_team_mission();
-- 3) lessons: a1 completes 5 this week, a2 completes 3 -> total 8 -> complete + paid
INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, language, completed_at)
SELECT '00000000-0000-0000-0000-0000000000a1', 'tm-l' || g, 8, 8, 10, 'en', now() FROM generate_series(1,5) g;
INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, language, completed_at)
SELECT '00000000-0000-0000-0000-0000000000a2', 'tm-m' || g, 8, 8, 10, 'en', now() FROM generate_series(1,3) g;
SELECT 'complete' AS scenario, status, total, target, rewarded FROM public.get_team_mission();
SELECT 'xp-paid-once' AS scenario, user_id, xp FROM public.language_progress WHERE user_id IN ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2') ORDER BY user_id;
SELECT 'second-read-no-double-pay' AS scenario, xp FROM (SELECT * FROM public.get_team_mission()) x, public.language_progress WHERE language_progress.user_id = '00000000-0000-0000-0000-0000000000a1';
-- 4) a late joiner does not raise this week's target and a lesson they finished before joining does not count
INSERT INTO public.team_members (team_id, user_id, joined_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', now());
INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, language, completed_at)
VALUES ('00000000-0000-0000-0000-0000000000a3', 'tm-old', 8, 8, 10, 'en', now() - interval '1 minute');
SELECT 'late-joiner' AS scenario, target, total, member_count FROM public.get_team_mission();
ROLLBACK;
```

Expected: one-member -> `needs_members`; two-members -> `in_progress`, target 8, total 0; complete -> `complete`, total 8, rewarded true; both a1 and a2 at xp 50, a3 untouched at 0; the second read leaves a1 at 50; late-joiner -> target still 8, total still 8 (a3's earlier lesson is not counted), member_count 2.

- [ ] **Step 2: If any scenario is wrong**, fix the migration and re-run Tasks 1-3 (the migration test must stay green). If the MCP refuses the multi-statement script, run the same scenarios after deploy inside a transaction that ends in `ROLLBACK` and say so in the PR.

---

### Task 4: View-model module with fixtures (RED then GREEN)

**Files:**
- Create: `src/lib/team-mission.fixtures.json`, `src/lib/team-mission.ts`, `src/lib/team-mission.test.ts`

- [ ] **Step 1: Fixtures (the contract iOS/Android will reuse byte for byte)**

`src/lib/team-mission.fixtures.json`:

```json
{
  "now": "2026-10-07T12:00:00.000Z",
  "cases": [
    {
      "name": "in progress, mid week",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 8, "total": 3, "my_count": 2, "member_count": 2, "status": "in_progress", "reward_xp": 50, "rewarded": false },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 8, "total": 3, "myCount": 2, "memberCount": 2, "status": "in_progress", "rewardXp": 50, "rewarded": false, "daysLeft": 5, "percent": 37, "headline": "3 of 8 lessons done", "footer": "You added 2 · 5 days left" }
    },
    {
      "name": "complete and paid",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 8, "total": 9, "my_count": 4, "member_count": 2, "status": "complete", "reward_xp": 50, "rewarded": true },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 8, "total": 9, "myCount": 4, "memberCount": 2, "status": "complete", "rewardXp": 50, "rewarded": true, "daysLeft": 5, "percent": 100, "headline": "Mission complete!", "footer": "+50 XP for everyone who joined in" }
    },
    {
      "name": "complete but I added nothing",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 8, "total": 8, "my_count": 0, "member_count": 2, "status": "complete", "reward_xp": 50, "rewarded": true },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 8, "total": 8, "myCount": 0, "memberCount": 2, "status": "complete", "rewardXp": 50, "rewarded": true, "daysLeft": 5, "percent": 100, "headline": "Mission complete!", "footer": "+50 XP for everyone who joined in" }
    },
    {
      "name": "needs a second member",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 0, "total": 0, "my_count": 0, "member_count": 1, "status": "needs_members", "reward_xp": 0, "rewarded": false },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 0, "total": 0, "myCount": 0, "memberCount": 1, "status": "needs_members", "rewardXp": 0, "rewarded": false, "daysLeft": 5, "percent": 0, "headline": "Invite a friend to start your team's weekly mission", "footer": "" }
    },
    {
      "name": "last day",
      "now": "2026-10-11T20:00:00.000Z",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 12, "total": 11, "my_count": 1, "member_count": 3, "status": "in_progress", "reward_xp": 50, "rewarded": false },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 12, "total": 11, "myCount": 1, "memberCount": 3, "status": "in_progress", "rewardXp": 50, "rewarded": false, "daysLeft": 1, "percent": 91, "headline": "11 of 12 lessons done", "footer": "You added 1 · Last day" }
    },
    {
      "name": "overshoot caps at 100 percent and shows the real total",
      "row": { "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 4, "total": 7, "my_count": 7, "member_count": 1, "status": "complete", "reward_xp": 50, "rewarded": true },
      "expected": { "teamId": "t1", "weekStart": "2026-10-05", "weekEnd": "2026-10-12", "target": 4, "total": 7, "myCount": 7, "memberCount": 1, "status": "complete", "rewardXp": 50, "rewarded": true, "daysLeft": 5, "percent": 100, "headline": "Mission complete!", "footer": "+50 XP for everyone who joined in" }
    }
  ]
}
```

- [ ] **Step 2: Failing test**

`src/lib/team-mission.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fixtures from "./team-mission.fixtures.json";
import { parseTeamMission, type TeamMissionRow } from "./team-mission";

describe("parseTeamMission contract fixtures", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const now = Date.parse((c as { now?: string }).now ?? fixtures.now);
      expect(parseTeamMission(c.row as TeamMissionRow, now)).toEqual(c.expected);
    });
  }
});

describe("parseTeamMission edges", () => {
  const base = fixtures.cases[0].row as TeamMissionRow;
  const now = Date.parse(fixtures.now);

  it("returns null when the caller has no team (no row)", () => {
    expect(parseTeamMission(undefined, now)).toBeNull();
  });

  it("never reports a negative number of days left", () => {
    expect(parseTeamMission({ ...base, week_end: "2026-10-01" }, now)?.daysLeft).toBe(0);
  });

  it("an unknown status from a newer server falls back to in_progress, never crashes", () => {
    expect(parseTeamMission({ ...base, status: "weird" as never }, now)?.status).toBe("in_progress");
  });

  it("a zero target never divides by zero", () => {
    expect(parseTeamMission({ ...base, target: 0, status: "in_progress" }, now)?.percent).toBe(0);
  });

  it("percent rounds down so 99.9 percent never reads as done", () => {
    expect(parseTeamMission({ ...base, total: 799, target: 800 }, now)?.percent).toBe(99);
  });
});
```

Run: `bun run test src/lib/team-mission.test.ts` -> FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/team-mission.ts`:

```ts
/**
 * View model for a team's weekly mission (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1).
 * Everything is computed by the get_team_mission() SQL function; this only parses its row and owns the wording,
 * which is identical on iOS and Android and pinned by team-mission.fixtures.json.
 */
export type TeamMissionStatus = "needs_members" | "in_progress" | "complete";

export type TeamMissionRow = {
  team_id: string;
  week_start: string;
  week_end: string;
  target: number;
  total: number;
  my_count: number;
  member_count: number;
  status: TeamMissionStatus;
  reward_xp: number;
  rewarded: boolean;
};

export type TeamMission = {
  teamId: string;
  weekStart: string;
  weekEnd: string;
  target: number;
  total: number;
  myCount: number;
  memberCount: number;
  status: TeamMissionStatus;
  rewardXp: number;
  rewarded: boolean;
  daysLeft: number;
  percent: number;
  headline: string;
  footer: string;
};

const DAY_MS = 86_400_000;

function normaliseStatus(status: string): TeamMissionStatus {
  return status === "needs_members" || status === "complete" ? status : "in_progress";
}

export function parseTeamMission(row: TeamMissionRow | undefined, nowMs: number): TeamMission | null {
  if (!row) return null;
  const status = normaliseStatus(row.status);
  const daysLeft = Math.max(0, Math.ceil((Date.parse(`${row.week_end}T00:00:00Z`) - nowMs) / DAY_MS));
  const percent =
    status === "complete" ? 100 : row.target > 0 ? Math.min(100, Math.floor((row.total / row.target) * 100)) : 0;
  const timeLeft = daysLeft === 1 ? "Last day" : `${daysLeft} days left`;

  let headline: string;
  let footer: string;
  if (status === "needs_members") {
    headline = "Invite a friend to start your team's weekly mission";
    footer = "";
  } else if (status === "complete") {
    headline = "Mission complete!";
    footer = `+${row.reward_xp} XP for everyone who joined in`;
  } else {
    headline = `${row.total} of ${row.target} lessons done`;
    footer = `You added ${row.my_count} · ${timeLeft}`;
  }

  return {
    teamId: row.team_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    target: row.target,
    total: row.total,
    myCount: row.my_count,
    memberCount: row.member_count,
    status,
    rewardXp: row.reward_xp,
    rewarded: row.rewarded,
    daysLeft,
    percent,
    headline,
    footer,
  };
}
```

- [ ] **Step 4: Run, expect GREEN**; then mutation-check: `Math.floor` -> `Math.round`; drop `Math.max(0, ...)`; make `normaliseStatus` return the raw status; swap the "Last day" branch; change `+${reward_xp}` to a literal. Each must turn a test red.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-mission.ts src/lib/team-mission.test.ts src/lib/team-mission.fixtures.json
git commit -m "feat(team-mission): view model, wording and shared fixtures"
```

---

### Task 5: Server function + types

**Files:**
- Modify: `src/lib/teams.functions.ts`, `src/lib/teams.functions.test.ts`, `src/integrations/supabase/types.ts`

- [ ] **Step 1: Failing test** (append to `src/lib/teams.functions.test.ts`, following that file's existing mock helpers for `getMyTeam`):

```ts
describe("getTeamMission", () => {
  it("maps the RPC row to the view model", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ team_id: "t1", week_start: "2026-10-05", week_end: "2026-10-12", target: 8, total: 3, my_count: 2, member_count: 2, status: "in_progress", reward_xp: 50, rewarded: false }],
      error: null,
    });
    const result = await getTeamMission({ context: ctx(supabase) });
    expect(supabase.rpc).toHaveBeenCalledWith("get_team_mission");
    expect(result?.headline).toBe("3 of 8 lessons done");
  });

  it("returns null when the caller has no team", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getTeamMission({ context: ctx(supabase) })).toBeNull();
  });

  it("throws on an RPC error instead of pretending there is no mission", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getTeamMission({ context: ctx(supabase) })).rejects.toThrow(/boom/);
  });
});
```

(Use the file's existing `asTestFns` / `ctx` helpers; add `getTeamMission` to its destructured imports.)

Run -> FAIL (not exported).

- [ ] **Step 2: Implement** in `src/lib/teams.functions.ts` (add the import `import { parseTeamMission, type TeamMission, type TeamMissionRow } from "./team-mission";`):

```ts
export const getTeamMission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMission | null> => {
    const { data: rows, error } = await context.supabase.rpc("get_team_mission");
    if (error) throw new Error(`getTeamMission: ${error.message}`);
    return parseTeamMission((rows as TeamMissionRow[] | null)?.[0], Date.now());
  });
```

- [ ] **Step 3: types.ts** (hand-added, alphabetical; the MCP generator lacks `graphql_public`, so never regenerate). Insert before `team_weekly_rewards: {` in Tables:

```ts
      team_mission_rewards: {
        Row: {
          granted_at: string;
          team_id: string;
          user_id: string;
          week_start: string;
          xp: number;
        };
        Insert: {
          granted_at?: string;
          team_id: string;
          user_id: string;
          week_start: string;
          xp: number;
        };
        Update: {
          granted_at?: string;
          team_id?: string;
          user_id?: string;
          week_start?: string;
          xp?: number;
        };
        Relationships: [];
      };
      team_missions: {
        Row: {
          created_at: string;
          member_count: number;
          rewarded_at: string | null;
          target: number;
          team_id: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          member_count: number;
          rewarded_at?: string | null;
          target: number;
          team_id: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          member_count?: number;
          rewarded_at?: string | null;
          target?: number;
          team_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
```

and after the `get_team_members` function entry in Functions:

```ts
      get_team_mission: {
        Args: never;
        Returns: {
          member_count: number;
          my_count: number;
          reward_xp: number;
          rewarded: boolean;
          status: string;
          target: number;
          team_id: string;
          total: number;
          week_end: string;
          week_start: string;
        }[];
      };
```

- [ ] **Step 4: Run** `bun run test src/lib/teams.functions.test.ts && bunx tsc --noEmit` -> PASS. Mutation: drop the `if (error) throw`; change `[0]` to `[1]`. Each red.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(team-mission): getTeamMission server function and types"`

---

### Task 6: GDPR export

**Files:** Modify `src/lib/account.functions.ts`.

- [ ] **Step 1:** The existing test `every table the export reads has a SELECT policy` and the GDPR coverage test (`finds every table that references auth.users`) go RED for `team_mission_rewards` as soon as Task 2 lands. Confirm with `bun run test src/lib/account.functions.test.ts` (expect FAIL naming `team_mission_rewards`).
- [ ] **Step 2:** Add `"team_mission_rewards",` to `USER_ID_EXPORT_TABLES` after `"team_members",` (alphabetical).
- [ ] **Step 3:** Run again -> PASS. Mutation: remove the policy line from the migration; the export-policy test must fail.
- [ ] **Step 4: Commit.**

---

### Task 7: The card and the pages

**Files:**
- Create: `src/components/TeamMissionCard.tsx`, `src/components/TeamMissionCard.test.tsx`
- Modify: `src/routes/_authenticated/teams_.$teamId.tsx` (+ test mock), `src/routes/_authenticated/learn.tsx`

- [ ] **Step 1: Failing test** `src/components/TeamMissionCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getTeamMission = vi.fn();
vi.mock("../lib/teams.functions", () => ({ getTeamMission }));

const { TeamMissionCard } = await import("./TeamMissionCard");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TeamMissionCard />
    </QueryClientProvider>,
  );
}

const base = {
  teamId: "t1", weekStart: "2026-10-05", weekEnd: "2026-10-12", target: 8, total: 3, myCount: 2, memberCount: 2,
  status: "in_progress", rewardXp: 50, rewarded: false, daysLeft: 5, percent: 37,
  headline: "3 of 8 lessons done", footer: "You added 2 · 5 days left",
};

beforeEach(() => getTeamMission.mockReset());

describe("TeamMissionCard", () => {
  it("shows the headline, footer and a progress bar at the right width", async () => {
    getTeamMission.mockResolvedValue(base);
    renderCard();
    expect(await screen.findByText("3 of 8 lessons done")).toBeInTheDocument();
    expect(screen.getByText("You added 2 · 5 days left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
    expect((screen.getByTestId("team-mission-fill") as HTMLElement).style.width).toBe("37%");
  });

  it("celebrates a completed mission", async () => {
    getTeamMission.mockResolvedValue({ ...base, status: "complete", percent: 100, headline: "Mission complete!", footer: "+50 XP for everyone who joined in" });
    renderCard();
    expect(await screen.findByText("Mission complete!")).toBeInTheDocument();
    expect(screen.getByText("+50 XP for everyone who joined in")).toBeInTheDocument();
  });

  it("invites a second member and shows no bar when the team is too small", async () => {
    getTeamMission.mockResolvedValue({ ...base, status: "needs_members", percent: 0, headline: "Invite a friend to start your team's weekly mission", footer: "" });
    renderCard();
    expect(await screen.findByText("Invite a friend to start your team's weekly mission")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders nothing without a team, while loading and when the call fails", async () => {
    getTeamMission.mockResolvedValue(null);
    const { container } = renderCard();
    await vi.waitFor(() => expect(getTeamMission).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    getTeamMission.mockRejectedValue(new Error("down"));
    const second = renderCard();
    await vi.waitFor(() => expect(getTeamMission).toHaveBeenCalledTimes(2));
    expect(second.container.textContent).toBe("");
  });
});
```

Run -> FAIL (component missing).

- [ ] **Step 2: Implement** `src/components/TeamMissionCard.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getTeamMission } from "../lib/teams.functions";

export function TeamMissionCard() {
  const { data: mission } = useQuery({
    queryKey: ["teamMission"],
    queryFn: () => getTeamMission(),
  });

  if (!mission) return null;
  const showBar = mission.status !== "needs_members";

  return (
    <div className="rounded-2xl border border-hairline bg-parchment p-4">
      <p className="font-display text-sm font-semibold text-ink">Team mission</p>
      <p className="mt-2 text-sm text-ink">{mission.headline}</p>
      {showBar && (
        <div
          role="progressbar"
          aria-label="Team mission progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={mission.percent}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline"
        >
          <div
            data-testid="team-mission-fill"
            className="h-full rounded-full bg-moss"
            style={{ width: `${mission.percent}%` }}
          />
        </div>
      )}
      {mission.footer && <p className="mt-2 text-xs text-ink-soft">{mission.footer}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Place it.** In `teams_.$teamId.tsx` render `<TeamMissionCard />` inside the `<MobileFrame>` between the "XP this week" line and the actions (read the file's JSX around lines 41-65 and insert a `<div className="mb-4"><TeamMissionCard /></div>`), and add `getTeamMission` to that test file's `vi.mock("../../lib/teams.functions", ...)` factory (`getTeamMission: vi.fn().mockResolvedValue(null)`) so the existing tests still pass. In `learn.tsx`, import the card and render `<div className="mb-6"><TeamMissionCard /></div>` directly above `<WeeklyChallengesCard />` (it renders nothing for users without a team).

- [ ] **Step 4: Run** `bun run test src/components/TeamMissionCard.test.tsx "src/routes/_authenticated/teams_.\$teamId.test.tsx" src/routes/_authenticated/learn` and `bunx tsc --noEmit` -> PASS. Mutation: bar width from `total` instead of `percent`; render when `mission` is null (`return <div/>`); hide the footer; remove `aria-valuenow`. Each red.

- [ ] **Step 5: Commit.**

---

### Task 8: Privacy line and docs

- [ ] **Step 1:** `src/routes/privacy.tsx`: add one sentence in the section that already describes teams: "Team missions count how many lessons your team finishes together each week; teammates see the team total and their own count, not other members' individual numbers." Update the page's last-updated date to 7 October 2026 only if the page tracks one (it showed 6 October 2026 previously; keep the existing format). Add/adjust the privacy test if one pins the date.
- [ ] **Step 2:** Docs, each updated in this PR: `ARCHITECTURE.md` (a row in the tables table for `team_missions` / `team_mission_rewards` and the three functions), `CHANGELOG.md` (entry), `README.md` (feature list mention if teams are listed), `AGENTS.md` (the lazy-resolution pattern note and "badge ships in Phase 2"), and `docs/BACKLOG.md` locally (0.0-ac item 2: Phase 1 in progress -> merged).
- [ ] **Step 3: Commit.**

---

### Task 9: Gate, review, PR, merge, verify

- [ ] **Step 1:** `bunx prettier --check "src/**/*.{ts,tsx}" && bun run lint && bunx tsc --noEmit && bun run test` (run the gate once, alone; a starved run can fail a named test, re-run that test alone before believing it).
- [ ] **Step 2:** Spawn a fresh `fable` reviewer (read-only) with the spec, plan and `git diff origin/main`: ask it to attack the SQL (race on `rewarded_at`, week boundary at UTC midnight, `joined_at` rule, a member leaving, a team of exactly 2 dropping to 1 after the snapshot, the previous-week resolution, `language_progress` row missing for a member, SECURITY DEFINER search_path), the tests (guards that cannot fail), and parity. Fix every confirmed finding test-first.
- [ ] **Step 3:** Push, open the PR (`feat(team-mission): weekly shared mission, server + web`), wait for CI, answer CodeRabbit comments, merge when green.
- [ ] **Step 4: Verify live after deploy:** query `information_schema.role_table_grants` for the two new tables (team_missions: no client grant; team_mission_rewards: authenticated SELECT only); confirm `get_team_mission` is executable by authenticated and not anon; re-run the Task 3 scenarios in a rolled-back transaction against the deployed functions; confirm `anon` cannot call it (REST 401).
- [ ] **Step 5:** Remove the junction (`rmdir node_modules`), then the worktree and branch; update BACKLOG and memory; then start Phase 2 (iOS + Android, including the Team player badge in all three catalogs).

---

## Self-review (run against the spec)

- Target members x 4, snapshot first read of the week, min 2 members: Task 2 SQL + test. Progress counts distinct lessons by current members from `max(week, joined_at)`: `_team_mission_count`. Replays cannot farm it: `lesson_completions` has one row per user per lesson, completed_at is the first completion.
- Reward +50 XP to each contributor once, lazily, previous week resolved too: `_resolve_team_mission` + atomic `rewarded_at` guard. Badge deliberately deferred to Phase 2 (stated in the header).
- Visibility total + own count, no per-member list: row has `total`, `my_count` only.
- Surface on team screen and Learn page: Task 7. Export and privacy: Tasks 6 and 8. Closed-by-default grants and the new-table guard: Task 2 (marker + grant). RLS-client-write guard unaffected (no client writes).
- Types consistent across tasks: `TeamMissionRow` / `TeamMission` / `parseTeamMission(row, nowMs)` / `getTeamMission` / `get_team_mission` / `team_mission_rewards` are used with the same names everywhere.
- No placeholders; every code step shows code. The one non-literal step (Task 7 step 3) names the exact insertion points and the mock addition.
