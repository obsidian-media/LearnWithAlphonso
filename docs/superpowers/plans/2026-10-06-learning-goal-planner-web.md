# Learning goal planner, part 1 (web, route, migration) Implementation Plan

> Status (2026-10-09): implemented (#223; the default table privileges were revoked in #224).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A learner sets "finish B1 by <date>" on the Learn page and sees lessons per week, status, and a suggested date; the plan is computed once on the server.

**Architecture:** A pure `planGoal` function (`src/lib/learning-goal.ts`) is the only place the maths lives. A new `learning_goals` table stores `(user, course, target level, target date)`. `/api/learning-goal` (GET stored, GET preview, PUT, DELETE) loads the learner's level and completions, calls `planGoal`, and returns `{ goal, plan }`. The web renders it in a `GoalCard`. iOS and Android are separate later plans that render the same JSON.

**Tech Stack:** TanStack Start API routes, Supabase Postgres + RLS, Vitest + Testing Library, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md` (owner answers recorded at its end). This plan is rollout step 1 only; steps 2 (iOS) and 3 (Android) get their own plans.

## Global Constraints

- "Reaching a level" means **finishing** it; the UI says "Finish B1".
- Warning limits are named constants: `AMBITIOUS_PER_WEEK = 14`, `UNREALISTIC_PER_WEEK = 35`. Recent-pace window `RECENT_DAYS = 7`. Longest goal `MAX_GOAL_DAYS = 1095`.
- Days are UTC (`YYYY-MM-DD`), like the rest of the app. The recent window is a rolling 7 days, never a calendar week.
- Target levels allowed: `A1..C1` (this corrects the spec's `A2..C1`: a learner at A1 may want to finish A1; the spec is fixed in Task 5). A target below the current level is rejected on write and returns `plan: null` on read.
- Free and Pro both get the planner. No AI call, no quota.
- No backslash characters in code or regexes (use `[0-9]`), because file writes in this environment drop them.
- Web and API ship live on merge. No iOS build is cut.
- Database writes happen in the route with `supabaseAdmin`; `authenticated` gets SELECT only.

## Review Focus

- A goal date in the past, today, or invalid (`2026-02-30`) must never reach the database.
- A learner whose level was raised after setting a goal (target now below current) must get `plan: null`, not a 500.
- The preview request must write nothing.
- A database read error must be a 500, never "no goal".
- A replay of an old lesson must not raise `lessonsDoneLast7Days` (completed_at is first completion; the plan relies on it).
- The learner's own data only: another user's goal must never be readable (RLS is SELECT-own; the route filters by the token's user id).

## File Structure

- Create `src/lib/learning-goal.ts` and `src/lib/learning-goal.test.ts`, `src/lib/learning-goal.fixtures.json` (pure plan maths, validation, shared fixtures)
- Create `supabase/migrations/20261006100000_learning_goals.sql`, `src/lib/learning-goal-migration.test.ts`
- Modify `src/integrations/supabase/types.ts` (hand-add the table, matching generator output), `src/lib/account.functions.ts`
- Create `src/lib/learning-goal.server.ts`, `src/routes/api/learning-goal.ts`, `src/routes/api/learning-goal.test.ts`
- Create `src/lib/learning-goal-client.ts`, `src/lib/learning-goal-client.test.ts`, `src/components/GoalCard.tsx`, `src/components/GoalCard.test.tsx`
- Modify `src/routes/_authenticated/learn.tsx` (render the card), `src/routes/privacy.tsx`, README, ARCHITECTURE, AGENTS, CHANGELOG, the spec

---

### Task 1: The plan maths (pure) and shared fixtures

**Files:**
- Create: `src/lib/learning-goal.ts`
- Test: `src/lib/learning-goal.test.ts`, `src/lib/learning-goal.fixtures.json`

**Interfaces:**
- Produces: `LEVEL_ORDER`, the four constants above, types `GoalStatus`, `GoalRealism`, `GoalPlan`, `PlanInput`, `GoalInput`, and functions `planGoal(input: PlanInput): GoalPlan | null`, `isRealDate(s: string): boolean`, `validateGoalInput(raw: unknown, ctx: { now: Date; currentLevel: Level }): { ok: true; value: GoalInput } | { ok: false; error: string }`.
- `PlanInput = { currentLevel: Level; targetLevel: Level; targetDate: string; lessonsByLevel: Record<Level, string[]>; completedAt: Record<string, string>; goalCreatedAt: string | null; now: Date }`. `goalCreatedAt` is null for a preview.
- `GoalInput = { course: "en" | "fr" | "es"; targetLevel: Level; targetDate: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/learning-goal.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Level } from "../data/levels";
import {
  AMBITIOUS_PER_WEEK,
  LEVEL_ORDER,
  UNREALISTIC_PER_WEEK,
  isRealDate,
  planGoal,
  validateGoalInput,
  type PlanInput,
} from "./learning-goal";

const NOW = new Date("2026-10-06T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function lessons(per = 10): Record<Level, string[]> {
  const out = {} as Record<Level, string[]>;
  for (const l of LEVEL_ORDER) out[l] = Array.from({ length: per }, (_, i) => `${l}-${i}`);
  return out;
}
/** Completed ids with the given age in days, e.g. done(["A1-0","A1-1"], 2). */
function done(ids: string[], ageDays: number): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, daysAgo(ageDays)]));
}
const ids = (level: Level, n: number) => Array.from({ length: n }, (_, i) => `${level}-${i}`);

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    currentLevel: "A1",
    targetLevel: "B1",
    targetDate: "2026-10-20", // 14 days = 2 weeks away
    lessonsByLevel: lessons(),
    completedAt: {},
    goalCreatedAt: daysAgo(30),
    now: NOW,
    ...over,
  };
}

