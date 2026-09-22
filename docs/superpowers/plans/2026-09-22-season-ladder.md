# Season Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Duolingo-style weekly promotion/demotion ladder — ~30-person cohorts, ranked by weekly XP, top third promotes a division, bottom sixth demotes one, resolved lazily (no cron) — distinct from the existing permanent `league_tier` milestone badge.

**Architecture:** Unlike Teams (plain SQL RPCs), cohort resolution here is genuinely complex — rank up to 30 members, compute floor-based promotion/demotion, batch-write placements, then find-or-create a new cohort — so it's built as a Deno Edge Function (`get-season-status`, mirroring `complete-lesson`'s shape) with the ranking/promotion math extracted into a pure, unit-tested module, not raw PL/pgSQL. Depends on `weekly_xp` (separate prerequisite plan). Linked from the existing `/league` (web) and `LeaderboardView` (iOS) surfaces, same as Teams — not a new primary nav entry.

**Tech Stack:** PostgreSQL (migration + one small batch-fetch SQL function), Deno/TypeScript (Edge Function), TanStack Start + React (web), Swift/SwiftUI (iOS).

**Spec:** `docs/superpowers/specs/2026-09-22-deeper-gamification-design.md` ("2. Season ladder" section)

## Global Constraints

- Requires `public.weekly_xp(_user_id uuid, _week_start date)` to already exist (separate plan, merge first).
- Monday-start ISO week, same boundary as everywhere else in this feature.
- 5 divisions, numbered 1 (lowest) to 5 (highest). Division 5 has no promotion target; Division 1 has no demotion target.
- Promotion/demotion: `floor(cohort_size / 3)` promote, `floor(cohort_size / 6)` demote — floor, not round, so tiny cohorts safely resolve to zero movement.
- Cohort cap: 30 members, same room-or-create logic pattern as Teams' `auto_join_team`.
- Lazy resolution only — no scheduled job.
- iOS has no local Xcode/macOS in this dev environment — iOS tasks verified via PR-triggered CI.
- Migrations need explicit human go-ahead before merging to `main`.

---

### Task 1: Migration — season tables + `get_cohort_weekly_xp`

**Files:**
- Create: `supabase/migrations/<timestamp>_season_ladder.sql`

**Interfaces:**
- Produces: `public.get_cohort_weekly_xp(_cohort_id uuid, _week_start date) RETURNS TABLE(user_id uuid, xp integer)` — a single batched call so the Edge Function doesn't make up to 30 round-trips per resolution.

- [ ] **Step 1: Write the migration**

```sql
-- Season ladder -- V4 candidate #7 (deeper gamification, docs/
-- superpowers/specs/2026-09-22-deeper-gamification-design.md).
-- Weekly promotion/demotion cohorts, resolved by the get-season-status
-- Edge Function (not raw SQL -- the ranking/promotion math is complex
-- enough to want real unit tests, which PL/pgSQL can't give us).
CREATE TABLE public.season_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division integer NOT NULL CHECK (division BETWEEN 1 AND 5),
  week_start date NOT NULL,
  resolved_at timestamptz
);
GRANT ALL ON public.season_cohorts TO service_role;
ALTER TABLE public.season_cohorts ENABLE ROW LEVEL SECURITY;
-- No client policy -- only the Edge Function (service_role) touches
-- this table directly; clients only ever see it through the Edge
-- Function's response.

CREATE TABLE public.season_cohort_members (
  cohort_id uuid NOT NULL REFERENCES public.season_cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (cohort_id, user_id)
);
GRANT ALL ON public.season_cohort_members TO service_role;
ALTER TABLE public.season_cohort_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.season_placements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  division integer NOT NULL,
  rank_in_cohort integer NOT NULL,
  cohort_size integer NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
GRANT ALL ON public.season_placements TO service_role;
ALTER TABLE public.season_placements ENABLE ROW LEVEL SECURITY;

-- Batched weekly-XP fetch for a whole cohort in one round trip (up to
-- 30 members) instead of the Edge Function calling weekly_xp once per
-- member.
CREATE OR REPLACE FUNCTION public.get_cohort_weekly_xp(_cohort_id uuid, _week_start date)
RETURNS TABLE(user_id uuid, xp integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scm.user_id, public.weekly_xp(scm.user_id, _week_start)
  FROM public.season_cohort_members scm
  WHERE scm.cohort_id = _cohort_id;
$$;
REVOKE ALL ON FUNCTION public.get_cohort_weekly_xp(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO service_role;
```

