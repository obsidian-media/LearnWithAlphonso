# Display Identity Editing + Team Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution method:** Native (this session implements every task itself), chosen without a
> stop-and-ask because the kickoff instructions explicitly say "you have the whole goal — don't
> come back for scoping" and Auto Mode biases toward proceeding. A single fresh-model review of
> the whole branch happens at the end via `/code-review`.

**Goal:** Let a user (1) change their own display name and avatar color, with that change
propagating everywhere it's shown, and (2) create a team from scratch, on both iOS and web.

**Architecture:** Both features are additive UI + a thin server surface over an already-correct
data model. Feature 1 needs almost no backend work — `profiles_update_own` RLS has allowed a user
to PATCH their own `display_name`/`avatar_seed` since the table was created; the only real gaps
are the editing UI on iOS (web already has a display-name field) and a DB-level length/non-empty
guard now that direct client PATCHes are the norm, not just the signup trigger. Feature 2 mirrors
`join_open_duel_queue`'s RPC style: a new `create_team` SECURITY DEFINER function that validates
input, inserts a row, and routes through the existing `_join_team_impl` so the 7-day switch lock
can't be bypassed by "just create a new team." It also closes a gap `create_team` itself opens:
until now no code path could ever create a `visibility = 'private'` team, so `teams`'s blanket
`SELECT ... USING (true)` never mattered for `join_code` secrecy — it will the moment private
teams exist, so this plan narrows the table's column grant to stop exposing `join_code` to
non-members.

**Tech Stack:** Supabase Postgres (SQL migrations, RLS, SECURITY DEFINER RPCs), TanStack Start
server functions + React (web), Swift/SwiftUI + the `LearnWithAlphonsoKit` package (iOS).

**Spec:** The task brief in this conversation (no separate spec file — two BACKLOG items,
§0.0p and §0.0o item 2, whose text was pasted directly into the kickoff prompt; `docs/BACKLOG.md`
is gitignored/local-only, so it does not travel with this plan).

## Global Constraints

- Do not edit ARCHITECTURE.md / AGENTS.md / README.md / CHANGELOG.md — the orchestrator does one
  pass over docs later.
- No em dashes in AWS/DB resource identifiers (n/a here, no AWS resources touched).
- Migrations version strictly after the latest applied: `20260928040000`.
- `ios/LearnWithAlphonso/Sources/**` is unverified until the `ios-app-build` CI job is green —
  never claim "verified" for iOS work before that, only "implemented, pending CI."
- Existing users keep their current `display_name` until they explicitly change it — no mass
  reset, no backfill migration.
- Reuse `SocialSafetyMenu` (web) / `SocialSafetyControls` (iOS) for any *new* surface that shows a
  stranger's name; do not build a second report/block UI. (Verified: no new such surface is added
  by this plan — both edits are to the user's own profile/team-creation screens.)