describe("planGoal scope", () => {
  it("counts from the current level, not from A1", () => {
    const plan = planGoal(input({ currentLevel: "B1", targetLevel: "B1" }))!;
    expect(plan.lessonsInScope).toBe(10);
    expect(plan.lessonsRemaining).toBe(10);
  });
  it("spans every level between current and target, inclusive", () => {
    expect(planGoal(input())!.lessonsInScope).toBe(30);
  });
  it("excludes completed lessons from remaining, and ignores completions outside scope", () => {
    const completedAt = { ...done(ids("A1", 4), 20), ...done(ids("C1", 5), 20) };
    const plan = planGoal(input({ completedAt }))!;
    expect(plan.lessonsRemaining).toBe(26);
  });
  it("returns null when the target is below the current level", () => {
    expect(planGoal(input({ currentLevel: "B2", targetLevel: "B1" }))).toBeNull();
  });
});

describe("planGoal pace", () => {
  it("rounds the weekly requirement UP", () => {
    expect(planGoal(input())!.requiredPerWeek).toBe(15); // 30 over 2 weeks
    expect(planGoal(input({ completedAt: done(["A1-0"], 20) }))!.requiredPerWeek).toBe(15); // 29/2 = 14.5
    expect(planGoal(input({ completedAt: done(ids("A1", 2), 20) }))!.requiredPerWeek).toBe(14); // 28/2
  });
  it("never divides by less than one day, so a date of today or earlier is a one-day week", () => {
    const plan = planGoal(input({ targetDate: "2026-10-06", currentLevel: "B1", targetLevel: "B1" }))!;
    expect(plan.requiredPerWeek).toBe(70); // 10 lessons x 7
    const past = planGoal(input({ targetDate: "2026-09-01", currentLevel: "B1", targetLevel: "B1" }))!;
    expect(past.requiredPerWeek).toBe(70);
  });
  it("counts only distinct lessons completed in the last 7 days", () => {
    const completedAt = { ...done(["A1-0"], 6.9), ...done(["A1-1"], 7.1) };
    expect(planGoal(input({ completedAt }))!.lessonsDoneLast7Days).toBe(1);
  });
});

describe("planGoal status", () => {
  it("done when nothing remains", () => {
    const all = Object.keys(
      Object.fromEntries(LEVEL_ORDER.slice(0, 3).flatMap((l) => ids(l, 10).map((i) => [i, 1]))),
    );
    const plan = planGoal(input({ completedAt: done(all, 1) }))!;
    expect(plan.status).toBe("done");
    expect(plan.requiredPerWeek).toBe(0);
  });
  it("just_started for a goal under 7 days old, and for a preview", () => {
    expect(planGoal(input({ goalCreatedAt: daysAgo(2) }))!.status).toBe("just_started");
    expect(planGoal(input({ goalCreatedAt: null }))!.status).toBe("just_started");
  });
  it("behind with no recent lessons", () => {
    expect(planGoal(input())!.status).toBe("behind");
  });
  it("behind, on_track and ahead against the requirement", () => {
    // 5 done: remaining 25, required 13, did 5 -> behind
    expect(planGoal(input({ completedAt: done(ids("A1", 5), 2) }))!.status).toBe("behind");
    // 10 done: remaining 20, required 10, did 10 -> on_track (below 1.25x)
    expect(planGoal(input({ completedAt: done(ids("A1", 10), 2) }))!.status).toBe("on_track");
    // 15 done: remaining 15, required 8, did 15 (>= 10) -> ahead
    const completedAt = { ...done(ids("A1", 10), 2), ...done(ids("A2", 5), 2) };
    expect(planGoal(input({ completedAt }))!.status).toBe("ahead");
  });
});

