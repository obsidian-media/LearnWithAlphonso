# Buddy Pairing (Phase 3a: friends only) Implementation Plan

> **As built (after review), these differ from the steps below:** a block is recorded as `unfriended`; every pairing, request and ending path first takes per-person advisory locks in a fixed order (`_lock_buddy_users`), `_create_buddy_pair` re-checks friendship and blocks under that lock, a reverse request is marked accepted only after the pair exists, and `_end_buddy_pair_between` resolves the finished weeks before ending (`end_buddy` goes through it). The migration file is the source of truth.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two accepted friends can agree to be study buddies; each week both aim for 3 distinct lessons, and the pair keeps a shared streak with one grace week, on the server and the web app.

**Architecture:** One migration adds four tables (`buddy_pairs`, `buddy_members`, `buddy_requests`, `buddy_weeks`), SECURITY DEFINER RPCs that do every write, two triggers that end a pair when the friendship goes away or either side blocks, and a lazy week resolver called from `get_my_buddy()` (same no-cron shape as the team mission). The web app gets a pure `src/lib/buddy.ts` (rules + wording, mirrored by shared fixtures for Phase 4), server functions in `src/lib/buddy.functions.ts`, and a `BuddyCard` on the Friends page.

**Tech Stack:** Supabase Postgres (plpgsql), TanStack Start server functions, React Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-06-study-together-design.md` (Part 2, "Data and privacy", "Error handling", "Testing").

## Changes to the spec this plan makes (and why)

1. **Phase 3 is split.** 3a (this plan) is friend pairing only. **3b, the opt-in stranger pool (`buddy_pool`, `join_buddy_pool`), is not built until the owner confirms the App Store age rating** (spec "Owner items"; the app's terms allow users from 13, so matching would pair minors with unknown adults). 3a needs no new owner sign-off: both people are already accepted friends and both must consent.
2. **"One active buddy per user" is enforced by a `buddy_members(user_id PRIMARY KEY, pair_id)` table, not by "a partial unique index per user"** on `buddy_pairs`. Two partial unique indexes (on `user_a` and on `user_b`) do not stop a user being `user_a` in one active pair and `user_b` in another; a primary key on `user_id` does.
3. **The week a pair is created can only help.** A pair formed on a Sunday cannot reach 3 lessons in a day; judging that week would spend the grace (or reset the streak) on day one. Outcome `first_week`: if both hit the goal it counts as a hit, otherwise nothing changes.
4. **The pair also ends when the friendship ends** (unfriend), not only on block: a friend-sourced pair without the friendship has nothing behind it. Both are triggers, so every path (`remove_friend`, `block_user`, a future admin tool) is covered.

## Global Constraints

- Week = ISO week starting Monday, UTC (`date_trunc('week', current_date)::date`); every new function pins `SET search_path = public` and `SET timezone = 'UTC'`.
- `BUDDY_GOAL` = 3 distinct lessons per buddy per week, counted from `max(week_start, pair created_at)`; distinct by `(language, lesson_id)`; `lesson_completions.completed_at` is the FIRST completion and is never updated on replay, so replays cannot farm it.
- Streak rules: both hit -> `streak_weeks + 1`, grace restored; else first week -> no change; else grace available -> grace spent, streak holds; else streak resets to 0.
- Every RPC returns a typed `status` text the clients map to fixed wording: `requested`, `paired`, `declined`, `cancelled`, `ended`, `not_friends`, `blocked`, `already_paired`, `friend_paired`, `already_requested`, `not_found`, `not_paired`, `unauthenticated`.
- New tables: RLS on; closed by default (2026-10-06 privilege rule); GRANT only what a policy backs; `-- client-grants: none public.<table>` for server-only tables (the migration-grants CI guard enforces this).
- Every `ON DELETE CASCADE` to `auth.users`; GDPR export covers the caller's pairs, requests and weeks.
- No free text anywhere (owner decision 2026-10-06). Messages are Phase 5.
- Never cut an iOS build or Android release; Phase 3a has no native code.
- Server functions throw on an RPC error; screens show "Couldn't load your study buddy." + Try again, never the "no buddy" state (lesson of PR #237).
- No `RETURNS TABLE` output column may be used unqualified inside the body (`src/lib/plpgsql-output-column-clash.test.ts` fails the build; the live probe catches what it cannot).

## Review Focus

1. **Both friends ask each other at the same moment** -> exactly one request survives (unique pending index); the second `request_buddy` finds the reverse request and pairs them (`paired`), never two pairs. Pinned by the live probe (Task 2, scenario P3) and the migration test (unique index present).
2. **A request is accepted after either side has paired with someone else** -> pairing cancels every pending request involving either new buddy, so the late accept answers `not_found` (and if a race slips past that, `_create_buddy_pair` answers `already_paired` / `friend_paired`); no pair is created and no member row is left half-written. Live probe P5.
3. **Unfriend or block mid-pair** -> the pair ends (`ended_reason` `unfriended` in both cases; a block is visible only to the blocker), `get_my_buddy` returns no row for both, pending requests between them are cancelled, `buddy_weeks` history stays. Live probe P6, P7.
4. **A pair nobody opened for several weeks** -> each missed week is resolved in order exactly once (grace spent on the first miss, streak reset on the second), even when both buddies open the app at the same time (`FOR UPDATE` on the pair). Pure fixtures (Task 3) + live probe P8.
5. **A failed buddy lookup on web** -> "Couldn't load your study buddy." + Try again, never the "ask a friend" state (Task 5 test).

---

### Task 1: Migration: tables, privileges, triggers

**Files:**
- Create: `supabase/migrations/20261006180000_buddy_pairing.sql` (version must sort after `20261006170000`; confirm nothing newer exists with `ls supabase/migrations | tail -3`)
- Test: `src/lib/buddy-pairing-migration.test.ts`

**Interfaces:**
- Produces: tables `buddy_pairs`, `buddy_members`, `buddy_requests`, `buddy_weeks` (columns below), internal functions `_end_buddy_pair_between(uuid, uuid, text)`, trigger functions `_buddy_on_friendship_deleted()`, `_buddy_on_block()`.

- [ ] **Step 1: Write the failing migration test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261006180000_buddy_pairing.sql";
const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");

describe("buddy pairing migration", () => {
  it("is newer than every other migration's version and the version is unique", () => {
    const others = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== FILE);
    expect(others.map((f) => f.slice(0, 14))).not.toContain(FILE.slice(0, 14));
    expect(FILE > "20261006170000_fix_team_joins_and_course_aware_payouts.sql").toBe(true);
  });

  it("creates the four tables with RLS on and cascades to auth.users", () => {
    for (const t of ["buddy_pairs", "buddy_members", "buddy_requests", "buddy_weeks"]) {
      expect(sql()).toMatch(new RegExp(`CREATE TABLE public\\.${t} \\(`));
      expect(sql()).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
    }
    expect(sql().match(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g)?.length).toBe(5);
  });

  it("enforces one active buddy per user with a primary key, not partial indexes", () => {
    expect(sql()).toMatch(/user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(sql()).toMatch(/CHECK \(user_a < user_b\)/);
  });

  it("allows at most one pending request between two people, either direction", () => {
    expect(sql()).toMatch(
      /CREATE UNIQUE INDEX buddy_requests_one_pending ON public\.buddy_requests \(least\(from_user, to_user\), greatest\(from_user, to_user\)\) WHERE status = 'pending';/,
    );
  });

  it("grants clients only SELECT, each backed by an own-rows policy; buddy_members is server-only", () => {
    expect(sql()).toMatch(/-- client-grants: none public\.buddy_members/);
    for (const t of ["buddy_pairs", "buddy_requests", "buddy_weeks"]) {
      expect(sql()).toMatch(new RegExp(`CREATE POLICY ${t}_select_own ON public\\.${t} FOR SELECT TO authenticated`));
      expect(sql()).toMatch(new RegExp(`GRANT SELECT ON public\\.${t} TO authenticated;`));
    }
    expect(sql()).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  it("ends the pair when the friendship is deleted or either side blocks", () => {
    expect(sql()).toMatch(/CREATE TRIGGER buddy_end_on_unfriend AFTER DELETE ON public\.friendships/);
    expect(sql()).toMatch(/CREATE TRIGGER buddy_end_on_block AFTER INSERT ON public\.blocked_users/);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`ENOENT` for the migration file)

Run: `bun run test src/lib/buddy-pairing-migration.test.ts`

- [ ] **Step 3: Write the migration's table half**

```sql
-- Study together, Phase 3a: language buddies between accepted friends (spec 2026-10-06-study-together-design.md,
-- plan 2026-10-06-buddy-pairing-web.md). The opt-in stranger pool (3b) is NOT here: it waits for the owner to confirm
-- the App Store age rating. Every write goes through the SECURITY DEFINER functions below; clients only read their rows.
-- One active buddy per user is the PRIMARY KEY of buddy_members (two partial unique indexes on buddy_pairs could not
-- stop a user being user_a in one pair and user_b in another).
--
-- client-grants: none public.buddy_members

CREATE TABLE public.buddy_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('friend', 'match')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text CHECK (ended_reason IN ('ended', 'unfriended')),
  streak_weeks integer NOT NULL DEFAULT 0 CHECK (streak_weeks >= 0),
  grace_available boolean NOT NULL DEFAULT true,
  resolved_through date,
  CHECK (user_a < user_b)
);
CREATE INDEX buddy_pairs_user_a_idx ON public.buddy_pairs (user_a);
CREATE INDEX buddy_pairs_user_b_idx ON public.buddy_pairs (user_b);
ALTER TABLE public.buddy_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_pairs_select_own ON public.buddy_pairs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (user_a, user_b));
GRANT SELECT ON public.buddy_pairs TO authenticated;
GRANT ALL ON public.buddy_pairs TO service_role;

