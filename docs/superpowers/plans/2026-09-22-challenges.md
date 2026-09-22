# Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixed weekly solo goals (3 of a pool of 6, rotating deterministically by week) plus an "open to anyone" duel-matchmaking queue extending the existing friend-only `duels`.

**Architecture:** Both pieces are simple enough to stay plain SQL RPCs — no Edge Function needed (unlike the Season Ladder). Fully independent of `weekly_xp`, Teams, and the Season Ladder — this plan can be implemented in parallel with either or both of them, or entirely on its own.

**Deviation from the spec worth flagging**: the spec described challenge templates as "hardcoded TS/SQL constants, same pattern as `LEAGUES`/`LEAGUE_THRESHOLDS`." Locking down the actual decomposition here, that's the wrong precedent — `LEAGUES` is bare config (tier names + numeric thresholds), but challenge templates need real title/description content, and this codebase already has an established, closer pattern for exactly that: the `achievements` table (id, title, description, icon, threshold, seeded via migration `INSERT`). This plan uses a `challenge_templates` table instead, seeded the same way `achievements` was.

**Tech Stack:** PostgreSQL/PL/pgSQL (migration), TanStack Start + React (web), Swift/SwiftUI (iOS).

**Spec:** `docs/superpowers/specs/2026-09-22-deeper-gamification-design.md` ("3. Challenges" section)

## Global Constraints

- Monday-start ISO week boundary, same as the rest of this feature.
- Reward: flat +100 XP to `language_progress.xp` for the recipient's `profiles.active_language` (same sizing/mechanism as Teams' win bonus) — never to `activity_days`.
- Open duel matchmaking must use `SELECT ... FOR UPDATE SKIP LOCKED` to avoid two concurrent callers claiming the same waiting queue entry.
- CEFR level adjacency: same level, or one step away, using the order `A1, A2, B1, B2, C1`.
- Stale queue entries (>10 minutes old) are skipped as match candidates and opportunistically cleaned up — no cron.
- iOS has no local Xcode/macOS in this dev environment — iOS tasks verified via PR-triggered CI.
- Migrations need explicit human go-ahead before merging to `main`.

---

### Task 1: Migration — challenge templates, completions, and the weekly-challenges RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_weekly_challenges.sql`

**Interfaces:**
- Produces: `get_weekly_challenges()` returns `TABLE(template_id text, title text, description text, type text, threshold integer, progress integer, completed boolean)`.

- [ ] **Step 1: Write the migration**