describe("planGoal realism and suggested date", () => {
  const per = (n: number) => {
    // choose remaining so that required = n over two weeks
    const plan = planGoal(input({ lessonsByLevel: lessons(n * 2), currentLevel: "A1", targetLevel: "A1" }))!;
    return plan;
  };
  it("labels by the named thresholds", () => {
    expect(per(AMBITIOUS_PER_WEEK).realism).toBe("ok");
    expect(per(AMBITIOUS_PER_WEEK + 1).realism).toBe("ambitious");
    expect(per(UNREALISTIC_PER_WEEK).realism).toBe("ambitious");
    expect(per(UNREALISTIC_PER_WEEK + 1).realism).toBe("unrealistic");
  });
  it("suggests a date from the recent pace when behind", () => {
    // 5 done in the last 7 days, 25 remaining -> ceil(25 / 5 * 7) = 35 days
    const plan = planGoal(input({ completedAt: done(ids("A1", 5), 2) }))!;
    expect(plan.suggestedDate).toBe("2026-11-10");
  });
  it("suggests nothing when the recent pace is zero, or when on track and realistic", () => {
    expect(planGoal(input())!.suggestedDate).toBeNull();
    expect(planGoal(input({ completedAt: done(ids("A1", 10), 2) }))!.suggestedDate).toBeNull();
  });
});

describe("isRealDate and validateGoalInput", () => {
  it("rejects impossible and malformed dates", () => {
    expect(isRealDate("2026-10-20")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-20", "2026-10-2", "", "tomorrow"]) {
      expect(isRealDate(bad), bad).toBe(false);
    }
  });
  const ctx = { now: NOW, currentLevel: "A2" as Level };
  const ok = { course: "en", targetLevel: "B1", targetDate: "2026-12-01" };
  it("accepts a valid goal", () => {
    expect(validateGoalInput(ok, ctx)).toEqual({ ok: true, value: ok });
  });
  it.each([
    ["not an object", null],
    ["unknown course", { ...ok, course: "de" }],
    ["unknown level", { ...ok, targetLevel: "D1" }],
    ["level below current", { ...ok, targetLevel: "A1" }],
    ["date today", { ...ok, targetDate: "2026-10-06" }],
    ["date in the past", { ...ok, targetDate: "2026-09-01" }],
    ["impossible date", { ...ok, targetDate: "2026-02-30" }],
    ["more than three years out", { ...ok, targetDate: "2030-01-01" }],
    ["non-string date", { ...ok, targetDate: 20261201 }],
  ])("rejects %s", (_name, raw) => {
    expect(validateGoalInput(raw, ctx)).toMatchObject({ ok: false });
  });
  it("allows finishing the current level", () => {
    expect(validateGoalInput({ ...ok, targetLevel: "A2" }, ctx)).toMatchObject({ ok: true });
  });
});

