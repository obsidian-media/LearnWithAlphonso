# Team Player Badge (database, catalog, bundles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members who help their team finish a weekly mission also unlock a "Team player" badge, shown by web, iOS and Android.

**Architecture:** One new `achievements` row (`team_player`, category `team`, threshold 1) and one extra statement inside `_resolve_team_mission` that grants it, in the same atomic payout, to exactly the members who are paid. The catalog is mirrored client-side (`src/data/achievements.ts`) and exported to three bundled JSON copies (iOS app, iOS Kit, Android assets) by two scripts that CI checks for staleness. The `team` category never unlocks through lesson completion because `stats.team` does not exist (`stats[a.category] ?? 0`), so only the server grants it.

**Tech Stack:** Postgres migration, TypeScript catalog, `bun scripts/export-ios-content.ts` and `bun scripts/export-android-content.ts`, vitest.

Part of `docs/superpowers/specs/2026-10-06-study-together-design.md` (Part 1, Phase 2). iOS and Android UI follow in their own PRs.

**Worktree:** `D:\AgentDevWork\repos\LearnWithAlphonso-badge`, branch `feat/team-player-badge`.

---

### Task 1: Migration test (RED)

**Files:** Create `src/lib/team-player-badge-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006160000_team_player_badge.sql";

describe("team player badge migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const code = () => sql().replace(/--[^\n]*/g, "");

  it("runs after the team missions migration it replaces a function of", () => {
    expect(FILE.slice(0, 14) > "20261006150000").toBe(true);
  });

  it("adds exactly one achievement: team_player, category team, threshold 1", () => {
    const inserts = code().match(/INSERT INTO public\.achievements[\s\S]*?;/gi) ?? [];
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatch(/'team_player'/);
    expect(inserts[0]).toMatch(/'team'/);
    expect(inserts[0]).toMatch(/,\s*1\s*,/);
    expect(inserts[0]).toMatch(/ON CONFLICT[^;]*DO NOTHING/i);
  });

  it("grants the badge only to the members who were just paid, in the same payout, once", () => {
    const resolver = code().match(/FUNCTION public\._resolve_team_mission[\s\S]*?\$\$;/i)?.[0] ?? "";
    const grant = resolver.match(/INSERT INTO public\.user_achievements[\s\S]*?;/i)?.[0] ?? "";
    expect(grant).toMatch(/FROM public\.team_mission_rewards r/i);
    expect(grant).toMatch(/r\.team_id = _team AND r\.week_start = _wk/i);
    expect(grant).toMatch(/'team_player'/);
    expect(grant).toMatch(/ON CONFLICT[^;]*DO NOTHING/i);
    // after the atomic rewarded_at guard, never before it
    expect(resolver.indexOf("INSERT INTO public.user_achievements")).toBeGreaterThan(
      resolver.indexOf("IF NOT FOUND THEN"),
    );
  });

  it("keeps everything the previous version of the resolver guaranteed", () => {
    const resolver = code().match(/FUNCTION public\._resolve_team_mission[\s\S]*?\$\$;/i)?.[0] ?? "";
    expect(resolver).toMatch(/SECURITY DEFINER/i);
    expect(resolver).toMatch(/SET search_path = public/i);
    expect(resolver).toMatch(/SET timezone = 'UTC'/i);
    expect(resolver).toMatch(/rewarded_at IS NULL/i);
    expect(resolver).toMatch(/\) < 2 THEN/);
    expect(resolver).toMatch(/lp\.language = \(\s*SELECT lc\.language/i);
    expect(resolver).not.toMatch(/active_language/i);
  });

  it("re-asserts the privileges CREATE OR REPLACE leaves alone, so nothing can widen", () => {
    expect(code()).toMatch(
      /REVOKE ALL ON FUNCTION public\._resolve_team_mission\(uuid, date\) FROM PUBLIC, anon, authenticated/i,
    );
    expect(code()).not.toMatch(/\bGRANT\b/i);
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
```

- [ ] **Step 2: Run, expect RED (ENOENT):** `bunx prettier --write src/lib/team-player-badge-migration.test.ts && bun run test src/lib/team-player-badge-migration.test.ts`
- [ ] **Step 3: Commit** `git add -A && git commit -m "test(badge): pin the team player migration (red)"`

### Task 2: Migration (GREEN)

**Files:** Create `supabase/migrations/20261006160000_team_player_badge.sql`

- [ ] **Step 1:** Write the migration: the achievement row, then `CREATE OR REPLACE FUNCTION public._resolve_team_mission` copied from `20261006150000_team_missions.sql` with one extra statement after the XP `UPDATE` (before `END;`):

```sql
  INSERT INTO public.user_achievements (user_id, achievement_id, progress)
  SELECT r.user_id, 'team_player', 1
  FROM public.team_mission_rewards r
  WHERE r.team_id = _team AND r.week_start = _wk
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
```

and the achievement insert:

```sql
INSERT INTO public.achievements (id, title, description, icon, tier, category, threshold, sort_order)
VALUES ('team_player', 'Team player', 'Help your team finish a weekly mission', 'star', 'silver', 'team', 1, 50)
ON CONFLICT (id) DO NOTHING;
```

Header comment: purpose, "the badge is granted only by the server because the `team` category has no client stat", ROLLBACK (`DELETE FROM public.user_achievements WHERE achievement_id='team_player'; DELETE FROM public.achievements WHERE id='team_player';` and re-apply the previous resolver body from 20261006150000), and end with `REVOKE ALL ON FUNCTION public._resolve_team_mission(uuid, date) FROM PUBLIC, anon, authenticated;`.

- [ ] **Step 2:** `bun run test src/lib/team-player-badge-migration.test.ts src/lib/team-mission-migration.test.ts` -> PASS. The older migration test still passes because it reads the old file, not the replaced function.
- [ ] **Step 3: Mutation-check** one at a time: remove the `ON CONFLICT` from the grant; move the grant before `IF NOT FOUND THEN`; grant from `team_members` instead of `team_mission_rewards`; drop `SET timezone`; add a `GRANT` line; change the threshold to 2. Each must turn a test red.
- [ ] **Step 4: Commit.**

### Task 3: Prove the SQL live (rolled-back transaction)

- [ ] **Step 1:** In ONE `execute_sql` transaction ending in `ROLLBACK`: define the achievement and the replaced resolver (plus the tables and helpers from the earlier migration, which are already deployed, so only the achievement row and the replaced function are needed), seed a two-member team with 8 lessons, read as one member, then `SELECT user_id, achievement_id FROM user_achievements WHERE achievement_id='team_player'` and a non-contributing third member. Expected: badge rows for exactly the paid members, none for a member who contributed nothing; a second read adds none. Then confirm nothing remains (`achievements` has no `team_player`).

### Task 4: Catalog and bundles (RED then GREEN)

**Files:** Modify `src/data/achievements.ts`, `src/data/achievements.test.ts`; regenerate `ios/LearnWithAlphonso/Resources/achievements.json`, `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/achievements.json`, `android/LearnWithAlphonso/app/src/main/assets/content/achievements.json`.

- [ ] **Step 1: Failing test** in `src/data/achievements.test.ts`: add `"team"` to the allowed categories list and add:

```ts
it("includes the server-granted team_player badge, which no client stat can unlock", () => {
  const badge = ACHIEVEMENTS_BY_ID["team_player"];
  expect(badge).toMatchObject({ category: "team", threshold: 1, title: "Team player", icon: "star" });
});
```

Run -> FAIL.

- [ ] **Step 2: Implement:** add `"team"` to `AchievementCategory`, and append to `ACHIEVEMENTS`:

```ts
  {
    id: "team_player",
    title: "Team player",
    description: "Help your team finish a weekly mission",
    icon: "star",
    tier: "silver",
    category: "team",
    threshold: 1,
  },
```

- [ ] **Step 3:** Run `bun scripts/export-ios-content.ts && bun scripts/export-android-content.ts` (Git Bash; `bun` is a shim). Check `git diff --stat` touches only the three achievements JSONs (and no other bundle).
- [ ] **Step 4:** `bun run test src/data src/lib/ios-content-export.test.ts src/lib/sync.functions.test.ts` -> PASS; add to `sync.functions.test.ts` a case proving a completion never unlocks `team_player` (stats has no `team`). Mutation: make `stats.team` default to a large number -> that test must fail.
- [ ] **Step 5: Commit.**

### Task 5: Native catalog loaders still accept the new category

- [ ] **Step 1:** Read how iOS (`AchievementsView.swift`, Kit `ContentStore`) and Android decode `category`; if either uses a closed enum, add `team` (test-first in `ContentStoreTests.swift` / the Android core content test, asserting `team_player` decodes). If they take a string, only extend the count expectations in those tests (`ContentStoreTests.swift:9` mentions a count pinned to the TS catalog).
- [ ] **Step 2:** Run `swift test --filter ContentStoreTests` and the Android core content tests (`gradle.ps1`, see memory: android toolchain).
- [ ] **Step 3: Commit.**

### Task 6: Docs, gate, review, PR, merge, verify

- [ ] README/ARCHITECTURE (achievements row), CHANGELOG, spec (badge shipped), AGENTS (server-granted category note), BACKLOG.
- [ ] Gate: prettier, lint, tsc, full test; `swift test` for the Kit; fresh `fable` reviewer; PR; CI (the `ios-app-build` and bundle-staleness checks matter here); merge when green; verify live (`SELECT` the `team_player` row, function privileges unchanged: helpers not callable by clients).

---

## Self-review against the spec

Part 1's "shared badge" is covered by Tasks 1-4; "recorded once, to exactly the paid members" by the grant reading from `team_mission_rewards` after the atomic guard; "no client can fake it" by the `team` category having no client stat plus the existing admin-only write to `user_achievements`. The iOS and Android screens that render the badge need no UI change beyond the catalog (they list every catalog entry); the team mission card itself is the next two PRs.