```sql
-- Solo weekly challenges -- V4 candidate #7 (deeper gamification,
-- docs/superpowers/specs/2026-09-22-deeper-gamification-design.md).
-- challenge_templates is DB-seeded content (title/description),
-- matching the existing achievements table's pattern rather than the
-- spec's original "hardcoded TS constants" framing -- locked down
-- during implementation planning as the closer, more consistent fit.
CREATE TABLE public.challenge_templates (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('lesson_count', 'perfect_score_count', 'study_every_day')),
  threshold integer NOT NULL
);
GRANT SELECT ON public.challenge_templates TO authenticated;
GRANT ALL ON public.challenge_templates TO service_role;
ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenge_templates_select_all" ON public.challenge_templates FOR SELECT TO authenticated USING (true);

INSERT INTO public.challenge_templates (id, title, description, type, threshold) VALUES
  ('lessons_3', 'Getting started', 'Complete 3 lessons this week', 'lesson_count', 3),
  ('lessons_5', 'On a roll', 'Complete 5 lessons this week', 'lesson_count', 5),
  ('lessons_10', 'Deep focus', 'Complete 10 lessons this week', 'lesson_count', 10),
  ('perfect_2', 'Sharp shooter', 'Score perfectly on 2 lessons this week', 'perfect_score_count', 2),
  ('perfect_3', 'Precision', 'Score perfectly on 3 lessons this week', 'perfect_score_count', 3),
  ('every_day', 'Full attendance', 'Study every day this week', 'study_every_day', 7);

CREATE TABLE public.challenge_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  template_id text NOT NULL REFERENCES public.challenge_templates(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start, template_id)
);
GRANT ALL ON public.challenge_completions TO service_role;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
-- No client policy -- only get_weekly_challenges (SECURITY DEFINER)
-- writes here, same hardened-table pattern as team_weekly_rewards.

-- Selects 3 of the 6 templates deterministically by week, computes
-- each one's live progress + completed status, and grants the reward
-- (once, guarded by challenge_completions' primary key) the moment a
-- threshold is newly crossed -- all resolved as a side effect of this
-- one read call, same lazy-resolution shape as the rest of this
-- feature.
CREATE OR REPLACE FUNCTION public.get_weekly_challenges()
RETURNS TABLE(template_id text, title text, description text, type text, threshold integer, progress integer, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  active_lang text;
  tpl RECORD;
  computed_progress integer;
  is_complete boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.active_language INTO active_lang FROM public.profiles p WHERE p.id = me;

  FOR tpl IN
    SELECT ct.id, ct.title, ct.description, ct.type, ct.threshold
    FROM public.challenge_templates ct
    ORDER BY hashtext(ct.id || wk::text)
    LIMIT 3
  LOOP
    IF tpl.type = 'lesson_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk;
    ELSIF tpl.type = 'perfect_score_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk AND lc.correct = lc.total;
    ELSE -- study_every_day
      SELECT count(DISTINCT ad.day) INTO computed_progress FROM public.activity_days ad
        WHERE ad.user_id = me AND ad.day >= wk;
    END IF;

    is_complete := EXISTS (
      SELECT 1 FROM public.challenge_completions cc
      WHERE cc.user_id = me AND cc.week_start = wk AND cc.template_id = tpl.id
    );

    IF NOT is_complete AND computed_progress >= tpl.threshold THEN
      INSERT INTO public.challenge_completions (user_id, week_start, template_id)
      VALUES (me, wk, tpl.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.language_progress SET xp = xp + 100
        WHERE user_id = me AND language = active_lang;
        is_complete := true;
      END IF;
    END IF;

    RETURN QUERY SELECT tpl.id, tpl.title, tpl.description, tpl.type, tpl.threshold, computed_progress, is_complete;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenges() TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git checkout -b feat/gamification-challenges main
git add supabase/migrations/<timestamp>_weekly_challenges.sql
git commit -m "feat: weekly challenge templates + get_weekly_challenges RPC (V4 #7 pt 1)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration — open duel matchmaking queue

**Files:**
- Modify: same migration file as Task 1 (append) — or a new one if Task 1 already merged; check `ls supabase/migrations | sort | tail -1` at implementation time.

**Interfaces:**
- Produces: `join_open_duel_queue(_course text, _match_by_level boolean) RETURNS TABLE(matched boolean, duel_id uuid)`, `leave_duel_queue() RETURNS void`.

- [ ] **Step 1: Add the queue table and RPCs**

```sql
CREATE TABLE public.duel_queue (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL,
  cefr_level text NOT NULL,
  match_by_level boolean NOT NULL DEFAULT true,
  queued_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.duel_queue TO service_role;
ALTER TABLE public.duel_queue ENABLE ROW LEVEL SECURITY;
-- No client policy -- only join_open_duel_queue/leave_duel_queue
-- (SECURITY DEFINER) touch this table.

CREATE OR REPLACE FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean DEFAULT true)
RETURNS TABLE(matched boolean, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_level text;
  candidate_id uuid;
  candidate_user uuid;
  levels text[] := ARRAY['A1', 'A2', 'B1', 'B2', 'C1'];
  new_duel_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  SELECT lp.cefr_level INTO my_level FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  my_level := COALESCE(my_level, 'A1');

  -- Opportunistic cleanup of stale entries (>10 min), no cron needed.
  DELETE FROM public.duel_queue WHERE queued_at < now() - interval '10 minutes';

  -- FOR UPDATE SKIP LOCKED: the standard safe-concurrent-queue pattern
  -- -- if two callers run this at nearly the same instant, they can't
  -- both grab the same waiting row (self-critique finding from the
  -- design brainstorm).
  SELECT dq.user_id INTO candidate_user
  FROM public.duel_queue dq
  WHERE dq.course = _course
    AND dq.user_id != me
    AND (
      (_match_by_level AND dq.match_by_level AND
        abs(array_position(levels, dq.cefr_level) - array_position(levels, my_level)) <= 1)
      OR NOT _match_by_level
      OR NOT dq.match_by_level
    )
  ORDER BY dq.queued_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF candidate_user IS NOT NULL THEN
    DELETE FROM public.duel_queue WHERE user_id = candidate_user;
    DELETE FROM public.duel_queue WHERE user_id = me;
    INSERT INTO public.duels (challenger_id, opponent_id, course)
    VALUES (me, candidate_user, _course)
    RETURNING id INTO new_duel_id;
    RETURN QUERY SELECT true, new_duel_id;
    RETURN;
  END IF;

  INSERT INTO public.duel_queue (user_id, course, cefr_level, match_by_level)
  VALUES (me, _course, my_level, _match_by_level)
  ON CONFLICT (user_id) DO UPDATE SET course = _course, cefr_level = my_level, match_by_level = _match_by_level, queued_at = now();
  RETURN QUERY SELECT false, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_duel_queue()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.duel_queue WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.join_open_duel_queue(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_open_duel_queue(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_duel_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_duel_queue() TO authenticated;
```

**Note for the implementer**: `join_open_duel_queue` reuses `public.duels`' insert shape directly (same three columns `create_duel` inserts: `challenger_id, opponent_id, course`) — re-read `create_duel`'s definition (`supabase/migrations/20260920060000_v3_engagement_mechanics.sql`) before implementing this task to confirm the `duels` table hasn't gained new required columns since, which would need adding here too.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/<timestamp>_weekly_challenges.sql
git commit -m "feat: open duel matchmaking queue (V4 #7 pt 2)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Open PR, verify via CI (do not merge)

- [ ] **Step 1: Push and open a PR**

```bash
git push -u origin feat/gamification-challenges
gh pr create --title "V4 #7: Challenges (weekly goals + open duels)" --body "$(cat <<'EOF'
## Summary
Two independent pieces: (1) 3-of-6 rotating weekly solo challenges (lesson count / perfect scores / study-every-day), DB-seeded content matching the achievements table's pattern, +100 XP reward on completion. (2) Open ("anyone") duel matchmaking queue extending the existing friend-only duels, course+CEFR-level filtered by default with an opt-out, FOR UPDATE SKIP LOCKED to avoid concurrent double-matching. Fully independent of weekly_xp/Teams/Season Ladder. Per docs/superpowers/specs/2026-09-22-deeper-gamification-design.md section 3.

## Test plan
- [ ] CI (lint-and-typecheck, deno-tests, e2e)
- [ ] Migration not yet applied to the live project -- needs explicit go-ahead before merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Watch CI, report the PR URL, stop for review**

---

### Task 4: Web — `challenges.functions.ts`, weekly-challenges card, open-duel entry point

**Files:**
- Create: `src/lib/challenges.functions.ts`
- Create: `src/components/WeeklyChallengesCard.tsx`
- Create: `src/components/WeeklyChallengesCard.test.tsx`
- Modify: `src/routes/_authenticated/learn.tsx` — render `<WeeklyChallengesCard />` near the top, above or alongside the existing units list (read the file first to find a sensible insertion point without disrupting existing layout)
- Modify: the existing friend-duel creation UI (find it: `grep -rln "createDuel" src/routes --include="*.tsx"`) — add an "Open Duel" button next to the friend-duel flow

**Interfaces:**
- Consumes: `get_weekly_challenges`, `join_open_duel_queue`, `leave_duel_queue` (Tasks 1–2).

- [ ] **Step 1: Write `challenges.functions.ts`**

```typescript
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WeeklyChallenge = {
  templateId: string;
  title: string;
  description: string;
  progress: number;
  threshold: number;
  completed: boolean;
};

export const getWeeklyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeeklyChallenge[]> => {
    const { data: rows } = await context.supabase.rpc("get_weekly_challenges");
    return (rows ?? []).map((r) => ({
      templateId: r.template_id,
      title: r.title,
      description: r.description,
      progress: r.progress ?? 0,
      threshold: r.threshold,
      completed: r.completed ?? false,
    }));
  });

const courseSchema = z.enum(["en", "fr", "es"]).default("en");

export const joinOpenDuelQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ course: courseSchema, matchByLevel: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ matched: boolean; duelId: string | null }> => {
    const { data: rows } = await context.supabase.rpc("join_open_duel_queue", {
      _course: data.course,
      _match_by_level: data.matchByLevel,
    });
    const row = rows?.[0];
    return { matched: row?.matched ?? false, duelId: row?.duel_id ?? null };
  });

export const leaveOpenDuelQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    await context.supabase.rpc("leave_duel_queue");
    return { ok: true };
  });
```

- [ ] **Step 2: Write `WeeklyChallengesCard.tsx`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "../lib/challenges.functions";

export function WeeklyChallengesCard() {
  const { data: challenges, isLoading } = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
  });

  if (isLoading || !challenges || challenges.length === 0) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-parchment p-4">
      <p className="font-display text-sm font-semibold text-ink">This week's challenges</p>
      <div className="mt-3 space-y-2.5">
        {challenges.map((c) => (
          <div key={c.templateId}>
            <div className="flex items-center justify-between text-xs">
              <span className={c.completed ? "text-moss line-through" : "text-ink"}>{c.title}</span>
              <span className="tnum text-ink-soft">{Math.min(c.progress, c.threshold)}/{c.threshold}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full rounded-full bg-moss"
                style={{ width: `${Math.min(100, (c.progress / c.threshold) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `WeeklyChallengesCard.test.tsx`**

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WeeklyChallengesCard } from "./WeeklyChallengesCard";

const getWeeklyChallenges = vi.fn();
vi.mock("../lib/challenges.functions", () => ({ getWeeklyChallenges }));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeeklyChallengesCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => { getWeeklyChallenges.mockReset(); });

describe("WeeklyChallengesCard", () => {
  it("renders each challenge's title and progress", async () => {
    getWeeklyChallenges.mockResolvedValue([
      { templateId: "lessons_5", title: "On a roll", description: "", progress: 3, threshold: 5, completed: false },
    ]);
    renderCard();
    expect(await screen.findByText("On a roll")).toBeInTheDocument();
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("shows a completed challenge with a strikethrough style", async () => {
    getWeeklyChallenges.mockResolvedValue([
      { templateId: "lessons_5", title: "On a roll", description: "", progress: 5, threshold: 5, completed: true },
    ]);
    renderCard();
    const title = await screen.findByText("On a roll");
    expect(title.className).toContain("line-through");
  });

  it("renders nothing while loading or when there are no challenges", () => {
    getWeeklyChallenges.mockReturnValue(new Promise(() => {}));
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 4: Run the new tests, typecheck**

Run: `bunx tsc --noEmit && bun run test -- WeeklyChallengesCard.test.tsx`.

- [ ] **Step 5: Wire the card into `learn.tsx`**

Read `src/routes/_authenticated/learn.tsx` first to find a sensible insertion point (near the top of the authenticated content, not disrupting the existing placement-banner/units-list layout), then add:

```tsx
import { WeeklyChallengesCard } from "../../components/WeeklyChallengesCard";
// ...
<WeeklyChallengesCard />
```

- [ ] **Step 6: Add the open-duel entry point**

Find the existing friend-duel creation UI: `grep -rln "createDuel" src/routes --include="*.tsx"`. Read that file, then add a button near the existing "challenge a friend" flow:

```tsx
async function handleJoinOpenQueue() {
  const result = await joinOpenDuelQueue({ data: { course, matchByLevel: true } });
  if (result.matched && result.duelId) {
    // navigate to the existing duel view/route the same way accepting
    // a friend duel already does -- reuse that exact navigation call,
    // do not invent a new one.
  } else {
    // show a "waiting for an opponent" state
  }
}
```

Match this file's existing duel-creation button styling and loading-state conventions exactly rather than introducing a new visual pattern.

- [ ] **Step 7: Full verification**

Run: `bunx tsc --noEmit && bun run test && bun run lint`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/challenges.functions.ts src/components/WeeklyChallengesCard.tsx \
  src/components/WeeklyChallengesCard.test.tsx src/routes/_authenticated/learn.tsx \
  <the friend-duel UI file>
git commit -m "feat: web weekly challenges card + open duel entry point (V4 #7 pt 3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 5: iOS — Kit client + UI additions

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift` (4-line access-level change only — see Step 1; skip if the Teams or Season Ladder plan already applied it)
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Challenges.swift`
- Create: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+ChallengesTests.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonBrowserView.swift` (the Learn tab) — render a weekly-challenges section, matching `learn.tsx`'s placement
- Modify: the iOS friend-duel UI (find it: `grep -rln "createDuel\|Duel" ios/LearnWithAlphonso/Sources --include="*.swift"`) — add an "Open Duel" entry point

**Why separate files, not `ProgressSyncClient.swift` directly**: this plan is fully independent and can run in parallel with both the Teams and Season Ladder plans — same collision-avoidance reasoning as their Task 6 sections.

**Interfaces:**
- Produces: `WeeklyChallenge` struct, `ProgressSyncClient.getWeeklyChallenges() async throws -> [WeeklyChallenge]`, `.joinOpenDuelQueue(course:matchByLevel:) async throws -> (matched: Bool, duelID: String?)`, `.leaveOpenDuelQueue() async throws -> Void`.

- [ ] **Step 1: Widen `ProgressSyncClient`'s stored properties from `private` to `internal` (skip if already done)**

Run `grep -n "private let supabaseURL" ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift` first — if it reports nothing, already applied by another plan; skip to Step 2. Otherwise apply the exact change described in the Teams plan's Task 6 Step 1 — **including `requireSuccess`**, not just the four stored properties (confirmed live via a real CI failure: `requireSuccess` being left `private` compile-fails every RPC method this plan adds).

- [ ] **Step 2: Create `ProgressSyncClient+Challenges.swift` with the type and client methods**

```swift
import Foundation

public struct WeeklyChallenge: Sendable, Equatable, Identifiable {
    public var id: String { templateID }
    public let templateID: String
    public let title: String
    public let description: String
    public let progress: Int
    public let threshold: Int
    public let completed: Bool
}

extension ProgressSyncClient {

public func getWeeklyChallenges() async throws -> [WeeklyChallenge] {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_weekly_challenges"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        throw ProgressSyncError.invalidPayload
    }
    return rows.compactMap { row -> WeeklyChallenge? in
        guard let templateID = row["template_id"] as? String,
              let title = row["title"] as? String,
              let description = row["description"] as? String,
              let progress = row["progress"] as? Int,
              let threshold = row["threshold"] as? Int,
              let completed = row["completed"] as? Bool else { return nil }
        return WeeklyChallenge(templateID: templateID, title: title, description: description, progress: progress, threshold: threshold, completed: completed)
    }
}

public func joinOpenDuelQueue(course: String, matchByLevel: Bool) async throws -> (matched: Bool, duelID: String?) {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/join_open_duel_queue"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["_course": course, "_match_by_level": matchByLevel])

    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
          let row = rows.first,
          let matched = row["matched"] as? Bool else {
        throw ProgressSyncError.invalidPayload
    }
    return (matched, row["duel_id"] as? String)
}

public func leaveOpenDuelQueue() async throws {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/leave_duel_queue"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
}

} // extension ProgressSyncClient
```

- [ ] **Step 3: Create `ProgressSyncClient+ChallengesTests.swift`**

Same self-contained-file approach as the Teams plan's Task 6 Step 3 (fresh `XCTestCase` subclass, duplicated `makeClient`/`jsonResponse` helpers copied from the real current `ProgressSyncClientTests.swift`, not shared).

```swift
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientChallengesTests: XCTestCase {
    private func makeClient(handler: @escaping @Sendable (URLRequest) -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "test-anon-key",
            accessToken: "test-access-token",
            requester: { handler($0) }
        )
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }

    // MARK: - Challenges

    func testGetWeeklyChallengesDecodesRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [
                ["template_id": "lessons_5", "title": "On a roll", "description": "Complete 5 lessons this week", "progress": 3, "threshold": 5, "completed": false],
            ])
        }
        let challenges = try await client.getWeeklyChallenges()
        XCTAssertEqual(challenges, [WeeklyChallenge(templateID: "lessons_5", title: "On a roll", description: "Complete 5 lessons this week", progress: 3, threshold: 5, completed: false)])
    }

    func testJoinOpenDuelQueueReturnsWaitingWhenNoMatch() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["matched": false, "duel_id": NSNull()]])
        }
        let result = try await client.joinOpenDuelQueue(course: "en", matchByLevel: true)
        XCTAssertFalse(result.matched)
        XCTAssertNil(result.duelID)
    }

    func testJoinOpenDuelQueueReturnsMatchedDuelID() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["matched": true, "duel_id": "d1"]])
        }
        let result = try await client.joinOpenDuelQueue(course: "en", matchByLevel: false)
        XCTAssertTrue(result.matched)
        XCTAssertEqual(result.duelID, "d1")
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift \
  ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Challenges.swift \
  ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+ChallengesTests.swift
git commit -m "feat: iOS Kit client for weekly challenges + open duel queue (V4 #7 pt 4)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Add UI to `LessonBrowserView.swift` and the friend-duel view**

Read both files first (`LessonBrowserView.swift` for where to add a challenges section matching `learn.tsx`'s placement; the duel view found via `grep -rln "createDuel\|Duel" ios/LearnWithAlphonso/Sources --include="*.swift"` for where to add an "Open Duel" button next to the existing friend-duel flow). Follow each file's existing SwiftUI structure and styling conventions exactly — this step intentionally has no prescriptive code block because the exact insertion point depends on reading the current file state, which may have changed since this plan was written; the implementer must read before writing, same discipline as every other UI-wiring step in this feature's other two plans.

- [ ] **Step 6: Open a PR and let CI verify (`ios-app-build`/`ios-swift-tests`) — do not merge**

```bash
git add ios/LearnWithAlphonso/Sources/LessonBrowserView.swift <the duel view file>
git commit -m "feat: iOS weekly challenges + open duel UI (V4 #7 pt 5)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
gh pr checks <this-branch's-PR-number> --watch
```

Report the CI result. If green, this plan's deliverable (Challenges, fully built and CI-verified on both platforms) is done — merging to `main` needs explicit human go-ahead.