// The response shape is the cross-platform contract: iOS and Android decode these samples.
// Regenerate with: UPDATE_FIXTURES=1 bun run test src/lib/learning-goal.test.ts
describe("shared fixtures", () => {
  const FILE = path.resolve(import.meta.dirname, "learning-goal.fixtures.json");
  const cases: Record<string, PlanInput> = {
    done: input({ completedAt: done(Object.keys(Object.fromEntries(LEVEL_ORDER.slice(0, 3).flatMap((l) => ids(l, 10).map((i) => [i, 1])))), 1) }),
    just_started: input({ goalCreatedAt: daysAgo(2) }),
    behind_with_suggestion: input({ completedAt: done(ids("A1", 5), 2) }),
    on_track: input({ completedAt: done(ids("A1", 10), 2) }),
    ahead: input({ completedAt: { ...done(ids("A1", 10), 2), ...done(ids("A2", 5), 2) } }),
    unrealistic: input({ lessonsByLevel: lessons(40), currentLevel: "A1", targetLevel: "A1" }),
  };
  const actual = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, planGoal(v)]));
  it("matches the checked-in samples", () => {
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(FILE, JSON.stringify(actual, null, 2) + "\n");
    expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(actual);
  });
  it("covers every status and both warning labels", () => {
    const plans = Object.values(actual);
    for (const status of ["done", "just_started", "behind", "on_track", "ahead"]) {
      expect(plans.some((p) => p?.status === status), status).toBe(true);
    }
    for (const realism of ["ambitious", "unrealistic"]) {
      expect(plans.some((p) => p?.realism === realism), realism).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/lib/learning-goal.test.ts`
Expected: FAIL, "Cannot find module './learning-goal'".

- [ ] **Step 3: Implement**

```ts
// src/lib/learning-goal.ts
import type { Level } from "../data/levels";

/**
 * The learning-goal plan, computed ONCE here and rendered by web, iOS and Android
 * (docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md). Clients never
 * redo this maths: a fix lands everywhere at once.
 */
export const LEVEL_ORDER: Level[] = ["A1", "A2", "B1", "B2", "C1"];
/** Product-tuning warning limits, in lessons per week (about 2 a day, then about 5). */
export const AMBITIOUS_PER_WEEK = 14;
export const UNREALISTIC_PER_WEEK = 35;
export const RECENT_DAYS = 7;
export const MAX_GOAL_DAYS = 1095;
const DAY_MS = 86_400_000;
const AHEAD_FACTOR = 1.25;

export type GoalStatus = "done" | "just_started" | "ahead" | "on_track" | "behind";
export type GoalRealism = "ok" | "ambitious" | "unrealistic";
export type GoalCourse = "en" | "fr" | "es";
export type GoalInput = { course: GoalCourse; targetLevel: Level; targetDate: string };

export type GoalPlan = {
  currentLevel: Level;
  targetLevel: Level;
  targetDate: string;
  lessonsInScope: number;
  lessonsRemaining: number;
  lessonsDoneLast7Days: number;
  requiredPerWeek: number;
  status: GoalStatus;
  realism: GoalRealism;
  suggestedDate: string | null;
  asOf: string;
};

export type PlanInput = {
  currentLevel: Level;
  targetLevel: Level;
  targetDate: string;
  lessonsByLevel: Record<Level, string[]>;
  /** lesson id -> ISO completed_at (the FIRST completion; replays do not change it). */
  completedAt: Record<string, string>;
  /** null for a preview (nothing saved yet). */
  goalCreatedAt: string | null;
  now: Date;
};

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const addDays = (date: string, days: number) =>
  new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);

export function isRealDate(s: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}

export function planGoal(input: PlanInput): GoalPlan | null {
  const from = LEVEL_ORDER.indexOf(input.currentLevel);
  const to = LEVEL_ORDER.indexOf(input.targetLevel);
  if (from < 0 || to < 0 || to < from) return null;

  const inScope = LEVEL_ORDER.slice(from, to + 1).flatMap((l) => input.lessonsByLevel[l] ?? []);
  const remaining = inScope.filter((id) => !(id in input.completedAt)).length;

  const today = input.now.toISOString().slice(0, 10);
  const daysLeft = Math.max(0, dayNumber(input.targetDate) - dayNumber(today));
  const weeksLeft = Math.max(daysLeft, 1) / 7;
  const required = remaining === 0 ? 0 : Math.ceil(remaining / weeksLeft);

  const cutoff = input.now.getTime() - RECENT_DAYS * DAY_MS;
  const recent = Object.values(input.completedAt).filter((at) => Date.parse(at) >= cutoff).length;

  const goalAgeMs = input.goalCreatedAt === null ? 0 : input.now.getTime() - Date.parse(input.goalCreatedAt);
  let status: GoalStatus;
  if (remaining === 0) status = "done";
  else if (input.goalCreatedAt === null || goalAgeMs < RECENT_DAYS * DAY_MS) status = "just_started";
  else if (recent >= required * AHEAD_FACTOR) status = "ahead";
  else if (recent >= required) status = "on_track";
  else status = "behind";

  const realism: GoalRealism =
    required > UNREALISTIC_PER_WEEK ? "unrealistic" : required > AMBITIOUS_PER_WEEK ? "ambitious" : "ok";

  const suggestedDate =
    (status === "behind" || realism === "unrealistic") && recent > 0
      ? addDays(today, Math.ceil((remaining / recent) * 7))
      : null;

  return {
    currentLevel: input.currentLevel,
    targetLevel: input.targetLevel,
    targetDate: input.targetDate,
    lessonsInScope: inScope.length,
    lessonsRemaining: remaining,
    lessonsDoneLast7Days: recent,
    requiredPerWeek: required,
    status,
    realism,
    suggestedDate,
    asOf: input.now.toISOString(),
  };
}

const COURSES = new Set<string>(["en", "fr", "es"]);

export function validateGoalInput(
  raw: unknown,
  ctx: { now: Date; currentLevel: Level },
): { ok: true; value: GoalInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request" };
  const { course, targetLevel, targetDate } = raw as Record<string, unknown>;
  if (typeof course !== "string" || !COURSES.has(course)) return { ok: false, error: "Unknown course" };
  if (typeof targetLevel !== "string" || !LEVEL_ORDER.includes(targetLevel as Level)) {
    return { ok: false, error: "Unknown level" };
  }
  if (LEVEL_ORDER.indexOf(targetLevel as Level) < LEVEL_ORDER.indexOf(ctx.currentLevel)) {
    return { ok: false, error: "That level is below yours" };
  }
  if (typeof targetDate !== "string" || !isRealDate(targetDate)) {
    return { ok: false, error: "That is not a valid date" };
  }
  const today = ctx.now.toISOString().slice(0, 10);
  const days = dayNumber(targetDate) - dayNumber(today);
  if (days < 1) return { ok: false, error: "Pick a date after today" };
  if (days > MAX_GOAL_DAYS) return { ok: false, error: "Pick a date within three years" };
  return { ok: true, value: { course: course as GoalCourse, targetLevel: targetLevel as Level, targetDate } };
}
```

- [ ] **Step 4: Generate the fixtures, then run to verify it passes**

Run: `UPDATE_FIXTURES=1 bun run test src/lib/learning-goal.test.ts` (writes the JSON), then `bun run test src/lib/learning-goal.test.ts`.
Expected: PASS. Open `learning-goal.fixtures.json` and read it: six samples, statuses `done`, `just_started`, `behind`, `on_track`, `ahead`, and `unrealistic` realism present.

- [ ] **Step 5: Mutation-check each rule** (break one at a time, expect red, restore): drop `Math.ceil` (rounding test); change `>=` to `>` in the on_track line; remove the `Math.max(daysLeft, 1)` floor; drop the `goalCreatedAt === null` clause; change the cutoff window to 8 days; swap `AMBITIOUS_PER_WEEK` and `UNREALISTIC_PER_WEEK`; remove the `recent > 0` guard; remove the `to < from` check; make `isRealDate` skip the round-trip comparison. Each must fail at least one test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/learning-goal.ts src/lib/learning-goal.test.ts src/lib/learning-goal.fixtures.json
git commit -m "feat(goal): pure plan maths, validation and shared fixtures"
```

---

### Task 2: Migration, generated-type entry, and export/delete guard

**Files:**
- Create: `supabase/migrations/20261006100000_learning_goals.sql`
- Test: `src/lib/learning-goal-migration.test.ts`
- Modify: `src/integrations/supabase/types.ts`, `src/lib/account.functions.ts`

**Interfaces:**
- Produces: table `public.learning_goals(user_id, language, target_level, target_date, created_at, updated_at)` PK `(user_id, language)`; types.ts entry so `supabaseAdmin.from("learning_goals")` type-checks; `"learning_goals"` in `USER_ID_EXPORT_TABLES`.

- [ ] **Step 1: Write the failing migration test**

```ts
// src/lib/learning-goal-migration.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006100000_learning_goals.sql";

describe("learning_goals migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");

  it("is newer than the latest migration it follows", () => {
    expect(FILE.slice(0, 14) > "20261005120000").toBe(true);
  });
  it("keys one goal per user and course and cascades with the account", () => {
    expect(sql()).toContain("PRIMARY KEY (user_id, language)");
    expect(sql()).toContain("REFERENCES auth.users(id) ON DELETE CASCADE");
  });
  it("constrains course and target level to the values the route accepts", () => {
    expect(sql()).toContain("CHECK (language IN ('en', 'fr', 'es'))");
    expect(sql()).toContain("CHECK (target_level IN ('A1', 'A2', 'B1', 'B2', 'C1'))");
  });
  it("lets a user READ their own goal only and gives clients no write grant", () => {
    const s = sql();
    expect(s).toContain("ENABLE ROW LEVEL SECURITY");
    expect(s).toContain("GRANT SELECT ON public.learning_goals TO authenticated");
    expect(s).toContain("FOR SELECT TO authenticated");
    expect(s).toContain("(SELECT auth.uid()) = user_id");
    expect(s).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`bun run test src/lib/learning-goal-migration.test.ts`; expected FAIL, file missing)

- [ ] **Step 3: Write the migration**

```sql
-- Learning goal planner (docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md).
-- One goal per user and course: "finish <target_level> by <target_date>". The plan itself
-- (lessons per week, status) is computed by /api/learning-goal, never stored.
-- Writes go through the route with the service role after validation, so clients get
-- SELECT only. VERSIONING: 20261006100000 sorts after the latest migration
-- (20261005120000_saved_word_review_items.sql).

CREATE TABLE public.learning_goals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('en', 'fr', 'es')),
  target_level text NOT NULL CHECK (target_level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  target_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language)
);