- `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `bun run build` all clean before this is
  considered done on the web side.

## Review Focus

- **Empty/whitespace-only display name via direct PostgREST PATCH** (bypasses the web's Zod
  validator entirely from iOS or a raw API call) — must be rejected server-side, not just by the
  web form's `min(1)`. Covered by Task 1's CHECK constraint.
- **Oversized display name from a very long Google `full_name`** already in the table before this
  change — the new CHECK must not retroactively break existing rows or block unrelated updates to
  them. Covered by Task 1 using `NOT VALID`.
- **A private team's `join_code` read by a non-member via a raw `GET /rest/v1/teams`** — the only
  reason this was previously impossible is that no code path could create a private team; `create_team`
  removes that reason. Covered by Task 2's column-grant narrowing.
- **`create_team` used to dodge the 7-day team-switch lock** by creating a brand-new team instead
  of joining one — must fail the same way `join_team` would. Covered by Task 2 routing through
  `_join_team_impl` and its test.
- **Avatar "shuffle" firing on every keystroke / re-render** instead of only on an explicit user
  action — must be a single explicit control, mirroring the theme picker's "apply instantly, one
  tap" pattern, not something that runs as a side effect of typing the name. Covered by Tasks 3-4.

---

### Task 1: DB — `profiles` guard + `teams` join_code exposure fix + `create_team` RPC

**Files:**
- Create: `supabase/migrations/20260929000000_profile_identity_guard.sql`
- Create: `supabase/migrations/20260929010000_create_team.sql`

**Interfaces:**
- Produces: RPC `public.create_team(_name text, _visibility text DEFAULT 'public', _member_cap
  integer DEFAULT 30) RETURNS TABLE(ok boolean, reason text, team_id uuid, join_code text)`,
  granted to `authenticated` only (mirrors `join_team`'s grant shape).
- Consumes: `public._join_team_impl(_team_id uuid, _me uuid)` from
  `20260922040000_teams.sql` (unchanged).

- [ ] **Step 1: Write `20260929000000_profile_identity_guard.sql`**

```sql
-- Display-name/avatar editing surface (BACKLOG §0.0p): profiles_update_own
-- RLS has always let a user PATCH their own display_name/avatar_seed
-- (20260725012934_...sql), but until now the only writer was the signup
-- trigger, which always produces a short, non-empty value. Once the web
-- and iOS editing UI (this same PR) start writing these columns from
-- arbitrary user input, and iOS's PATCH goes straight to PostgREST with
-- no Zod layer in front of it the way web's updateProfile has, the DB
-- needs its own floor. NOT VALID: an existing row from a long Google
-- full_name must not be retroactively broken by this -- it only gates
-- new writes, matching "existing users keep their current name until
-- they change it."
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length_chk
  CHECK (char_length(trim(display_name)) BETWEEN 1 AND 40) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_seed_length_chk
  CHECK (char_length(avatar_seed) BETWEEN 1 AND 32) NOT VALID;