- [ ] **Step 2: Commit**

```bash
git checkout -b feat/gamification-season-ladder main
git add supabase/migrations/<timestamp>_season_ladder.sql
git commit -m "feat: season ladder tables + get_cohort_weekly_xp (V4 #7 pt 1)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure resolution logic (`season-math.ts`), unit tested

**Files:**
- Create: `supabase/functions/get-season-status/season-math.ts`
- Test: `supabase/functions/get-season-status/season-math.test.ts`

**Interfaces:**
- Produces: `weekStartFor(now: Date): string` (YYYY-MM-DD, Monday of `now`'s ISO week), `rankCohort(members: {userId: string; xp: number}[]): {userId: string; rank: number}[]` (1-indexed, ties broken by `userId` string order for determinism), `computePromotions(ranked: {userId: string; rank: number}[], currentDivision: number): {userId: string; newDivision: number}[]`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { weekStartFor, rankCohort, computePromotions } from "./season-math.ts";

Deno.test("weekStartFor returns the Monday of the given date's ISO week", () => {
  // 2026-09-24 is a Thursday
  assertEquals(weekStartFor(new Date("2026-09-24T12:00:00Z")), "2026-09-21");
  // 2026-09-21 is already a Monday
  assertEquals(weekStartFor(new Date("2026-09-21T00:00:00Z")), "2026-09-21");
  // 2026-09-27 is a Sunday -- still the same week as the 21st
  assertEquals(weekStartFor(new Date("2026-09-27T23:59:59Z")), "2026-09-21");
});

Deno.test("rankCohort sorts by xp descending, 1-indexed", () => {
  const ranked = rankCohort([
    { userId: "a", xp: 100 },
    { userId: "b", xp: 300 },
    { userId: "c", xp: 200 },
  ]);
  assertEquals(ranked, [
    { userId: "b", rank: 1 },
    { userId: "c", rank: 2 },
    { userId: "a", rank: 3 },
  ]);
});

Deno.test("rankCohort breaks ties by userId for determinism", () => {
  const ranked = rankCohort([
    { userId: "z", xp: 100 },
    { userId: "a", xp: 100 },
  ]);
  assertEquals(ranked, [
    { userId: "a", rank: 1 },
    { userId: "z", rank: 2 },
  ]);
});

Deno.test("computePromotions: cohort of 30 promotes top 10, demotes bottom 5", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 3);
  const promoted = result.filter((r) => r.newDivision === 4).map((r) => r.userId);
  const demoted = result.filter((r) => r.newDivision === 2).map((r) => r.userId);
  const stayed = result.filter((r) => r.newDivision === 3).map((r) => r.userId);
  assertEquals(promoted.length, 10);
  assertEquals(demoted.length, 5);
  assertEquals(stayed.length, 15);
  assertEquals(promoted, ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10"]);
  assertEquals(demoted, ["u26", "u27", "u28", "u29", "u30"]);
});

Deno.test("computePromotions: tiny cohort (size 2) promotes and demotes nobody (floor rounding)", () => {
  const ranked = [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }];
  const result = computePromotions(ranked, 2);
  assertEquals(result.every((r) => r.newDivision === 2), true);
});

Deno.test("computePromotions: Division 5 has no promotion target, top performers stay", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 5);
  assertEquals(result.filter((r) => r.newDivision === 5).length, 25); // top 10 would've promoted, capped at 5
  assertEquals(result.filter((r) => r.newDivision === 4).length, 5); // bottom 5 still demote normally
});

Deno.test("computePromotions: Division 1 has no demotion target, bottom performers stay", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 1);
  assertEquals(result.filter((r) => r.newDivision === 2).length, 10); // top 10 still promote normally
  assertEquals(result.filter((r) => r.newDivision === 1).length, 20); // bottom 5 would've demoted, floored at 1
});
```