GRANT SELECT ON public.learning_goals TO authenticated;
GRANT ALL ON public.learning_goals TO service_role;
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_goals_select_own" ON public.learning_goals
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
```

- [ ] **Step 4: Add the generated-type entry.** Open `src/integrations/supabase/types.ts`, find the `language_progress` table block, and add a `learning_goals` block right after the blocks for tables sorting between `language_progress` and `lesson_completions`, copying the exact shape of a neighbouring table (`Row`, `Insert`, `Update`, `Relationships: []`) with the six columns (`created_at: string`, `language: string`, `target_date: string`, `target_level: string`, `updated_at: string`, `user_id: string`; optional in `Insert`/`Update` per defaults and PK). Note in the commit message that `regenerate-supabase-types.yml` will overwrite it after deploy; `types-fresh` is advisory and will show a diff until then.

- [ ] **Step 5: Add `"learning_goals"` to `USER_ID_EXPORT_TABLES`** in `src/lib/account.functions.ts` (alphabetical, after `"language_progress"`).

- [ ] **Step 6: Run** `bun run test src/lib/learning-goal-migration.test.ts src/lib/account.functions.test.ts` and `bunx tsc --noEmit`. Expected: PASS. If the account test demands a delete-list entry, read its message: `USER_DELETE_TABLES` only holds tables `authenticated` can DELETE from, which this table is not (the cascade handles it), so the right fix is to satisfy whatever the test says it needs, and record a ledger ruling if it differs from this plan.

- [ ] **Step 7: Mutation-check:** grant `INSERT` to authenticated (test must fail); drop the CASCADE (must fail); widen the level CHECK (must fail); remove the export-table entry (account test must fail).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261006100000_learning_goals.sql src/lib/learning-goal-migration.test.ts src/integrations/supabase/types.ts src/lib/account.functions.ts
git commit -m "feat(goal): learning_goals table (select-own RLS), types entry, export list"
```