```

- [ ] **Step 2: Write `20260929010000_create_team.sql`**

```sql
-- Let people create a team (BACKLOG §0.0o item 2). League/Season/Teams
-- all offer to join or auto-match into a team; nothing originates one.
-- Mirrors join_open_duel_queue's shape: SECURITY DEFINER, validates its
-- own input (this is the first RPC that inserts a *user-supplied* team
-- name -- auto_join_team only ever inserts _random_team_name()'s output),
-- and routes the actual membership write through _join_team_impl so
-- creating a team can't be used to dodge the 7-day switch lock that
-- join_team/join_public_team/auto_join_team already enforce.
--
-- Founder-deletion decision (explicitly asked for by the task): the team
-- survives its founder. teams.created_by is already ON DELETE SET NULL
-- (20260922040000_teams.sql), not CASCADE -- only team_members cascades,
-- so a deleted founder simply leaves the team like anyone else via
-- leave_team would. There is no ownership/admin concept on team_members
-- to transfer, and every other member already has an equal ability to
-- leave without dissolving the team, so a solo founder disappearing is
-- not a special case -- it's the same "member leaves" the schema already
-- handles. Not changed by this migration; documented here because this
-- is the migration that makes it possible to reach that state for the
-- first time (a team that could actually be created, not just
-- auto-generated).
CREATE OR REPLACE FUNCTION public.create_team(
  _name text,
  _visibility text DEFAULT 'public',
  _member_cap integer DEFAULT 30
)
RETURNS TABLE(ok boolean, reason text, team_id uuid, join_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  trimmed_name text := trim(_name);
  new_id uuid;
  new_code text;
  join_result record;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF char_length(trimmed_name) < 1 OR char_length(trimmed_name) > 40 THEN
    RETURN QUERY SELECT false, 'invalid-name', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _visibility NOT IN ('public', 'private') THEN
    RETURN QUERY SELECT false, 'invalid-visibility', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _member_cap < 2 OR _member_cap > 200 THEN
    RETURN QUERY SELECT false, 'invalid-member-cap', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  new_code := encode(gen_random_bytes(6), 'base64');
  INSERT INTO public.teams (name, join_code, visibility, member_cap, created_by)
  VALUES (trimmed_name, new_code, _visibility, _member_cap, me)
  RETURNING id INTO new_id;

  SELECT * INTO join_result FROM public._join_team_impl(new_id, me);
  IF NOT join_result.ok THEN
    -- Only ever reachable via the switch-lock branch -- a brand-new team
    -- has zero members, so current_count(0) < member_cap always holds.
    DELETE FROM public.teams WHERE id = new_id;
    RETURN QUERY SELECT false, join_result.reason, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, new_id, new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text, text, integer) TO authenticated;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_name_length_chk
  CHECK (char_length(name) BETWEEN 1 AND 40) NOT VALID;

-- ---------- join_code exposure fix ----------
-- teams_select_all (USING (true)) has been harmless until now because
-- every existing team is 'public' -- no code path could ever create a
-- 'private' one, so there was no join_code worth hiding. create_team
-- above is the first path that can. A private team's whole point is
-- "only people I hand the code to can join," so any authenticated user
-- being able to `GET /rest/v1/teams?select=join_code` and read it
-- defeats that immediately. RLS is row-level, not column-level, and every
-- other column (name, visibility, member_cap, created_by) is fine to
-- keep world-readable (same exposure public teams already had), so this
-- narrows column privileges instead of rewriting the row policy: revoke
-- the whole-table SELECT grant and re-grant every column except
-- join_code. SECURITY DEFINER functions (get_my_team, join_team, this
-- file's create_team) are unaffected -- they run as the function owner,
-- not as `authenticated`, so they still return join_code to the one
-- caller who's supposed to see it (a member, via get_my_team; the
-- creator, via this function's own return value).
REVOKE SELECT ON public.teams FROM authenticated;
GRANT SELECT (id, name, visibility, member_cap, created_by, created_at) ON public.teams TO authenticated;
```

- [ ] **Step 3: Apply locally / sanity-check with the Supabase CLI if available**

Run: `supabase db lint` (or `supabase migration list` if no local DB is running) to confirm the
migration files parse. If no local Supabase stack is reachable in this environment, skip running
them and rely on the `ios-app-build`/web CI to apply migrations, per project convention that DB
changes here are reviewed by SQL reading, not local execution.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260929000000_profile_identity_guard.sql supabase/migrations/20260929010000_create_team.sql
git commit -m "feat(db): allow team creation, guard profile identity fields, close teams join_code leak"
```

---

### Task 2: Web — `createTeam` server function + types.ts entry + creation UI

**Files:**
- Modify: `src/lib/teams.functions.ts`
- Modify: `src/integrations/supabase/types.ts` (hand-add the `create_team` Functions entry,
  alphabetically after `create_duel` at line ~1481 — codegen will supersede this once the
  migration is live in production, matching how this repo already treats the types guard for
  any PR that adds a new table/RPC, per project instructions §0.0h)
- Modify: `src/routes/_authenticated/teams.tsx`
- Modify: `src/lib/teams.functions.test.ts`
- Modify: `src/routes/_authenticated/teams.test.tsx`

**Interfaces:**
- Produces: `createTeam(input: { name: string; visibility?: "public" | "private" }) => Promise<{
  ok: boolean; reason: string | null; teamId: string | null; joinCode: string | null }>` from
  `teams.functions.ts`.

- [ ] **Step 1: Add the `create_team` Functions entry to `types.ts`**

```ts
      create_team: {
        Args: { _member_cap?: number; _name: string; _visibility?: string };
        Returns: {
          join_code: string;
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
```

(inserted immediately after the existing `create_duel` entry, keeping the file's alphabetical
order)

- [ ] **Step 2: Write the failing tests in `teams.functions.test.ts`**

```ts
describe("createTeam", () => {
  it("passes the name and visibility to create_team and unwraps the row", async () => {
    const supabase = rpcReturning([
      { ok: true, reason: null, team_id: "t9", join_code: "XYZ999" },
    ]);
    const result = await createTeam({
      context: ctx(supabase),
      data: { name: "Night Owls", visibility: "private" },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("create_team", {
      _name: "Night Owls",
      _visibility: "private",
    });
    expect(result).toEqual({ ok: true, reason: null, teamId: "t9", joinCode: "XYZ999" });
  });

  it("defaults visibility to public", async () => {
    const supabase = rpcReturning([{ ok: true, reason: null, team_id: "t9", join_code: "AAA111" }]);
    await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(supabase.rpc).toHaveBeenCalledWith("create_team", {
      _name: "Night Owls",
      _visibility: "public",
    });
  });

  it("trims the name and rejects an empty one before hitting the network", async () => {
    const supabase = rpcReturning([]);
    await expect(
      createTeam({ context: ctx(supabase), data: { name: "   " } }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns no rows", async () => {
    const supabase = rpcReturning([]);
    const result = await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(result).toEqual({ ok: false, reason: "unknown-error", teamId: null, joinCode: null });
  });

  it("surfaces the server's own refusal reason unchanged", async () => {
    const supabase = rpcReturning([
      { ok: false, reason: "switch-locked", team_id: null, join_code: null },
    ]);
    const result = await createTeam({ context: ctx(supabase), data: { name: "Night Owls" } });
    expect(result).toEqual({ ok: false, reason: "switch-locked", teamId: null, joinCode: null });
  });
});
```

Add `createTeam` to the destructured import at the top of the test file alongside the other five.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test src/lib/teams.functions.test.ts`
Expected: FAIL — `createTeam` is not exported from `./teams.functions`.

- [ ] **Step 4: Implement `createTeam` in `teams.functions.ts`**

```ts
export type CreateTeamResult = {
  ok: boolean;
  reason: string | null;
  teamId: string | null;
  joinCode: string | null;
};

function toCreateResult(
  row: { ok: boolean; reason: string | null; team_id: string | null; join_code: string | null } | undefined,
): CreateTeamResult {
  if (!row) return { ok: false, reason: "unknown-error", teamId: null, joinCode: null };
  return { ok: row.ok, reason: row.reason, teamId: row.team_id, joinCode: row.join_code };
}

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(40),
        visibility: z.enum(["public", "private"]).default("public"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CreateTeamResult> => {
    const { data: rows } = await context.supabase.rpc("create_team", {
      _name: data.name,
      _visibility: data.visibility,
    });
    return toCreateResult(rows?.[0]);
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/lib/teams.functions.test.ts`
Expected: PASS

- [ ] **Step 6: Add the creation UI to `teams.tsx`**

Add a "Create a team" section (name input + a public/private segmented choice, reusing the
existing `SegmentedControl` component the same way `profile.tsx`'s theme picker does) below the
existing join-by-code/auto-join buttons. On success, invalidate `["myTeam"]` and navigate to
`/teams/$teamId` exactly like `handleJoinByCode`/`handleAutoJoin` already do, so the new team's
join code (needed to actually invite anyone to a private team) is shown on the existing detail
page — no new UI needed there.

```tsx
import { SegmentedControl } from "../../components/SegmentedControl";
// ...
import { getMyTeam, getTeamLeaderboard, joinTeamByCode, autoJoinTeam, createTeam } from "../../lib/teams.functions";
// ...
  const [teamName, setTeamName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const result = await createTeam({ data: { name: teamName, visibility } });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
    navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
  }
```

```tsx
        <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">Create a team</h2>
        <div className="mt-3 space-y-3">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            maxLength={40}
            className="w-full rounded-xl border border-hairline px-4 py-2.5 text-sm"
          />
          <SegmentedControl
            ariaLabel="Team visibility"
            value={visibility}
            onChange={(v) => setVisibility(v as "public" | "private")}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ]}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !teamName.trim()}
            className="w-full rounded-full border border-hairline px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            Create team
          </button>
        </div>
```

- [ ] **Step 7: Write/extend `teams.test.tsx` for the create flow**

```tsx
const createTeam = vi.fn();
vi.mock("../../lib/teams.functions", () => ({
  getMyTeam,
  getTeamLeaderboard,
  joinTeamByCode,
  autoJoinTeam,
  createTeam,
}));
// add createTeam.mockReset() to beforeEach

it("creates a team and navigates to its detail route", async () => {
  getMyTeam.mockResolvedValue(null);
  getTeamLeaderboard.mockResolvedValue([]);
  createTeam.mockResolvedValue({ ok: true, reason: null, teamId: "t9", joinCode: "XYZ999" });
  renderPage();

  fireEvent.change(screen.getByPlaceholderText("Team name"), { target: { value: "Night Owls" } });
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));

  await waitFor(() =>
    expect(createTeam).toHaveBeenCalledWith({ data: { name: "Night Owls", visibility: "public" } }),
  );
  await waitFor(() =>
    expect(navigateMock).toHaveBeenCalledWith({ to: "/teams/$teamId", params: { teamId: "t9" } }),
  );
});