- [ ] **Step 2: Run to verify failure**

Run: `deno test supabase/functions/get-season-status/season-math.test.ts` — expect failure (module doesn't exist yet).

- [ ] **Step 3: Implement**

```typescript
// Pure logic for season-ladder resolution -- deliberately no Supabase
// client, no I/O, so it's testable without a database. Consumed by
// index.ts, which handles all the actual reads/writes.

/** Monday of `now`'s ISO week, as YYYY-MM-DD. Same boundary as
 *  get_leaderboard/weekly_xp's SQL definition
 *  (current_date - (isodow - 1)), reimplemented here in TS since this
 *  runs before any DB round trip. */
export function weekStartFor(now: Date): string {
  const isoDow = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // Sun=0 -> 7
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (isoDow - 1));
  return monday.toISOString().slice(0, 10);
}

export type CohortMember = { userId: string; xp: number };
export type RankedMember = { userId: string; rank: number };
export type Promotion = { userId: string; newDivision: number };

/** Descending by xp; ties broken by userId for deterministic,
 *  reproducible results (matters for tests and for not depending on
 *  whatever order Postgres happened to return rows in). */
export function rankCohort(members: CohortMember[]): RankedMember[] {
  return [...members]
    .sort((a, b) => (b.xp - a.xp) || a.userId.localeCompare(b.userId))
    .map((m, i) => ({ userId: m.userId, rank: i + 1 }));
}

const MIN_DIVISION = 1;
const MAX_DIVISION = 5;

/** floor(size/3) promote one division, floor(size/6) demote one --
 *  never round, so a cohort too small to move anyone (size 1 or 2)
 *  safely resolves to zero movement. Division 5 has no promotion
 *  target, Division 1 has no demotion target -- those ranks just stay. */
export function computePromotions(ranked: RankedMember[], currentDivision: number): Promotion[] {
  const size = ranked.length;
  const promoteCount = Math.floor(size / 3);
  const demoteCount = Math.floor(size / 6);
  const promoteDivision = Math.min(currentDivision + 1, MAX_DIVISION);
  const demoteDivision = Math.max(currentDivision - 1, MIN_DIVISION);

  return ranked.map((m) => {
    if (m.rank <= promoteCount) return { userId: m.userId, newDivision: promoteDivision };
    if (m.rank > size - demoteCount) return { userId: m.userId, newDivision: demoteDivision };
    return { userId: m.userId, newDivision: currentDivision };
  });
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `deno test supabase/functions/get-season-status/season-math.test.ts` — expect 7 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-season-status/season-math.ts supabase/functions/get-season-status/season-math.test.ts
git commit -m "feat: pure season-ladder ranking/promotion math, unit tested (V4 #7 pt 2)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `get-season-status` Edge Function (resolution + room-or-create + status)

**Files:**
- Create: `supabase/functions/get-season-status/index.ts`
- Modify: `.github/workflows/ci.yml` — add `supabase functions deploy get-season-status` to the "Deploy Edge Functions" step's list (alongside `complete-lesson`/`start-lesson-session`/`grade-review`/`send-push`)

**Interfaces:**
- Consumes: `season-math.ts` (Task 2), `public.get_cohort_weekly_xp` (Task 1).
- Produces: an HTTP endpoint returning `{ division: number, rankInCohort: number, cohortSize: number, lastWeekResult: { division: number, rankInCohort: number, cohortSize: number } | null }`.

- [ ] **Step 1: Write the Edge Function**

```typescript
// Supabase Edge Function: get-season-status
//
// Client-invoked directly (standard user-JWT auth, same as
// complete-lesson -- not the service-role shared-secret pattern
// send-push uses, since there's a real end user asking for their own
// status here). Resolves the caller's previous week's cohort if it's
// unresolved (lazy, no cron -- same pattern as get_my_duels), then
// ensures the caller has a current-week cohort, and returns their
// live status. See docs/superpowers/specs/2026-09-22-deeper-
// gamification-design.md section 2.
import { createClient } from "@supabase/supabase-js";
import { weekStartFor, rankCohort, computePromotions } from "./season-math.ts";

const COHORT_CAP = 30;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const now = new Date();
  const currentWeekStart = weekStartFor(now);
  const prevWeekStart = weekStartFor(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  let lastWeekResult: { division: number; rankInCohort: number; cohortSize: number } | null = null;

  // Already resolved (or nothing to resolve) if a placement row exists.
  const { data: existingPlacement } = await admin
    .from("season_placements")
    .select("division, rank_in_cohort, cohort_size")
    .eq("user_id", userId)
    .eq("week_start", prevWeekStart)
    .maybeSingle();

  let currentDivision = 1;

  if (existingPlacement) {
    lastWeekResult = {
      division: existingPlacement.division,
      rankInCohort: existingPlacement.rank_in_cohort,
      cohortSize: existingPlacement.cohort_size,
    };
    currentDivision = existingPlacement.division;
  } else {
    // Find the caller's previous-week cohort, if they had one.
    const { data: prevMembership } = await admin
      .from("season_cohort_members")
      .select("cohort_id, season_cohorts!inner(division, week_start, resolved_at)")
      .eq("user_id", userId)
      .eq("season_cohorts.week_start", prevWeekStart)
      .maybeSingle();

    if (prevMembership) {
      const cohortId = prevMembership.cohort_id;
      const cohortDivision = (prevMembership as any).season_cohorts.division;

      // Atomically claim the right to resolve this cohort -- guards
      // against two concurrent callers (two members of the same
      // cohort both triggering resolution) double-processing it.
      const { data: claimed } = await admin
        .from("season_cohorts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", cohortId)
        .is("resolved_at", null)
        .select("id")
        .maybeSingle();

      if (claimed) {
        const { data: xpRows } = await admin.rpc("get_cohort_weekly_xp", {
          _cohort_id: cohortId,
          _week_start: prevWeekStart,
        });
        const members = (xpRows ?? []).map((r: { user_id: string; xp: number }) => ({ userId: r.user_id, xp: r.xp }));
        const ranked = rankCohort(members);
        const promotions = computePromotions(ranked, cohortDivision);

        await admin.from("season_placements").insert(
          promotions.map((p) => {
            const r = ranked.find((x) => x.userId === p.userId)!;
            return {
              user_id: p.userId,
              week_start: prevWeekStart,
              division: p.newDivision,
              rank_in_cohort: r.rank,
              cohort_size: ranked.length,
            };
          }),
        );
      }
      // Whether this call claimed the resolution or another concurrent
      // call already did, the placement row now exists (or will very
      // shortly) -- re-read it for this user specifically.
      const { data: placement } = await admin
        .from("season_placements")
        .select("division, rank_in_cohort, cohort_size")
        .eq("user_id", userId)
        .eq("week_start", prevWeekStart)
        .maybeSingle();
      if (placement) {
        lastWeekResult = { division: placement.division, rankInCohort: placement.rank_in_cohort, cohortSize: placement.cohort_size };
        currentDivision = placement.division;
      } else {
        currentDivision = cohortDivision;
      }
    }
    // else: no previous cohort at all (brand-new user) -- stays at
    // default Division 1, nothing to resolve.
  }

  // Ensure a current-week cohort at currentDivision -- room-or-create,
  // same pattern as Teams' auto_join_team.
  let { data: currentMembership } = await admin
    .from("season_cohort_members")
    .select("cohort_id, season_cohorts!inner(week_start)")
    .eq("user_id", userId)
    .eq("season_cohorts.week_start", currentWeekStart)
    .maybeSingle();

  let cohortId: string;
  if (currentMembership) {
    cohortId = currentMembership.cohort_id;
  } else {
    const { data: openCohorts } = await admin
      .from("season_cohorts")
      .select("id, season_cohort_members(count)")
      .eq("division", currentDivision)
      .eq("week_start", currentWeekStart);

    const withRoom = (openCohorts ?? []).find((c: any) => (c.season_cohort_members[0]?.count ?? 0) < COHORT_CAP);

    if (withRoom) {
      cohortId = withRoom.id;
    } else {
      const { data: newCohort } = await admin
        .from("season_cohorts")
        .insert({ division: currentDivision, week_start: currentWeekStart })
        .select("id")
        .single();
      cohortId = newCohort!.id;
    }
    await admin.from("season_cohort_members").insert({ cohort_id: cohortId, user_id: userId });
  }

  const { data: xpRows } = await admin.rpc("get_cohort_weekly_xp", { _cohort_id: cohortId, _week_start: currentWeekStart });
  const members = (xpRows ?? []).map((r: { user_id: string; xp: number }) => ({ userId: r.user_id, xp: r.xp }));
  const ranked = rankCohort(members);
  const myRank = ranked.find((r) => r.userId === userId)?.rank ?? ranked.length;

  return jsonResponse(
    { division: currentDivision, rankInCohort: myRank, cohortSize: ranked.length, lastWeekResult },
    200,
  );
}

Deno.serve(handleRequest);
```

- [ ] **Step 2: Add it to CI's Edge Function deploy list**

Open `.github/workflows/ci.yml`, find the "Deploy Edge Functions" step (the one currently listing `complete-lesson`/`start-lesson-session`/`grade-review`/`send-push`), add one line:

```yaml
          supabase functions deploy get-season-status
```

- [ ] **Step 3: Run Deno's typecheck on the function**

Run: `deno check supabase/functions/get-season-status/index.ts` — expect clean (matches how `complete-lesson`/`send-push` are verified in this repo's own CI, per `ci.yml`'s existing `deno-tests` job).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/get-season-status/index.ts .github/workflows/ci.yml
git commit -m "feat: get-season-status Edge Function (V4 #7 pt 3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Open PR, verify via CI (do not merge)

- [ ] **Step 1: Push and open a PR**

```bash
git push -u origin feat/gamification-season-ladder
gh pr create --title "V4 #7: Season ladder" --body "$(cat <<'EOF'
## Summary
Weekly promotion/demotion cohorts (~30 members, top third promotes, bottom sixth demotes, floor-rounded), resolved lazily via a new get-season-status Edge Function (not raw SQL -- the ranking/promotion math is unit-tested, mirroring complete-lesson's pure-logic-extraction pattern). Depends on weekly_xp (merged separately). Per docs/superpowers/specs/2026-09-22-deeper-gamification-design.md section 2.

## Test plan
- [x] `deno test supabase/functions/get-season-status/season-math.test.ts` -- 7/7 passing
- [x] `deno check supabase/functions/get-season-status/index.ts` clean
- [ ] CI (deno-tests, lint-and-typecheck, e2e)
- [ ] Migration/Edge Function not yet deployed to the live project -- needs explicit go-ahead before merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Watch CI, report the PR URL, stop for review**

Run `gh pr checks <number> --watch`. Report status, do not merge.

---

### Task 5: Web — `season.functions.ts` and `/season` route

**Files:**
- Create: `src/lib/season.functions.ts`
- Create: `src/routes/_authenticated/season.tsx`
- Create: `src/routes/_authenticated/season.test.tsx`
- Modify: `src/routes/_authenticated/league.tsx` — add a "Season" entry point link next to the Teams one added in the Teams plan

**Interfaces:**
- Produces: `getSeasonStatus()` (calls the Edge Function via `supabase.functions.invoke`), `SeasonStatus` type.

- [ ] **Step 1: Write `season.functions.ts`**

```typescript
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SeasonStatus = {
  division: number;
  rankInCohort: number;
  cohortSize: number;
  lastWeekResult: { division: number; rankInCohort: number; cohortSize: number } | null;
};

export const getSeasonStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeasonStatus | null> => {
    const { data, error } = await context.supabase.functions.invoke("get-season-status", { method: "GET" });
    if (error || !data) return null;
    return {
      division: data.division,
      rankInCohort: data.rankInCohort,
      cohortSize: data.cohortSize,
      lastWeekResult: data.lastWeekResult ?? null,
    };
  });
```

- [ ] **Step 2: Write `season.tsx`**

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { getSeasonStatus } from "../../lib/season.functions";

export const Route = createFileRoute("/_authenticated/season")({
  component: SeasonPage,
  head: () => ({ meta: [{ title: "Season — Alphonso" }] }),
});

function SeasonPage() {
  const { data: status, isLoading } = useQuery({ queryKey: ["seasonStatus"], queryFn: () => getSeasonStatus() });

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/league" aria-label="Back to league" className="text-ink-soft/70">←</Link>
          <h1 className="font-display text-[22px] font-semibold text-ink">Season</h1>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-ink-soft">Loading…</p>
        ) : status ? (
          <>
            <p className="mt-6 font-display text-[32px] font-semibold text-ink">Division {status.division}</p>
            <p className="mt-1 text-sm text-ink-soft">
              Rank {status.rankInCohort} of {status.cohortSize} this week
            </p>
            {status.lastWeekResult && (
              <p className="mt-4 text-xs text-ink-soft/80">
                Last week: Division {status.lastWeekResult.division}, rank {status.lastWeekResult.rankInCohort} of{" "}
                {status.lastWeekResult.cohortSize}
              </p>
            )}
          </>
        ) : (
          <p className="mt-6 text-sm text-ink-soft">Couldn't load your season status.</p>
        )}
      </div>
    </MobileFrame>
  );
}
```

- [ ] **Step 3: Write `season.test.tsx`**

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>{children}</a>
    ),
  };
});

const getSeasonStatus = vi.fn();
vi.mock("../../lib/season.functions", () => ({ getSeasonStatus }));

const { Route } = await import("./season");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => { getSeasonStatus.mockReset(); });

describe("Season page", () => {
  it("shows the current division and rank", async () => {
    getSeasonStatus.mockResolvedValue({ division: 3, rankInCohort: 5, cohortSize: 28, lastWeekResult: null });
    renderPage();
    expect(await screen.findByText("Division 3")).toBeInTheDocument();
    expect(screen.getByText("Rank 5 of 28 this week")).toBeInTheDocument();
  });

  it("shows last week's result when present", async () => {
    getSeasonStatus.mockResolvedValue({
      division: 3, rankInCohort: 5, cohortSize: 28,
      lastWeekResult: { division: 2, rankInCohort: 1, cohortSize: 25 },
    });
    renderPage();
    expect(await screen.findByText(/Last week: Division 2, rank 1 of/)).toBeInTheDocument();
  });

  it("shows a fallback message when status fails to load", async () => {
    getSeasonStatus.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("Couldn't load your season status.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the new tests, typecheck, lint**

Run: `bunx tsc --noEmit && bun run test -- season.test.tsx && bun run lint`.

- [ ] **Step 5: Add the entry point in `league.tsx`**

Same spot as the Teams link added in the Teams plan:

```tsx
<Link to="/season" className="text-xs font-medium text-moss underline underline-offset-4">
  Season →