---

### Task 3: Server module and `/api/learning-goal` route

**Files:**
- Create: `src/lib/learning-goal.server.ts`, `src/routes/api/learning-goal.ts`
- Test: `src/routes/api/learning-goal.test.ts`

**Interfaces:**
- Consumes: `planGoal`, `validateGoalInput`, `PlanInput`, `GoalPlan`, `LEVEL_ORDER` (Task 1); `getCourse`, `isCourse` from `@/data/courses`; table `learning_goals` (Task 2).
- Produces: `lessonsByLevel(course): Record<Level, string[]>` and `loadLearnerState(admin, userId, course): Promise<{ currentLevel: Level; completedAt: Record<string, string> }>` (throws on a database error). Route responses: `GET` stored `{ goal: { course, targetLevel, targetDate, createdAt } | null, plan: GoalPlan | null }`; `GET` preview `{ plan: GoalPlan | null }`; `PUT` `{ goal, plan }`; `DELETE` `{ ok: true }`. Errors `{ error: string }` with 400/401/500.

- [ ] **Step 1: Write the failing route tests** (mirror `define-word.test.ts`: `vi.mock("@/integrations/supabase/client.server", ...)` with `{ supabaseAdmin: { auth: { getUser }, from } }`, `chainable` from `@/lib/__testutils__/supabase-mock`, `Route.options.server!.handlers` cast to `{ GET, PUT, DELETE }`). Queue `from` results in the order the route reads. Required cases (write each as its own `it`):

  1. no Authorization header, and a token `getUser` rejects: 401 for GET, PUT, DELETE; no `from` call made.
  2. `GET ?course=en` with no stored goal: `{ goal: null, plan: null }` (reads: `learning_goals` maybeSingle only).
  3. `GET ?course=en` with a stored goal: reads goal, `language_progress` (`{ cefr_level: "A1" }`), `lesson_completions` (`[{ lesson_id, completed_at }]`) and returns `plan.lessonsRemaining` equal to the real lesson count in scope minus the completions, `plan.status`, and `goal.createdAt`.
  4. stored goal whose target is now below the learner's level (`cefr_level: "C1"`, goal `B1`): 200 with `plan: null`, goal still returned.
  5. `GET ?course=en&targetLevel=B1&targetDate=<valid future>` (preview): reads only `language_progress` and `lesson_completions`; asserts **no** `upsert` was called (`from` call count equals 2 and none returned an object with an `upsert` used); returns `plan.status === "just_started"`.
  6. preview with a past date or unknown level: 400.
  7. `PUT` valid: calls `from("learning_goals").upsert` once with `{ user_id, language, target_level, target_date, updated_at }` and `onConflict: "user_id,language"`; returns `{ goal, plan }`; the user id used is the token's, never from the body (send a `user_id` field in the body and assert it is ignored).
  8. `PUT` invalid body, bad JSON, target below current, date today, date > 3 years: 400, no upsert.
  9. `PUT` upsert database error: 500 `{ error }`.
  10. `DELETE ?course=en`: deletes with `.eq("user_id", ...)` and `.eq("language", "en")`; `{ ok: true }`; unknown course 400.
  11. a database error reading `language_progress` or `lesson_completions` or `learning_goals`: 500 (never `{ goal: null }`).
  12. unknown `course` query value on GET: 400.

- [ ] **Step 2: Run to verify it fails** (module missing).

- [ ] **Step 3: Implement `learning-goal.server.ts`**

```ts
// src/lib/learning-goal.server.ts
import { getCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEVEL_ORDER } from "@/lib/learning-goal";

type Admin = typeof supabaseAdmin;

export function lessonsByLevel(course: Course): Record<Level, string[]> {
  const out = Object.fromEntries(LEVEL_ORDER.map((l) => [l, [] as string[]])) as Record<Level, string[]>;
  for (const unit of getCourse(course).curriculum) {
    for (const lesson of unit.lessons) out[unit.level].push(lesson.id);
  }
  return out;
}

/**
 * The learner's current level and the first-completion time of every lesson they
 * have done in this course. Throws on a database error so the route can answer 500:
 * a failed read must never look like "no goal" or "no progress".
 * (lesson_completions holds at most one row per lesson, a few hundred per course,
 * well inside PostgREST's 1000-row default page.)
 */
export async function loadLearnerState(admin: Admin, userId: string, course: Course) {
  const level = await admin
    .from("language_progress")
    .select("cefr_level")
    .eq("user_id", userId)
    .eq("language", course)
    .maybeSingle();
  if (level.error) throw new Error(level.error.message);
  const known = level.data?.cefr_level as Level | undefined;
  const currentLevel: Level = known && LEVEL_ORDER.includes(known) ? known : "A1";

  const done = await admin
    .from("lesson_completions")
    .select("lesson_id,completed_at")
    .eq("user_id", userId)
    .eq("language", course);
  if (done.error) throw new Error(done.error.message);
  const completedAt: Record<string, string> = {};
  for (const row of done.data ?? []) completedAt[row.lesson_id] = row.completed_at;
  return { currentLevel, completedAt };
}
```