CREATE TABLE public.buddy_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_id uuid NOT NULL REFERENCES public.buddy_pairs(id) ON DELETE CASCADE
);
ALTER TABLE public.buddy_members ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.buddy_members TO service_role;

CREATE TABLE public.buddy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX buddy_requests_one_pending ON public.buddy_requests (least(from_user, to_user), greatest(from_user, to_user)) WHERE status = 'pending';
CREATE INDEX buddy_requests_to_user_idx ON public.buddy_requests (to_user);
ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_requests_select_own ON public.buddy_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (from_user, to_user));
GRANT SELECT ON public.buddy_requests TO authenticated;
GRANT ALL ON public.buddy_requests TO service_role;

CREATE TABLE public.buddy_weeks (
  pair_id uuid NOT NULL REFERENCES public.buddy_pairs(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  a_count integer NOT NULL,
  b_count integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('hit', 'grace', 'miss', 'first_week')),
  PRIMARY KEY (pair_id, week_start)
);
ALTER TABLE public.buddy_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_weeks_select_own ON public.buddy_weeks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.buddy_pairs bp WHERE bp.id = buddy_weeks.pair_id AND (SELECT auth.uid()) IN (bp.user_a, bp.user_b)));
GRANT SELECT ON public.buddy_weeks TO authenticated;
GRANT ALL ON public.buddy_weeks TO service_role;
```

(5 `auth.users` references: `user_a`, `user_b`, `buddy_members.user_id`, `from_user`, `to_user`.)

- [ ] **Step 4: Append the end-pair helper and the two triggers**

```sql
CREATE OR REPLACE FUNCTION public._end_buddy_pair_between(_x uuid, _y uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  pid uuid;
BEGIN
  SELECT bp.id INTO pid FROM public.buddy_pairs bp
    WHERE bp.user_a = least(_x, _y) AND bp.user_b = greatest(_x, _y) AND bp.ended_at IS NULL
    FOR UPDATE;
  IF pid IS NOT NULL THEN
    UPDATE public.buddy_pairs bp SET ended_at = now(), ended_reason = _reason WHERE bp.id = pid;
    DELETE FROM public.buddy_members bm WHERE bm.pair_id = pid;
  END IF;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending'
      AND least(br.from_user, br.to_user) = least(_x, _y) AND greatest(br.from_user, br.to_user) = greatest(_x, _y);
END;
$$;

CREATE OR REPLACE FUNCTION public._buddy_on_friendship_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- friendships are two mirrored rows; the second call finds nothing to end (idempotent).
  PERFORM public._end_buddy_pair_between(OLD.user_id, OLD.friend_id, 'unfriended');
  RETURN OLD;
END;
$$;
CREATE TRIGGER buddy_end_on_unfriend AFTER DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public._buddy_on_friendship_deleted();

CREATE OR REPLACE FUNCTION public._buddy_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recorded as 'unfriended', never 'blocked': buddy_pairs is readable to both buddies, a block only to the blocker.
  PERFORM public._end_buddy_pair_between(NEW.blocker, NEW.blocked, 'unfriended');
  RETURN NEW;
END;
$$;
CREATE TRIGGER buddy_end_on_block AFTER INSERT ON public.blocked_users
  FOR EACH ROW EXECUTE FUNCTION public._buddy_on_block();

REVOKE ALL ON FUNCTION public._end_buddy_pair_between(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_friendship_deleted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_block() FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 5: Run the migration test, the grants guard and the clash guard; expect PASS**

Run: `bun run test src/lib/buddy-pairing-migration.test.ts src/lib/migration-grants.test.ts src/lib/plpgsql-output-column-clash.test.ts src/lib/rls-client-writes.test.ts`

- [ ] **Step 6: Mutation check** — temporarily change `PRIMARY KEY` on `buddy_members.user_id` to plain `NOT NULL`, and separately drop `WHERE status = 'pending'`; each must turn a test red. Restore.

- [ ] **Step 7: Commit** `feat(buddy): tables, privileges and end-pair triggers`

---

### Task 2: Migration: RPCs, week resolver, live proof

**Files:**
- Modify: `supabase/migrations/20261006180000_buddy_pairing.sql` (append)
- Modify: `src/lib/buddy-pairing-migration.test.ts`
- Create (scratch, not committed): the probe script, following `docs/sql-probes.md`

**Interfaces:**
- Consumes: Task 1 tables and `_end_buddy_pair_between`.
- Produces (all `RETURNS TABLE`, SECURITY DEFINER, `GRANT EXECUTE ... TO authenticated` unless prefixed `_`):
  - `request_buddy(_friend uuid) -> (status text)`
  - `respond_buddy_request(_request uuid, _accept boolean) -> (status text)`
  - `cancel_buddy_request(_request uuid) -> (status text)`
  - `end_buddy() -> (status text)`
  - `get_buddy_requests() -> (request_id uuid, direction text, other_id uuid, other_name text, other_avatar_seed text, requested_at timestamptz)`; `direction` is `incoming` or `outgoing`
  - `get_my_buddy() -> (pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamptz, week_start date, my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text)`; no row when the caller has no active buddy
  - internal: `_buddy_count(_user uuid, _from timestamptz, _to timestamptz) -> integer`, `_create_buddy_pair(_x uuid, _y uuid, _source text) -> text`, `_resolve_buddy_pair(_pair uuid) -> void`

- [ ] **Step 1: Extend the migration test (failing)**

```ts
  it("every public function is SECURITY DEFINER, pins search_path and UTC, and only authenticated may call it", () => {
    const pub = ["request_buddy(uuid)", "respond_buddy_request(uuid, boolean)", "cancel_buddy_request(uuid)", "end_buddy()", "get_buddy_requests()", "get_my_buddy()"];
    for (const sig of pub) {
      const name = sig.slice(0, sig.indexOf("("));
      const body = sql().slice(sql().indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      expect(body.slice(0, body.indexOf("AS $$"))).toMatch(/SECURITY DEFINER\nSET search_path = public\nSET timezone = 'UTC'/);
      expect(sql()).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql()).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
    for (const sig of ["_buddy_count(uuid, timestamptz, timestamptz)", "_create_buddy_pair(uuid, uuid, text)", "_resolve_buddy_pair(uuid)"]) {
      expect(sql()).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it("uses the shared goal of 3 lessons", () => {
    expect(sql()).toMatch(/goal constant integer := 3;/);
  });

  it("serialises week resolution per pair so two buddies opening the app at once resolve each week once", () => {
    expect(sql()).toMatch(/FROM public\.buddy_pairs bp WHERE bp\.id = _pair FOR UPDATE;/);
  });
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Append the functions**

```sql
CREATE OR REPLACE FUNCTION public._buddy_count(_user uuid, _from timestamptz, _to timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
  SELECT count(DISTINCT (lc.language, lc.lesson_id))::integer FROM public.lesson_completions lc
  WHERE lc.user_id = _user AND lc.completed_at >= _from AND lc.completed_at < _to;
$$;

CREATE OR REPLACE FUNCTION public._create_buddy_pair(_x uuid, _y uuid, _source text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  pid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN RETURN 'already_paired'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _y) THEN RETURN 'friend_paired'; END IF;
  BEGIN
    INSERT INTO public.buddy_pairs (user_a, user_b, source) VALUES (least(_x, _y), greatest(_x, _y), _source)
      RETURNING id INTO pid;
    INSERT INTO public.buddy_members (user_id, pair_id) VALUES (_x, pid), (_y, pid);
  EXCEPTION WHEN unique_violation THEN
    -- a concurrent pairing won the race; this block's inserts are rolled back
    RETURN 'already_paired';
  END;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending' AND (br.from_user IN (_x, _y) OR br.to_user IN (_x, _y));
  RETURN 'paired';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_buddy(_friend uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  reverse_id uuid;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  IF _friend IS NULL OR _friend = me OR NOT EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.user_id = me AND f.friend_id = _friend AND f.status = 'accepted'
  ) THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = _friend) OR (b.blocker = _friend AND b.blocked = me))
  THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN RETURN QUERY SELECT 'already_paired'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _friend) THEN RETURN QUERY SELECT 'friend_paired'::text; RETURN; END IF;

  -- They already asked me: asking back is a yes.
  SELECT br.id INTO reverse_id FROM public.buddy_requests br
    WHERE br.from_user = _friend AND br.to_user = me AND br.status = 'pending' FOR UPDATE;
  IF reverse_id IS NOT NULL THEN
    UPDATE public.buddy_requests br SET status = 'accepted', responded_at = now() WHERE br.id = reverse_id;
    result := public._create_buddy_pair(me, _friend, 'friend');
    RETURN QUERY SELECT result; RETURN;
  END IF;

  INSERT INTO public.buddy_requests (from_user, to_user) VALUES (me, _friend) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN QUERY SELECT 'already_requested'::text; RETURN; END IF;
  RETURN QUERY SELECT 'requested'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_buddy_request(_request uuid, _accept boolean)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  req public.buddy_requests;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  SELECT * INTO req FROM public.buddy_requests br WHERE br.id = _request AND br.to_user = me AND br.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  IF NOT coalesce(_accept, false) THEN
    UPDATE public.buddy_requests br SET status = 'declined', responded_at = now() WHERE br.id = req.id;
    RETURN QUERY SELECT 'declined'::text; RETURN;
  END IF;
  -- Re-check at accept time: things can change while a request waits.
  IF NOT EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = me AND f.friend_id = req.from_user AND f.status = 'accepted')
  THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = req.from_user) OR (b.blocker = req.from_user AND b.blocked = me))
  THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  result := public._create_buddy_pair(me, req.from_user, 'friend');
  IF result = 'paired' THEN
    UPDATE public.buddy_requests br SET status = 'accepted', responded_at = now() WHERE br.id = req.id;
  END IF;
  RETURN QUERY SELECT result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_buddy_request(_request uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.id = _request AND br.from_user = me AND br.status = 'pending';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  RETURN QUERY SELECT 'cancelled'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_buddy()
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN QUERY SELECT 'not_paired'::text; RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid); -- judge finished weeks before the pair stops being resolvable
  UPDATE public.buddy_pairs bp SET ended_at = now(), ended_reason = 'ended' WHERE bp.id = pid AND bp.ended_at IS NULL;
  DELETE FROM public.buddy_members bm WHERE bm.pair_id = pid;
  RETURN QUERY SELECT 'ended'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_buddy_pair(_pair uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  goal constant integer := 3;
  p public.buddy_pairs;
  this_wk date := date_trunc('week', current_date)::date;
  first_wk date;
  wk date;
  a integer;
  b integer;
  outcome_now text;
  streak integer;
  grace boolean;
BEGIN
  SELECT * INTO p FROM public.buddy_pairs bp WHERE bp.id = _pair FOR UPDATE;
  IF NOT FOUND OR p.ended_at IS NOT NULL THEN RETURN; END IF;
  first_wk := date_trunc('week', p.created_at)::date;
  wk := coalesce(p.resolved_through + 7, first_wk);
  streak := p.streak_weeks;
  grace := p.grace_available;
  WHILE wk < this_wk LOOP
    a := public._buddy_count(p.user_a, greatest(wk::timestamptz, p.created_at), (wk + 7)::timestamptz);
    b := public._buddy_count(p.user_b, greatest(wk::timestamptz, p.created_at), (wk + 7)::timestamptz);
    IF a >= goal AND b >= goal THEN
      outcome_now := 'hit'; streak := streak + 1; grace := true;
    ELSIF wk = first_wk THEN
      outcome_now := 'first_week';
    ELSIF grace THEN
      outcome_now := 'grace'; grace := false;
    ELSE
      outcome_now := 'miss'; streak := 0;
    END IF;
    INSERT INTO public.buddy_weeks (pair_id, week_start, a_count, b_count, outcome)
      VALUES (p.id, wk, a, b, outcome_now) ON CONFLICT DO NOTHING;
    wk := wk + 7;
  END LOOP;
  IF wk <> coalesce(p.resolved_through + 7, first_wk) THEN
    UPDATE public.buddy_pairs bp SET streak_weeks = streak, grace_available = grace, resolved_through = wk - 7 WHERE bp.id = p.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_buddy()
RETURNS TABLE(pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamptz, week_start date,
  my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  wk date := date_trunc('week', current_date)::date;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid);
  RETURN QUERY
  SELECT bp.id,
    other.id,
    other.display_name,
    other.avatar_seed,
    bp.created_at,
    wk,
    public._buddy_count(me, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    public._buddy_count(other.id, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    3,
    bp.streak_weeks,
    bp.grace_available,
    (SELECT bw.outcome FROM public.buddy_weeks bw WHERE bw.pair_id = bp.id ORDER BY bw.week_start DESC LIMIT 1)
  FROM public.buddy_pairs bp
  JOIN public.profiles other ON other.id = CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END
  WHERE bp.id = pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_buddy_requests()
RETURNS TABLE(request_id uuid, direction text, other_id uuid, other_name text, other_avatar_seed text, requested_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT br.id,
    CASE WHEN br.to_user = me THEN 'incoming' ELSE 'outgoing' END,
    o.id, o.display_name, o.avatar_seed, br.created_at
  FROM public.buddy_requests br
  JOIN public.profiles o ON o.id = CASE WHEN br.to_user = me THEN br.from_user ELSE br.to_user END
  WHERE br.status = 'pending' AND me IN (br.from_user, br.to_user)
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = o.id) OR (b.blocker = o.id AND b.blocked = me))
  ORDER BY br.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public._buddy_count(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._create_buddy_pair(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolve_buddy_pair(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_buddy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_buddy_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_buddy_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_buddy_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.end_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_buddy() TO authenticated;
REVOKE ALL ON FUNCTION public.get_buddy_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated;
```

Note on the clash guard: `request_buddy` and friends return a column called `status`; `buddy_requests.status` is therefore always written `br.status` and the `INSERT` relies on the column default. `get_my_buddy` returns `streak_weeks`, `grace_available`, `week_start`, `pair_id`: every table reference in its body is aliased (`bp.`, `bw.`, `bm.`). Check before running: `_resolve_buddy_pair` returns void, so it may use unqualified names, but keep them qualified anyway.

- [ ] **Step 4: Run the migration test and the clash guard, expect PASS.** If the clash guard flags a function, qualify the reference; do not add `#variable_conflict`.

- [ ] **Step 5: Live proof BEFORE merging** (`docs/sql-probes.md`): one rolled-back transaction through MCP `execute_sql` that installs the whole migration, seeds throwaway users `t-b1..t-b6@example.test` (with mirrored `accepted` friendships where a scenario needs them) and records each result. Expected:
  - P1 `request_buddy(non-friend)` -> `not_friends`; self -> `not_friends`.
  - P2 b1 asks b2 -> `requested`; b1 asks again -> `already_requested`; `get_buddy_requests` for b2 shows one `incoming`.
  - P3 b2 asks b1 back -> `paired`; exactly one `buddy_pairs` row, two `buddy_members` rows, the request `accepted`.
  - P4 `get_my_buddy` for b1 and b2: each sees the other, `goal` 3, `streak_weeks` 0; after inserting 3 lesson completions for b1 this week, b1's `my_count` = 3 and b2's `buddy_count` = 3.
  - P5 b3 asks b4 (`requested`), b4 pairs with b5 another way (b5 asks b4, b4 asks b5 back), then b4 accepts b3 -> `not_found`; b3's request is `cancelled`, b3 has no pair, b4 and b5 have exactly one pair and two member rows.
  - P6 delete the b1<->b2 friendship rows -> pair `ended_reason = 'unfriended'`, `get_my_buddy` empty for both.
  - P7 pair b7 and b8, then `block_user` as b7 -> `ended_reason = 'unfriended'` (a block is never recorded where the blocked person can read it).
  - P8 week resolution: a pair with `created_at` 3 weeks ago (week W0) and lessons only in week W1 for both: `buddy_weeks` = W0 `first_week`, W1 `hit`, W2 `grace`; streak 1, grace false; calling `get_my_buddy` twice adds no rows.
  - P9 deployed-function clash check: every new function executed at least once without `42702`.
  Then the leftover check (0 `t-b%` users, 0 `idle in transaction`).

- [ ] **Step 6: Commit** `feat(buddy): request, respond, cancel, end and the lazy week resolver (proven in a rolled-back transaction)`

---

### Task 3: Pure rules, wording and shared fixtures

**Files:**
- Create: `src/lib/buddy.ts`, `src/lib/buddy.fixtures.json`, `src/lib/buddy.test.ts`

**Interfaces:**
- Produces:
  - `export const BUDDY_GOAL = 3;`
  - `export type BuddyOutcome = "hit" | "grace" | "miss" | "first_week";`
  - `export function resolveBuddyWeek(state: { streakWeeks: number; graceAvailable: boolean }, counts: { a: number; b: number }, isFirstWeek: boolean): { outcome: BuddyOutcome; streakWeeks: number; graceAvailable: boolean }`
  - `export type BuddyStatus = "requested" | "paired" | "declined" | "cancelled" | "ended" | "not_friends" | "blocked" | "already_paired" | "friend_paired" | "already_requested" | "not_found" | "not_paired" | "unauthenticated";`
  - `export function buddyStatusMessage(status: string): string`
  - `export function buddyWeekLine(myCount: number, buddyCount: number, goal: number): string`

- [ ] **Step 1: Write `buddy.fixtures.json`** (Phase 4 copies it byte-for-byte into the iOS Kit and Android core tests)

```json
{
  "resolve": [
    { "name": "both hit", "state": { "streakWeeks": 2, "graceAvailable": false }, "counts": { "a": 3, "b": 5 }, "isFirstWeek": false, "expected": { "outcome": "hit", "streakWeeks": 3, "graceAvailable": true } },
    { "name": "one short with grace", "state": { "streakWeeks": 2, "graceAvailable": true }, "counts": { "a": 3, "b": 2 }, "isFirstWeek": false, "expected": { "outcome": "grace", "streakWeeks": 2, "graceAvailable": false } },
    { "name": "one short without grace", "state": { "streakWeeks": 2, "graceAvailable": false }, "counts": { "a": 0, "b": 9 }, "isFirstWeek": false, "expected": { "outcome": "miss", "streakWeeks": 0, "graceAvailable": false } },
    { "name": "first week short changes nothing", "state": { "streakWeeks": 0, "graceAvailable": true }, "counts": { "a": 1, "b": 0 }, "isFirstWeek": true, "expected": { "outcome": "first_week", "streakWeeks": 0, "graceAvailable": true } },
    { "name": "first week hit counts", "state": { "streakWeeks": 0, "graceAvailable": true }, "counts": { "a": 3, "b": 3 }, "isFirstWeek": true, "expected": { "outcome": "hit", "streakWeeks": 1, "graceAvailable": true } },
    { "name": "exactly the goal is a hit", "state": { "streakWeeks": 0, "graceAvailable": false }, "counts": { "a": 3, "b": 3 }, "isFirstWeek": false, "expected": { "outcome": "hit", "streakWeeks": 1, "graceAvailable": true } }
  ],
  "messages": {
    "requested": "Request sent. They'll see it on their Friends page.",
    "paired": "You're study buddies now.",
    "declined": "Request declined.",
    "cancelled": "Request cancelled.",
    "ended": "You're no longer study buddies.",
    "not_friends": "You can only ask a friend to be your study buddy.",
    "blocked": "You can't be study buddies with this person.",
    "already_paired": "You already have a study buddy.",
    "friend_paired": "Your friend already has a study buddy.",
    "already_requested": "You've already asked them.",
    "not_found": "That request is no longer open.",
    "not_paired": "You don't have a study buddy.",
    "unauthenticated": "Sign in to find a study buddy.",
    "unknown": "Something went wrong. Try again."
  },
  "weekLines": [
    { "my": 0, "buddy": 0, "goal": 3, "expected": "You 0/3 · Buddy 0/3 this week" },
    { "my": 4, "buddy": 1, "goal": 3, "expected": "You 3/3 · Buddy 1/3 this week" }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import fixtures from "./buddy.fixtures.json";
import { BUDDY_GOAL, buddyStatusMessage, buddyWeekLine, resolveBuddyWeek } from "./buddy";

describe("resolveBuddyWeek", () => {
  for (const c of fixtures.resolve) {
    it(c.name, () => expect(resolveBuddyWeek(c.state, c.counts, c.isFirstWeek)).toEqual(c.expected));
  }
  it("uses the server's goal", () => expect(BUDDY_GOAL).toBe(3));
});

describe("buddyStatusMessage", () => {
  for (const [status, text] of Object.entries(fixtures.messages)) {
    it(status, () => expect(buddyStatusMessage(status)).toBe(text));
  }
  it("falls back for a status the client does not know", () => {
    expect(buddyStatusMessage("something_new")).toBe(fixtures.messages.unknown);
  });
});

describe("buddyWeekLine", () => {
  for (const c of fixtures.weekLines) {
    it(c.expected, () => expect(buddyWeekLine(c.my, c.buddy, c.goal)).toBe(c.expected));
  }
});
```

- [ ] **Step 3: Run, expect FAIL** (module not found). `bun run test src/lib/buddy.test.ts`

- [ ] **Step 4: Implement `src/lib/buddy.ts`**

```ts
import fixtures from "./buddy.fixtures.json";

/** Distinct lessons each buddy needs in a week. Must equal `goal` in 20261006180000_buddy_pairing.sql. */
export const BUDDY_GOAL = 3;

export type BuddyOutcome = "hit" | "grace" | "miss" | "first_week";

export type BuddyStatus =
  | "requested" | "paired" | "declined" | "cancelled" | "ended" | "not_friends" | "blocked"
  | "already_paired" | "friend_paired" | "already_requested" | "not_found" | "not_paired" | "unauthenticated";

/** Mirrors `_resolve_buddy_pair` for one week; the server is the source of truth, this keeps the clients honest. */
export function resolveBuddyWeek(
  state: { streakWeeks: number; graceAvailable: boolean },
  counts: { a: number; b: number },
  isFirstWeek: boolean,
): { outcome: BuddyOutcome; streakWeeks: number; graceAvailable: boolean } {
  if (counts.a >= BUDDY_GOAL && counts.b >= BUDDY_GOAL) {
    return { outcome: "hit", streakWeeks: state.streakWeeks + 1, graceAvailable: true };
  }
  if (isFirstWeek) return { outcome: "first_week", ...state };
  if (state.graceAvailable) return { outcome: "grace", streakWeeks: state.streakWeeks, graceAvailable: false };
  return { outcome: "miss", streakWeeks: 0, graceAvailable: false };
}

const MESSAGES: Record<string, string> = fixtures.messages;

export function buddyStatusMessage(status: string): string {
  return MESSAGES[status] ?? MESSAGES.unknown;
}

export function buddyWeekLine(myCount: number, buddyCount: number, goal: number): string {
  const cap = (n: number) => Math.min(n, goal);
  return `You ${cap(myCount)}/${goal} · Buddy ${cap(buddyCount)}/${goal} this week`;
}
```

(If importing JSON into app code is not the repo's pattern, check how `team-mission.ts` gets its wording and mirror that instead: wording in code, fixtures only in tests.)

- [ ] **Step 5: Run, expect PASS. Mutation check:** change `>=` to `>` in the hit test, and `isFirstWeek` branch order (put it before the hit check); each must go red. Restore.

- [ ] **Step 6: Commit** `feat(buddy): week rules and wording with shared fixtures`

---

### Task 4: Server functions, types and the export

**Files:**
- Create: `src/lib/buddy.functions.ts`, `src/lib/buddy.functions.test.ts`
- Modify: `src/integrations/supabase/types.ts` (tables + functions, written exactly as the generator writes them; copy the shape of the `team_missions` / `get_team_mission` entries added in commit `0ce2d60` and `65b132b`)
- Modify: `src/lib/account.functions.ts` (export lists), `src/lib/account.functions.test.ts` if it pins the list

**Interfaces:**
- Consumes: Task 2 RPC names and columns; Task 3 `BuddyStatus`.
- Produces:
  - `export type MyBuddy = { pairId: string; buddyId: string; buddyName: string; buddyAvatarSeed: string; pairedAt: string; weekStart: string; myCount: number; buddyCount: number; goal: number; streakWeeks: number; graceAvailable: boolean; lastOutcome: string | null } | null;`
  - `export type BuddyRequest = { requestId: string; direction: "incoming" | "outgoing"; otherId: string; otherName: string; otherAvatarSeed: string; requestedAt: string };`
  - server fns: `getMyBuddy(): Promise<MyBuddy>`, `getBuddyRequests(): Promise<BuddyRequest[]>`, `requestBuddy({ data: { friendId } }): Promise<{ status: string }>`, `respondBuddyRequest({ data: { requestId, accept } })`, `cancelBuddyRequest({ data: { requestId } })`, `endBuddy()`; all `.middleware([requireSupabaseAuth])`, all throw `new Error(\`<name>: ${error.message}\`)` on an RPC error.

- [ ] **Step 1: Failing tests** (pattern: `src/lib/teams.functions.test.ts`, `createSupabaseMock`, `asTestFns`)

```ts
describe("getMyBuddy", () => {
  it("returns null when the user has no buddy", async () => {
    const supabase = rpcReturning([]);
    await expect(getMyBuddy({ context: ctx(supabase) })).resolves.toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("get_my_buddy");
  });
  it("throws on an RPC error so a failure never reads as 'no buddy'", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getMyBuddy({ context: ctx(supabase) })).rejects.toThrow("getMyBuddy: boom");
  });
  it("maps the row", async () => {
    const supabase = rpcReturning([{ pair_id: "p1", buddy_id: "u2", buddy_name: "Bo", buddy_avatar_seed: "cd", paired_at: "2026-10-01T00:00:00Z", week_start: "2026-10-05", my_count: 2, buddy_count: 3, goal: 3, streak_weeks: 4, grace_available: false, last_outcome: "grace" }]);
    await expect(getMyBuddy({ context: ctx(supabase) })).resolves.toEqual({ pairId: "p1", buddyId: "u2", buddyName: "Bo", buddyAvatarSeed: "cd", pairedAt: "2026-10-01T00:00:00Z", weekStart: "2026-10-05", myCount: 2, buddyCount: 3, goal: 3, streakWeeks: 4, graceAvailable: false, lastOutcome: "grace" });
  });
});

describe("requestBuddy", () => {
  it("passes the friend id and returns the server's status unchanged", async () => {
    const supabase = rpcReturning([{ status: "friend_paired" }]);
    await expect(requestBuddy({ context: ctx(supabase), data: { friendId: "00000000-0000-0000-0000-000000000002" } })).resolves.toEqual({ status: "friend_paired" });
    expect(supabase.rpc).toHaveBeenCalledWith("request_buddy", { _friend: "00000000-0000-0000-0000-000000000002" });
  });
  it("rejects a non-uuid friend id before calling the server", async () => {
    const supabase = rpcReturning([]);
    await expect(requestBuddy({ context: ctx(supabase), data: { friendId: "x" } })).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
```

Then the same two-case shape (passes the args / maps the row, and throws `<name>: boom` on an RPC error) for `respondBuddyRequest` (`rpc("respond_buddy_request", { _request, _accept })`), `cancelBuddyRequest` (`{ _request }`), `endBuddy` (no args), and `getBuddyRequests` (maps `request_id, direction, other_id, other_name, other_avatar_seed, requested_at` to the camelCase `BuddyRequest`).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** following `src/lib/teams.functions.ts` (zod `z.object({ friendId: z.string().uuid() })`, `z.object({ requestId: z.string().uuid(), accept: z.boolean() })`). An empty RPC result for a mutation maps to `{ status: "unknown" }` (wording falls back via `buddyStatusMessage`).

- [ ] **Step 4: types.ts** — add the four tables (Row/Insert/Update/Relationships, as generated) and the six public RPCs with their `Args`/`Returns`. `types-fresh` compares with the real generator after the deploy; expect it red on this PR and green after (as on #230).

- [ ] **Step 5: Export.** Add to `OTHER_OWNED_EXPORT_TABLES`: `{ table: "buddy_pairs", columns: ["user_a", "user_b"] }`, `{ table: "buddy_requests", columns: ["from_user", "to_user"] }`. `buddy_weeks` has no user column: export it with its own select, `.from("buddy_weeks").select("*").in("pair_id", myPairIds)` after the pairs are read (same as `profiles` has its own select), and add a test that it is in the export. `buddy_members` is server-only and derivable from `buddy_pairs`, so it is not exported; say so in a comment.

- [ ] **Step 6: Run** `bun run test src/lib/buddy.functions.test.ts src/lib/account.functions.test.ts`; PASS.

- [ ] **Step 7: Commit** `feat(buddy): server functions, types and GDPR export`

---

### Task 5: The Study buddy card on the Friends page

**Files:**
- Create: `src/components/BuddyCard.tsx`, `src/components/BuddyCard.test.tsx`
- Modify: `src/routes/_authenticated/profile_.friends.tsx` (mount the card above the friends list; an "Ask to be study buddy" button on each friend row), its test
- Modify: `src/routes/privacy.tsx` (one line)

**Interfaces:**
- Consumes: Task 4 server fns and types; Task 3 `buddyStatusMessage`, `buddyWeekLine`.
- Produces: `<BuddyCard />` (no props; query keys `["myBuddy"]`, `["buddyRequests"]`); `<AskBuddyButton friendId={string} />` exported from the same file.

Card states (all wording fixed here):
- loading: "Loading…"
- error (either query failed): "Couldn't load your study buddy." + "Try again" (refetches both). `retry: false` on both queries.
- no buddy: title "Study buddy", body "Pick a friend to study with. Each week you both aim for 3 lessons and keep a streak together." Then incoming requests ("{name} wants to be your study buddy." Accept / Decline) and outgoing ("Waiting for {name}." Cancel).
- buddy: "{buddyName}" + `buddyWeekLine(myCount, buddyCount, goal)` + "Streak: {n} week(s)" + (graceAvailable ? "1 grace week left" : "No grace week left") + "End study buddy" (confirm: "End being study buddies with {name}? Your streak ends.").
- after any action: show `buddyStatusMessage(status)` and invalidate both queries plus `["friends"]` if that key exists.

- [ ] **Step 1: Failing tests** (pattern: `teams.test.tsx`; QueryClient with `retry: false`; mock `../lib/buddy.functions`)

```tsx
it("shows the buddy's week and streak", async () => {
  getMyBuddy.mockResolvedValue({ pairId: "p1", buddyId: "u2", buddyName: "Bo", buddyAvatarSeed: "cd", pairedAt: "2026-10-01T00:00:00Z", weekStart: "2026-10-05", myCount: 2, buddyCount: 3, goal: 3, streakWeeks: 4, graceAvailable: true, lastOutcome: "hit" });
  getBuddyRequests.mockResolvedValue([]);
  renderCard();
  expect(await screen.findByText("Bo")).toBeInTheDocument();
  expect(screen.getByText("You 2/3 · Buddy 3/3 this week")).toBeInTheDocument();
  expect(screen.getByText("Streak: 4 weeks")).toBeInTheDocument();
  expect(screen.getByText("1 grace week left")).toBeInTheDocument();
});

it("says it could not load, never 'pick a friend', when the lookup fails", async () => {
  getMyBuddy.mockRejectedValue(new Error("boom"));
  getBuddyRequests.mockResolvedValue([]);
  renderCard();
  expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
  expect(screen.queryByText(/Pick a friend/)).not.toBeInTheDocument();
});

it("accepts an incoming request and shows the server's answer", async () => {
  getMyBuddy.mockResolvedValue(null);
  getBuddyRequests.mockResolvedValue([{ requestId: "r1", direction: "incoming", otherId: "u2", otherName: "Bo", otherAvatarSeed: "cd", requestedAt: "2026-10-06T00:00:00Z" }]);
  respondBuddyRequest.mockResolvedValue({ status: "friend_paired" });
  renderCard();
  fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
  await waitFor(() => expect(respondBuddyRequest).toHaveBeenCalledWith({ data: { requestId: "r1", accept: true } }));
  expect(await screen.findByText("Your friend already has a study buddy.")).toBeInTheDocument();
});

it("hides Ask-to-be-buddy buttons while the user already has a buddy", async () => {
  getMyBuddy.mockResolvedValue({ pairId: "p1", buddyId: "u2", buddyName: "Bo", buddyAvatarSeed: "cd", pairedAt: "2026-10-01T00:00:00Z", weekStart: "2026-10-05", myCount: 0, buddyCount: 0, goal: 3, streakWeeks: 0, graceAvailable: true, lastOutcome: null });
  getBuddyRequests.mockResolvedValue([]);
  renderWithClient(<><BuddyCard /><AskBuddyButton friendId="00000000-0000-0000-0000-000000000003" /></>);
  expect(await screen.findByText("Bo")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ask to be study buddy" })).not.toBeInTheDocument();
});

it("asks a friend and shows the server's answer", async () => {
  getMyBuddy.mockResolvedValue(null);
  getBuddyRequests.mockResolvedValue([]);
  requestBuddy.mockResolvedValue({ status: "requested" });
  renderWithClient(<AskBuddyButton friendId="00000000-0000-0000-0000-000000000003" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask to be study buddy" }));
  await waitFor(() => expect(requestBuddy).toHaveBeenCalledWith({ data: { friendId: "00000000-0000-0000-0000-000000000003" } }));
  expect(await screen.findByText("Request sent. They'll see it on their Friends page.")).toBeInTheDocument();
});
```

(Also: decline, cancel outgoing, end with confirm (`window.confirm` mocked), singular "Streak: 1 week".)

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** with the existing card styling (`rounded-2xl border border-hairline bg-surface p-4`, as `TeamMissionCard.tsx`). **Step 4: Run, PASS.** **Step 5:** privacy line: "If you pair with a friend as study buddies, each of you can see the other's lesson count for the week and your shared streak." **Step 6: Commit** `feat(buddy): study buddy card on the Friends page`

---

### Task 6: Ship

- [ ] Full web gate: `bunx prettier --check "src/**/*.{ts,tsx}"`, `bun run lint`, `bunx tsc --noEmit`, `bun run test` (re-run any single failure alone: starved runs on this machine).
- [ ] Docs: CHANGELOG entry; ARCHITECTURE (buddy tables and RPCs); AGENTS (one row: "buddy pairs: one active per user is `buddy_members`' primary key; end a pair only through `_end_buddy_pair_between`"); `docs/database-privileges.md` (the four tables); spec status table (3a in flight, 3b waiting on the age rating); BACKLOG (out of git), SESSION-CONTEXT, memory.
- [ ] Fresh `fable` reviewer on the branch; fix what it confirms.
- [ ] `git fetch` + two-dot diff against `origin/main`; push; PR; answer CodeRabbit; merge when green (expect `types-fresh` red until deploy).
- [ ] After the deploy: re-run probe scenarios P2-P4 and P6 against the DEPLOYED functions (install nothing), verify grants via `information_schema.role_table_grants` and `has_function_privilege`, leftover check, then confirm `types-fresh` is green on main (regenerate types if not).
- [ ] Remove the worktree (rmdir the `node_modules` junction first).