</Link>
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/season.functions.ts src/routes/_authenticated/season.tsx \
  src/routes/_authenticated/season.test.tsx src/routes/_authenticated/league.tsx
git commit -m "feat: web /season route + entry point from /league (V4 #7 pt 4)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 6: iOS — Kit client + `SeasonView.swift`

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift` (4-line access-level change only — see Step 1; skip if the Teams or Challenges plan already applied it)
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Season.swift`
- Create: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+SeasonTests.swift`
- Create: `ios/LearnWithAlphonso/Sources/SeasonView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LeaderboardView.swift` — add a `NavigationLink` to `SeasonView`, next to the Teams one

**Why separate files, not `ProgressSyncClient.swift` directly**: this plan can run in parallel with the Teams plan (both only depend on `weekly_xp`, not on each other) — if both edited the same source/test files directly, running them in parallel worktrees guarantees a merge conflict. Same reasoning as the Teams plan's Task 6.

**Interfaces:**
- Consumes: `get-season-status` Edge Function (Task 3).
- Produces: `SeasonStatus` struct, `ProgressSyncClient.getSeasonStatus() async throws -> SeasonStatus?`.

- [ ] **Step 1: Widen `ProgressSyncClient`'s stored properties from `private` to `internal` (skip if already done)**

Run `grep -n "private let supabaseURL" ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift` first — if it reports nothing, this was already applied (by the Teams or Challenges plan, if implemented first) and this step is a no-op; skip to Step 2. Otherwise apply the exact same change described in the Teams plan's Task 6 Step 1 (`private let supabaseURL/anonKey/accessToken/requester` → drop `private`).

**Verified live via a real CI failure while implementing the Challenges plan**: the stored properties aren't the only thing that needs widening — `private static func requireSuccess(data:response:)` (used by every RPC-calling method via `try Self.requireSuccess(...)`) is also `private` and needs the same treatment (`private static func` → `static func`). Check both in the same grep pass; a plan that only widens the four stored properties will compile-fail in CI on this method specifically.

- [ ] **Step 2: Create `ProgressSyncClient+Season.swift` with the type and client method**

```swift
import Foundation