- [ ] **Step 4: Implement the route** `src/routes/api/learning-goal.ts` following `define-word.ts`: a small `authenticate(request)` returning `{ userId }` or a 401 `Response` (Bearer token, `supabaseAdmin.auth.getUser`); a `handle(request, method)` that parses `new URL(request.url).searchParams`, validates `course` with `isCourse` (400 otherwise), and:
  - `GET` with `targetLevel` and `targetDate` present: preview. Build the candidate with `validateGoalInput({ course, targetLevel, targetDate }, { now, currentLevel })` after `loadLearnerState`; on `ok:false` 400; else `planGoal({ ..., goalCreatedAt: null })`.
  - `GET` without them: read `learning_goals` (`.maybeSingle()`, error then 500); no row returns `{ goal: null, plan: null }`; else `loadLearnerState`, `planGoal({ goalCreatedAt: row.created_at, ... })` (may be `null`).
  - `PUT`: parse JSON (400 on failure), `loadLearnerState`, `validateGoalInput`, `upsert({ user_id: userId, language, target_level, target_date, updated_at: now.toISOString() }, { onConflict: "user_id,language" }).select("created_at").single()` (error then 500), then the plan.
  - `DELETE`: `.delete().eq("user_id", userId).eq("language", course)`.
  Wrap `loadLearnerState` in try/catch returning `Response.json({ error: "Could not load your goal." }, { status: 500 })` and `console.error`. Export `Route = createFileRoute("/api/learning-goal")({ server: { handlers: { GET, PUT, DELETE } } })`. Use `[0-9]` not backslash classes anywhere.

- [ ] **Step 5: Run** `bun run test src/routes/api/learning-goal.test.ts` then `bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Mutation-check:** use the body's `user_id`; skip the validation call on PUT; make the stored GET return `{goal:null}` on a read error; make the preview call `upsert`; drop the `.eq("language", ...)` on DELETE; drop the 401 check. Each must fail a test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/learning-goal.server.ts src/routes/api/learning-goal.ts src/routes/api/learning-goal.test.ts
git commit -m "feat(goal): /api/learning-goal (stored, preview, save, remove)"
```

---

### Task 4: Web client module, GoalCard, and the Learn page

**Files:**
- Create: `src/lib/learning-goal-client.ts`, `src/components/GoalCard.tsx`
- Test: `src/lib/learning-goal-client.test.ts`, `src/components/GoalCard.test.tsx`
- Modify: `src/routes/_authenticated/learn.tsx`

**Interfaces:**
- Consumes: `GoalPlan`, `GoalCourse`, `LEVEL_ORDER`, `AMBITIOUS_PER_WEEK` from `learning-goal.ts`; `authHeaders` from `@/lib/auth-headers`.
- Produces: `fetchGoal(course, fetchImpl?)`, `previewGoal(course, level, date, fetchImpl?)`, `saveGoal(course, level, date, fetchImpl?)`, `removeGoal(course, fetchImpl?)`, `GoalError` (kinds `notSignedIn | invalid | unavailable | offline`), `goalErrorMessage(kind)`, `readCachedPlan(course)` / cache writes in `localStorage` (every access in try/catch); component `GoalCard({ course }: { course: GoalCourse })`.

- [ ] **Step 1: Client tests first** (same style as `saved-word-client.test.ts`): bearer header sent; 401 maps to `notSignedIn`, 400 to `invalid`, 5xx to `unavailable`, thrown fetch to `offline`; a 200 body of the wrong shape (missing `plan` keys) is `unavailable`; `previewGoal` uses `GET` with the query string and sends no body; `saveGoal` sends `PUT` JSON; cache read/write survives `localStorage` throwing. Also decode every sample in `learning-goal.fixtures.json` through the same shape check the client uses (the contract test).

- [ ] **Step 2: Implement the client** with a `isPlan(value)` shape check (all `GoalPlan` fields typed), small and explicit; cache key `lingua.learning-goal.v1.<course>` storing `{ goal, plan }`.