it("shows the reason when team creation fails", async () => {
  getMyTeam.mockResolvedValue(null);
  getTeamLeaderboard.mockResolvedValue([]);
  createTeam.mockResolvedValue({ ok: false, reason: "invalid-name", teamId: null, joinCode: null });
  renderPage();

  fireEvent.change(screen.getByPlaceholderText("Team name"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));

  expect(await screen.findByText("invalid-name")).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the full web test suite, lint, and typecheck**

Run: `bun run test`, `bun run lint`, `bunx tsc --noEmit`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/teams.functions.ts src/lib/teams.functions.test.ts src/routes/_authenticated/teams.tsx src/routes/_authenticated/teams.test.tsx src/integrations/supabase/types.ts
git commit -m "feat(web): let a user create a team"
```

---

### Task 3: Web — display name + avatar editing on `profile.tsx`

**Files:**
- Modify: `src/lib/leaderboard.functions.ts` (add `avatar_seed` to `updateProfile`'s schema)
- Modify: `src/lib/leaderboard.functions.test.ts` (if it covers `updateProfile`'s schema directly —
  check first; if not, coverage lives in `profile.test.tsx`)
- Modify: `src/routes/_authenticated/profile.tsx`
- Modify: `src/routes/_authenticated/profile.test.tsx`

**Interfaces:**
- Consumes: `updateProfile({ data: { display_name?, country?, theme?, avatar_seed? } })` (existing
  server fn, extended).

- [ ] **Step 1: Write the failing test in `profile.test.tsx`**

```tsx
it("shuffles the avatar and saves the new seed immediately", async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByLabelText("Display name");

  await user.click(screen.getByRole("button", { name: "Shuffle avatar color" }));

  await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
  const call = updateProfile.mock.calls[0][0];
  expect(call.data).toHaveProperty("avatar_seed");
  expect(typeof call.data.avatar_seed).toBe("string");
  expect(call.data.avatar_seed).not.toBe("a");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/routes/_authenticated/profile.test.tsx`
Expected: FAIL — no button named "Shuffle avatar color".

- [ ] **Step 3: Extend `updateProfile`'s schema in `leaderboard.functions.ts`**

```ts
      .object({
        display_name: z.string().min(1).max(40).optional(),
        country: z.string().max(2).optional().nullable(),
        theme: z.enum(["meadow", "studio-ink", "manuscript", "canopy"]).optional(),
        avatar_seed: z.string().min(1).max(32).optional(),
      })
```

- [ ] **Step 4: Add avatar state + shuffle control to `profile.tsx`**

Add `const [avatarSeed, setAvatarSeed] = useState("");`, sync it from `profile.avatar_seed` in the
existing `useEffect` alongside `name`/`country`, and use `avatarSeed` (not `profile?.avatar_seed`)
for the header circle's color so the shuffle is instantly visible, mirroring how the theme picker
applies its own change locally before the network call resolves.

```tsx
  async function shuffleAvatar() {
    const next = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    setAvatarSeed(next);
    await updateProfile({ data: { avatar_seed: next } });
    await qc.invalidateQueries({ queryKey: ["me"] });
  }
```

```tsx
          <span
            className="grid size-16 place-items-center rounded-full text-xl font-semibold text-surface"
            style={{
              backgroundColor: `hsl(${((avatarSeed || "a").charCodeAt(0) * 37) % 360} 40% 45%)`,
            }}
          >
            {(name || "?").slice(0, 1).toUpperCase()}
          </span>
          <button
            type="button"
            onClick={shuffleAvatar}
            aria-label="Shuffle avatar color"
            className="text-xs font-medium text-moss underline underline-offset-4"
          >
            Shuffle
          </button>
```

(placed directly under the existing avatar circle in the header `flex` row; keep the existing
`seed` variable removed in favor of the new `avatarSeed` state, since it's now stateful rather than
read once from `profile`)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/routes/_authenticated/profile.test.tsx`
Expected: PASS, including all pre-existing tests in this file unmodified.

- [ ] **Step 6: Run lint + typecheck**

Run: `bun run lint`, `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/leaderboard.functions.ts src/routes/_authenticated/profile.tsx src/routes/_authenticated/profile.test.tsx
git commit -m "feat(web): let a user shuffle their avatar color"
```

---

### Task 4: iOS Kit — `ProgressSyncClient` extensions for profile identity + team creation

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+DisplayIdentity.swift`
- Create: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+DisplayIdentityTests.swift`
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Teams.swift`
- Modify: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+TeamsTests.swift`

**Interfaces:**
- Produces: `ProfileIdentity { displayName: String; avatarSeed: String }`,
  `fetchProfileIdentity(userID:) async throws -> ProfileIdentity?`,
  `updateProfileDisplayName(_:userID:) async throws`,
  `updateProfileAvatarSeed(_:userID:) async throws`.
- Produces: `createTeam(name: String, visibility: String) async throws -> (ok: Bool, reason:
  String?, teamID: String?, joinCode: String?)`.

- [ ] **Step 1: Write `ProgressSyncClient+DisplayIdentityTests.swift`**

```swift
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientDisplayIdentityTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!
    private let userID = "11111111-1111-1111-1111-111111111111"

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    func testFetchProfileIdentityDecodesTheRow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["display_name": "Ada", "avatar_seed": "abc12345"]])
        }
        let identity = try await client.fetchProfileIdentity(userID: userID)
        XCTAssertEqual(identity, ProfileIdentity(displayName: "Ada", avatarSeed: "abc12345"))
    }

    func testFetchProfileIdentityReturnsNilWhenNoRowExists() async throws {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: []) }
        let identity = try await client.fetchProfileIdentity(userID: userID)
        XCTAssertNil(identity)
    }

    func testUpdateProfileDisplayNamePatchesTheRow() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }
        try await client.updateProfileDisplayName("Grace", userID: userID)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "PATCH")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["display_name"] as? String, "Grace")
    }

    func testUpdateProfileAvatarSeedPatchesTheRow() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }
        try await client.updateProfileAvatarSeed("deadbeef", userID: userID)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "PATCH")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["avatar_seed"] as? String, "deadbeef")
    }
}
```

- [ ] **Step 2: Implement `ProgressSyncClient+DisplayIdentity.swift`**

```swift
import Foundation

/// Display name + avatar-color editing (BACKLOG §0.0p). Own extension
/// file, same merge-conflict-avoidance reasoning as
/// ProgressSyncClient+Profile.swift (theme) and +Teams.swift. Plain
/// PostgREST GET/PATCH against `profiles` -- profiles_update_own already
/// lets a user write their own row (see +Profile.swift's own comment),
/// this just adds the two columns web's updateProfile already writes.
public struct ProfileIdentity: Sendable, Equatable {
    public let displayName: String
    public let avatarSeed: String
}

extension ProgressSyncClient {

public func fetchProfileIdentity(userID: String) async throws -> ProfileIdentity? {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "select", value: "display_name,avatar_seed"),
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "GET"
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
          let row = rows.first,
          let displayName = row["display_name"] as? String,
          let avatarSeed = row["avatar_seed"] as? String else {
        return nil
    }
    return ProfileIdentity(displayName: displayName, avatarSeed: avatarSeed)
}

public func updateProfileDisplayName(_ displayName: String, userID: String) async throws {
    var request = restRequest(path: "profiles", query: [URLQueryItem(name: "id", value: "eq.\(userID)")])
    request.httpMethod = "PATCH"
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["display_name": displayName])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
}

public func updateProfileAvatarSeed(_ avatarSeed: String, userID: String) async throws {
    var request = restRequest(path: "profiles", query: [URLQueryItem(name: "id", value: "eq.\(userID)")])
    request.httpMethod = "PATCH"
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["avatar_seed": avatarSeed])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
}

} // extension ProgressSyncClient
```

- [ ] **Step 3: Write the failing test + implementation for `createTeam` in the Teams files**

Test (append to `ProgressSyncClient+TeamsTests.swift`):

```swift
    func testCreateTeamPostsNameAndVisibilityAndReturnsTheJoinCode() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t9", "join_code": "XYZ999"]])
        }
        let result = try await client.createTeam(name: "Night Owls", visibility: "private")
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t9")
        XCTAssertEqual(result.joinCode, "XYZ999")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/create_team"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_name"] as? String, "Night Owls")
        XCTAssertEqual(body["_visibility"] as? String, "private")
    }

    func testCreateTeamSurfacesASwitchLockedRejectionAsAFalseOkNotAThrow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "reason": "switch-locked", "team_id": NSNull(), "join_code": NSNull()]])
        }
        let result = try await client.createTeam(name: "Night Owls", visibility: "public")
        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.reason, "switch-locked")
    }
```

Implementation (append inside the `extension ProgressSyncClient { ... }` block in
`ProgressSyncClient+Teams.swift`, before its closing brace):

```swift
    public func createTeam(name: String, visibility: String = "public") async throws -> (ok: Bool, reason: String?, teamID: String?, joinCode: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/create_team"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_name": name, "_visibility": visibility])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String, row["team_id"] as? String, row["join_code"] as? String)
    }
```

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+DisplayIdentity.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+DisplayIdentityTests.swift ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Teams.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClient+TeamsTests.swift
git commit -m "feat(ios-kit): add profile identity and team-creation client methods"
```

(Swift cannot be compiled/run locally in this environment — this task's code is written
carefully against the existing file's exact conventions but stays "implemented, pending CI"
until `ios-app-build` runs it.)

---

### Task 5: iOS App — Settings display-identity section + Teams creation UI

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/SettingsView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/TeamsView.swift`

**Interfaces:**
- Consumes: everything produced in Task 4.

- [ ] **Step 1: Add a "Profile" section to `SettingsView.swift`**

Add state:

```swift
@State private var displayName = ""
@State private var avatarSeed = ""
@State private var isSavingName = false
@State private var isShufflingAvatar = false
@State private var identityErrorMessage: String?
```

Load on appear (alongside existing `.task`/lifecycle — this view currently has no `.task`, so add
one to the outer `NavigationStack`):

```swift
.task { await loadIdentity() }
```

```swift
private func loadIdentity() async {
    guard let accessToken = session.accessToken, let userID = session.userID else { return }
    let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    if let identity = try? await client.fetchProfileIdentity(userID: userID) {
        displayName = identity.displayName
        avatarSeed = identity.avatarSeed
    }
}

private func saveDisplayName() async {
    guard let accessToken = session.accessToken, let userID = session.userID else { return }
    let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    isSavingName = true
    defer { isSavingName = false }
    let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    do {
        try await client.updateProfileDisplayName(trimmed, userID: userID)
        displayName = trimmed
    } catch {
        identityErrorMessage = "Couldn't save your name. Try again."
    }
}

private func shuffleAvatar() async {
    guard let accessToken = session.accessToken, let userID = session.userID else { return }
    let next = String((0..<8).map { _ in "0123456789abcdef".randomElement()! })
    isShufflingAvatar = true
    defer { isShufflingAvatar = false }
    let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    do {
        try await client.updateProfileAvatarSeed(next, userID: userID)
        avatarSeed = next
    } catch {
        identityErrorMessage = "Couldn't shuffle your avatar. Try again."
    }
}
```

Add a `Section` above the existing "Theme" section:

```swift
Section {
    HStack(spacing: AlphonsoSpacing.sm + 4) {
        Circle()
            .fill(AvatarColor.forSeed(avatarSeed.isEmpty ? "a" : avatarSeed))
            .frame(width: 40, height: 40)
            .overlay(
                Text(displayName.prefix(1).uppercased())
                    .font(AlphonsoFont.sans(16, weight: .semiBold))
                    .foregroundStyle(.white)
            )
        Button {
            Task { await shuffleAvatar() }
        } label: {
            if isShufflingAvatar {
                ProgressView().tint(AlphonsoColor.moss)
            } else {
                Text("Shuffle")
            }
        }
        .font(AlphonsoFont.sans(14, weight: .medium))
        .disabled(isShufflingAvatar)
    }
    TextField("Display name", text: $displayName)
        .font(AlphonsoFont.sans(15))
        .onSubmit { Task { await saveDisplayName() } }
    Button {
        Task { await saveDisplayName() }
    } label: {
        if isSavingName {
            ProgressView().tint(AlphonsoColor.moss)
        } else {
            Text("Save Name")
        }
    }
    .font(AlphonsoFont.sans(15, weight: .medium))
    .disabled(isSavingName || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    if let identityErrorMessage {
        Text(identityErrorMessage)
            .font(AlphonsoFont.sans(13))
            .foregroundStyle(AlphonsoColor.destructive)
    }
} header: {
    Text("Profile")
        .font(AlphonsoFont.sans(12, weight: .semiBold))
        .tracking(0.4)
        .foregroundStyle(AlphonsoColor.ember)
} footer: {
    Text("Your name and avatar color are visible to other learners on leaderboards, friends, and duels.")
        .font(AlphonsoFont.sans(12))
        .foregroundStyle(AlphonsoColor.inkSoft)
}
.listRowBackground(AlphonsoColor.parchment)
```

- [ ] **Step 2: Add a "Create a team" section to `TeamsView.swift`**

Add state:

```swift
@State private var newTeamName = ""
@State private var newTeamVisibility = "public"
```

Add inside the `else` branch's `Section` (the "no team yet" state), after the existing "Put me on
a team" button:

```swift
    Divider()
    TextField("Team name", text: $newTeamName)
        .font(AlphonsoFont.sans(15))
    Picker("Visibility", selection: $newTeamVisibility) {
        Text("Public").tag("public")
        Text("Private").tag("private")
    }
    .pickerStyle(.segmented)
    Button("Create team") { Task { await createTeam() } }
        .tint(AlphonsoColor.moss)
        .disabled(newTeamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
```

Add the method:

```swift
private func createTeam() async {
    guard let client else { return }
    errorMessage = nil
    let name = newTeamName.trimmingCharacters(in: .whitespacesAndNewlines)
    let result = try? await client.createTeam(name: name, visibility: newTeamVisibility)
    if result?.ok == true {
        newTeamName = ""
        await loadAll()
    } else {
        errorMessage = result?.reason
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/SettingsView.swift ios/LearnWithAlphonso/Sources/TeamsView.swift
git commit -m "feat(ios): let a user edit their display identity and create a team"
```

(Same "implemented, pending CI" caveat as Task 4 — this is `ios/LearnWithAlphonso/Sources/`, only
verified once `ios-app-build` is green.)

---

### Task 6: Final verification pass

- [ ] **Step 1: Run the full web gate**

Run: `bun run lint && bunx tsc --noEmit && bun run test && bun run build`
Expected: all PASS/clean.

- [ ] **Step 2: Confirm no diff to ARCHITECTURE.md / AGENTS.md / README.md / CHANGELOG.md /
  docs/BACKLOG.md**

Run: `git diff --stat main` (or against the branch's base) and eyeball the file list.

- [ ] **Step 3: `git fetch origin` and diff two-dot against `origin/main`**

Run: `git fetch origin && git diff --stat origin/main <branch>` (two dots — not three, per project
instructions: three-dot silently drops anything merged into main since the branch started).

- [ ] **Step 4: Push and open the PR, then confirm CI actually ran**

Run: `gh pr create ...` then `gh run list --branch <branch>` — a PR that produced zero Actions
runs reads as "unchecked," not "failed" (project instructions §0.0t).

- [ ] **Step 5: Run `/code-review` on the branch (fresh-model check, since this plan was executed
  natively with no per-task reviewer)**