public struct SeasonLastWeekResult: Sendable, Equatable {
    public let division: Int
    public let rankInCohort: Int
    public let cohortSize: Int
}

public struct SeasonStatus: Sendable, Equatable {
    public let division: Int
    public let rankInCohort: Int
    public let cohortSize: Int
    public let lastWeekResult: SeasonLastWeekResult?
}

extension ProgressSyncClient {

/// Calls the get-season-status Edge Function -- resolves the caller's
/// previous week's cohort lazily as a side effect (same pattern as
/// fetchLeaderboard's direct-RPC calls, just invoking a Function
/// instead of a Postgres RPC since the resolution logic is too
/// complex for plain SQL).
public func getSeasonStatus() async throws -> SeasonStatus? {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("functions/v1/get-season-status"))
    request.httpMethod = "GET"
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let division = json["division"] as? Int,
          let rankInCohort = json["rankInCohort"] as? Int,
          let cohortSize = json["cohortSize"] as? Int else {
        return nil
    }
    var lastWeek: SeasonLastWeekResult?
    if let lw = json["lastWeekResult"] as? [String: Any],
       let lwDivision = lw["division"] as? Int,
       let lwRank = lw["rankInCohort"] as? Int,
       let lwSize = lw["cohortSize"] as? Int {
        lastWeek = SeasonLastWeekResult(division: lwDivision, rankInCohort: lwRank, cohortSize: lwSize)
    }
    return SeasonStatus(division: division, rankInCohort: rankInCohort, cohortSize: cohortSize, lastWeekResult: lastWeek)
}

} // extension ProgressSyncClient
```

- [ ] **Step 3: Create `ProgressSyncClient+SeasonTests.swift`**

Same self-contained-file approach as the Teams plan's Task 6 Step 3 — a fresh `XCTestCase` subclass duplicating `makeClient`/a JSON-response helper rather than sharing the main test file's `private` ones. Read `ProgressSyncClientTests.swift`'s actual current helpers first and copy their real shape (constructor parameter names, `Requester` typealias) rather than this sketch.

**One real difference from the Teams/Challenges test files**: `get-season-status` is an Edge Function returning a single JSON *object* (`{"division": 3, ...}`), not a row array like every RPC call in this codebase returns. If the shared `jsonResponse(for:body:)` shape (copied from `ProgressSyncClientTests.swift`) always wraps `body` as `[body]` (array-of-one) to match RPC responses, this file needs its own variant that does NOT wrap — write it as `jsonObjectResponse(for:body:)` returning the object literally, alongside the copied `makeClient`.

```swift
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientSeasonTests: XCTestCase {
    private func makeClient(handler: @escaping @Sendable (URLRequest) -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "test-anon-key",
            accessToken: "test-access-token",
            requester: { handler($0) }
        )
    }

    private func jsonObjectResponse(for url: URL, body: [String: Any], status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }

    // MARK: - Season

    func testGetSeasonStatusDecodesWithoutLastWeekResult() async throws {
        let client = makeClient { request in
            self.jsonObjectResponse(for: request.url!, body: ["division": 3, "rankInCohort": 5, "cohortSize": 28, "lastWeekResult": NSNull()])
        }
        let status = try await client.getSeasonStatus()
        XCTAssertEqual(status, SeasonStatus(division: 3, rankInCohort: 5, cohortSize: 28, lastWeekResult: nil))
    }

    func testGetSeasonStatusDecodesWithLastWeekResult() async throws {
        let client = makeClient { request in
            self.jsonObjectResponse(for: request.url!, body: [
                "division": 3, "rankInCohort": 5, "cohortSize": 28,
                "lastWeekResult": ["division": 2, "rankInCohort": 1, "cohortSize": 25],
            ])
        }
        let status = try await client.getSeasonStatus()
        XCTAssertEqual(status?.lastWeekResult, SeasonLastWeekResult(division: 2, rankInCohort: 1, cohortSize: 25))
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift \
  ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Season.swift \
  ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+SeasonTests.swift
git commit -m "feat: iOS Kit client for get-season-status (V4 #7 pt 5)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Write `SeasonView.swift`**

```swift
import SwiftUI
import LearnWithAlphonsoKit

/// Linked from LeaderboardView, same reasoning as TeamsView -- no room
/// for a 9th bottom tab.
struct SeasonView: View {
    let session: Session

    @State private var status: SeasonStatus?
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let status {
                Section {
                    Text("Division \(status.division)").font(.largeTitle.bold())
                    Text("Rank \(status.rankInCohort) of \(status.cohortSize) this week").foregroundStyle(.secondary)
                }
                if let lastWeek = status.lastWeekResult {
                    Section("Last week") {
                        Text("Division \(lastWeek.division), rank \(lastWeek.rankInCohort) of \(lastWeek.cohortSize)")
                    }
                }
            } else {
                Text("Couldn't load your season status.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Season")
        .task {
            guard let accessToken = session.accessToken else { isLoading = false; return }
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            status = try? await client.getSeasonStatus()
            isLoading = false
        }
    }
}
```

- [ ] **Step 6: Add the entry point in `LeaderboardView.swift`**

```swift
NavigationLink("Season") {
    SeasonView(session: session)
}
```

(Next to the `NavigationLink("Teams")` added in the Teams plan.)

- [ ] **Step 7: Open a PR and let CI verify (`ios-app-build`/`ios-swift-tests`) — do not merge**

```bash
git add ios/LearnWithAlphonso/Sources/SeasonView.swift ios/LearnWithAlphonso/Sources/LeaderboardView.swift
git commit -m "feat: iOS SeasonView, linked from LeaderboardView (V4 #7 pt 6)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
gh pr checks <this-branch's-PR-number> --watch
```

Report the CI result. If green, this plan's deliverable (Season Ladder, fully built and CI-verified on both platforms) is done — merging to `main` needs explicit human go-ahead.