- [ ] **Step 3: GoalCard tests first** (jsdom, mock the client module). Cases:
  1. no goal: shows "Set a learning goal" and no plan numbers.
  2. opening setup: level `<select>` (levels at or above the learner's... the card does not know the learner's level, so it offers `A1..C1` and relies on the server's 400) and a date input with 3, 6 and 12 month preset buttons; changing the date calls `previewGoal` and shows "N lessons a week" and the confirm button; a `previewGoal` failure shows the error text and disables Save.
  3. Save calls `saveGoal` once with the chosen level and date, then shows the goal card.
  4. each status renders its line: `on_track` "On track", `ahead` "Ahead of plan", `behind` shows the "move the date" action and, when `suggestedDate` is set, that date; `just_started` "Just started: check back next week"; `done` "Goal reached".
  5. realism: `ambitious` shows "ambitious" text; `unrealistic` shows the suggested later date if present.
  6. copy: the text "an estimate of lessons, not of fluency" is present on the goal card and setup.
  7. offline: when the fetch fails and a cached plan exists, the card shows it with "as of" and the edit controls disabled; with no cache it shows a retry message.
  8. remove goal calls `removeGoal` and returns to the empty state.
  9. a plan of `null` with a stored goal shows "Pick a new target" (level changed).
  10. accessibility: status text is plain text in a labelled region (`role="region"`, `aria-label="Learning goal"`), buttons have accessible names.

- [ ] **Step 4: Implement `GoalCard.tsx`** as an inline panel (no modal: simpler and keyboard-friendly): states `loading | empty | setup | goal | error`, data from the client module, preset buttons computing dates with UTC arithmetic. No backslashes in code.

- [ ] **Step 5: Render it** in `learn.tsx` directly under the `WeeklyChallengesCard` block: `<div className="mb-6"><GoalCard course={course} /></div>`. Update the existing learn test if it asserts the exact children; add one test that the card renders on the Learn page.

- [ ] **Step 6: Run** `bun run test src/lib/learning-goal-client.test.ts src/components/GoalCard.test.tsx src/routes/_authenticated/learn.test.tsx`, `bunx tsc --noEmit`, `bun run lint`. Expected: PASS, 0 lint errors.

- [ ] **Step 7: Mutation-check:** drop the bearer header; accept a wrong-shape 200; skip the offline cache; show Save before a preview succeeded; drop the "estimate" copy; each must fail a test.

- [ ] **Step 8: Commit**

```bash
git add src/lib/learning-goal-client.ts src/lib/learning-goal-client.test.ts src/components/GoalCard.tsx src/components/GoalCard.test.tsx src/routes/_authenticated/learn.tsx src/routes/_authenticated/learn.test.tsx
git commit -m "feat(goal): web goal card on the Learn page"
```

---

### Task 5: Privacy, documents, whole-branch review, PR

**Files:**
- Modify: `src/routes/privacy.tsx` (one line under Learning data: "a learning goal (the level and date you choose)"; bump the `updated=` date), README (feature bullet), ARCHITECTURE (new section "Learning goal planner"), AGENTS (file table row: pure maths lives once, clients must not redo it, fixtures are the contract, thresholds are constants), CHANGELOG (entry, with what is NOT verified), the spec (fix `A2..C1` to `A1..C1` and note the inline panel instead of a dialog), local `docs/BACKLOG.md` (item 8 status, add the iOS and Android follow-ups).

- [ ] **Step 1:** Make the document edits above. Run `bun run test src/routes/legal-pages.test.tsx` (privacy page) and prettier on touched code files.

- [ ] **Step 2: Full verification.** `bunx tsc --noEmit`, `bun run lint`, `bun run test` (whole suite). Record the counts. Run the account export/delete guard once more.

- [ ] **Step 3: Fresh whole-branch review.** Build the package with `review-package` and dispatch a fresh reviewer on the most capable model with the Review Focus section verbatim and the ledger's rulings. Fix Critical and Important findings in one pass, each with a failing test first; ledger the rest.

- [ ] **Step 4: Two-dot diff** against `origin/main` (`git fetch`, then `git diff --name-only origin/main`) shows only this plan's files. Push, open the PR with a "NOT verified" section (no browser look at the card, mobile width, screen reader; the `types.ts` entry is hand-written and will be overwritten by the bot after deploy), wait for green CI, apply valid CodeRabbit comments, merge when green. Live on merge; no iOS build.

- [ ] **Step 5: After merge,** confirm the deploy-supabase job applied the migration (query `learning_goals` through the Supabase MCP), and that the next `regenerate-supabase-types` commit leaves `types.ts` compiling.

## Self-review

Spec coverage: data (Task 2), route incl. preview (Task 3), plan maths and every definition (Task 1), web client states (Task 4), privacy and compliance (Tasks 2 and 5), cross-platform fixtures (Task 1, used again in Task 4), edge cases (past date and level-lowered in Tasks 1 and 3). Not in this plan by design: iOS and Android clients (rollout steps 2 and 3, each with its own plan). Type consistency: `GoalPlan`, `GoalInput`, `PlanInput`, `planGoal`, `validateGoalInput`, `loadLearnerState`, `lessonsByLevel` are defined once and named identically wherever consumed.
