# Design: Deeper Gamification (V4 candidate #7)

> Written 2026-09-22. Architectural — four independent systems, each
> with its own migration/RPC set/UI surface, sharing one SQL building
> block. Brainstormed interactively; scope deliberately expanded beyond
> the kickoff doc's original framing (see "Scope" below) at the user's
> explicit direction, not by drift.

## Goal

`docs/v4-kickoffs/00-INDEX.md` item 7 ("Deeper gamification") called
this "the vaguest candidate here" and left open: what's a "season"?
does it reset XP or layer a separate score? team competition needs a
new grouping concept that doesn't exist today (friends are strictly
1:1). This doc resolves those questions concretely.

## Scope

Four systems, deliberately kept separate rather than unified, per this
session's brainstorm:

1. **Teams** — a persistent, many-to-one grouping (new; nothing like it
   exists today), competing on weekly XP.
2. **Season ladder** — a Duolingo-style weekly promotion/demotion
   cohort system, distinct from the existing permanent `league_tier`
   milestone badge.
3. **Challenges** — fixed weekly solo goals, plus an "open to anyone"
   duel-matchmaking queue extending the existing friend-only `duels`.
4. **Themed content events** — explicitly **deferred**, documented at
   the end of this doc for a future pass, not built here.

Each of 1–3 ships as its own migration + RPC set + web/iOS UI surface,
implemented and verified as separate phases (same worktree-per-feature
pattern as the earlier V4 batch), not one giant PR.

## Shared building blocks

Both #1 and #2 need "how much XP did this user earn this week," and #2
specifically needs it for arbitrary *past* weeks (to resolve last
week's cohort once it's over). Rather than reimplement this three
times, it's extracted once:

- **`weekly_xp(_user_id uuid, _week_start date) -> integer`**: a SQL
  function extracting the computation currently inlined in
  `get_leaderboard` (`SUM(activity_days.xp_earned) WHERE day >=
  _week_start AND day < _week_start + 7`), parameterized by an
  explicit week start rather than always "the current week."
  `get_leaderboard` itself is refactored to call this too, so there is
  exactly one place this logic lives — it cannot drift between four
  call sites.
- **Monday-start ISO week boundary**, made a named constant/function
  rather than copy-pasted: `current_date - (extract(isodow from
  current_date)::int - 1)`. This is `get_leaderboard`'s existing
  definition; teams, season cohorts, and solo challenges all reuse it
  so "this week" means the same date range everywhere.
- **Lazy resolution, no cron anywhere.** Teams' weekly reward, season
  ladder promotion/demotion, and solo challenge completion are all
  resolved the same way: computed and written the first time something
  touches them after the relevant week has ended — the same pattern
  `get_my_duels` already uses for its own lazy duel-window resolution.
  This feature adds zero scheduled jobs.

## 1. Teams

### Data model

```sql
teams (
  id uuid primary key,
  name text not null,
  join_code text not null unique,
  visibility text not null check (visibility in ('public','private')),
  member_cap integer not null default 30,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
)

team_members (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  -- enforced separately: a user_id can only appear in ONE team_members
  -- row across all teams at a time (exclusive membership) -- a unique
  -- index on user_id alone, not just the composite key.
  unique (user_id)
)

team_weekly_rewards (
  team_id uuid references teams(id) on delete cascade,
  week_start date not null,
  resolved_at timestamptz,
  primary key (team_id, week_start)
)
```

### Joining, membership, and the switch lock

Three entry points, one underlying write path:

- `join_team(_code text)` — by invite code, works for public or
  private teams.
- `join_public_team(_team_id uuid)` — browse/discover flow, public
  teams only.
- `auto_join_team()` — finds any public team with room; if none exist,
  creates a fresh one (auto-generated name, e.g. `"Team " ||
  <adjective> || ' ' || <noun>`, deterministically picked from small
  word lists via the same hash-based selection `bank-engine.ts`
  already uses for shuffling, seeded by the new team's id).

All three call one internal `_join_team_impl(_team_id, _user_id)`
function so the switch-lock and cap rules exist in exactly one place:

- **Switch lock**: `leave_team()` (and implicitly, joining a different
  team) is rejected with reason `'switch-locked'` if the caller's
  current `team_members.joined_at` is less than 7 days old.
- **Member cap race condition** (self-critique finding, fixed here):
  the join path must `SELECT count(*) FROM team_members WHERE team_id
  = _team_id FOR UPDATE` — locking on the team's existing membership
  rows — before checking against `member_cap` and inserting, so two
  concurrent joins against a near-full team can't both squeeze past
  the cap.

### Scoring

`get_team_leaderboard()` ranks teams by `SUM(weekly_xp(member.user_id,
current_week_start))` across current `team_members` — computed live on
every read, never cached, so it can never go stale and needs no reset
step of its own.

**Known, accepted limitation** (not fixed, documented instead): this
counts a member's *entire* week of XP, not just XP earned while
actually on that team. Someone joining mid-week with an already-XP-heavy
week front-loads the team's score. The 7-day switch lock limits how
often this can be exploited (at most one team-hop per week per user),
but isn't airtight. Acceptable for v1; revisit if it proves to be a
real abuse vector.

**Known, accepted limitation**: a user auto-assigned into a
brand-new 1-person team is locked there for 7 days with no teammates —
a cold-start gap. Worth a follow-up (e.g. a grace period letting tiny
new teams exempt themselves from the lock), not solved here.

### Weekly reward

Resolved lazily: the first time any member of last week's #1 team
(by `get_team_leaderboard` computed against the *previous* week's date
range) does anything XP-earning in a new week, a flat +100 XP bonus
(sized to be worth a bit more than one perfect lesson —
`computeXpGain`'s max single-lesson value is 70 — without dominating a
real week; easy to retune later) is credited to that member's
`language_progress.xp` for their active course
(`profiles.active_language`).

**Deliberately not added to `activity_days`** — that table is exactly
what `weekly_xp` sums for both team and season scoring, so crediting
the bonus there would let a winning team's reward inflate *next*
week's competition. `team_weekly_rewards` (team_id, week_start,
resolved_at) is checked/written atomically as part of granting, so a
team's win can only ever pay out once.

### iOS/web parity

Both platforms get: a Teams tab (browse public teams, join by code,
create, leave), a team leaderboard view (same visual shape as the
existing `/league`/`LeaderboardView` global ranking), and a team detail
view (roster, this week's score, switch-lock countdown if applicable).

## 2. Season ladder

### Data model

```sql
season_cohorts (
  id uuid primary key,
  division integer not null,  -- 1 (lowest) .. 5 (highest)
  week_start date not null
)

season_cohort_members (
  cohort_id uuid references season_cohorts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (cohort_id, user_id),
  unique (user_id, cohort_id)  -- a user has at most one cohort per week
)

season_placements (
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  division integer not null,
  rank_in_cohort integer not null,
  cohort_size integer not null,
  primary key (user_id, week_start)
)
```

No XP snapshot table needed — `activity_days` retains full history, so
`weekly_xp(user_id, any_past_week_start)` can always be recomputed live
for a cohort that has already ended.

### Divisions

5 divisions (`Division 1` through `Division 5` — deliberately
placeholder names, distinct from `league_tier`'s bronze/silver/
sapphire/ruby/diamond naming so the two concepts are never visually
confused; easy to reskin with real names later without a schema
change). Everyone starts in Division 1.

### Lazy weekly resolution

The first time a user does anything XP-earning in a new ISO week:

1. Check `season_placements` for a row at the *previous* week's start.
   If one already exists, skip to step 4 (already resolved).
2. Find the user's `season_cohort_members` row for the previous week.
   If none exists (first time ever seeing this user, or they were
   inactive that week and never got assigned a cohort), skip straight
   to step 4 with a default of Division 1.
3. **Resolve the cohort** (only happens once, by whichever member
   triggers it first — guarded by the `season_placements` primary key,
   so a second concurrent trigger is a harmless no-op insert
   conflict): rank every member of that cohort by
   `weekly_xp(user_id, that_week_start)` descending. Using **ratios,
   not fixed counts** (self-critique finding, fixed here — a fixed
   "top 10 / bottom 5" breaks if a cohort didn't reach 30 members that
   week): top third promotes one division, bottom sixth demotes one
   division, the rest stay. Division 5 has no promotion target (top
   performers stay); Division 1 has no demotion target (bottom
   performers stay). Write one `season_placements` row per member.
4. Place the user into a `season_cohorts` row for the *current* week at
   their resulting division — find one with room (<30 members), or
   create a new one. Same room-or-create logic as team auto-join,
   parameterized by division instead of by "any public team."

### iOS/web parity

Both platforms get a Season tab: current division, live rank within
the current (in-progress, unresolved) cohort — computed the same way
as the final ranking, just against a week that hasn't ended yet — and
last week's promotion/demotion result once resolved.

## 3. Challenges

### 3a. Solo weekly goals

No new progress-tracking table for two of the three challenge types —
they're computed live from data that already exists:

- **Lesson count** ("5 lessons this week"): `COUNT(*) FROM
  lesson_completions WHERE user_id = ? AND completed_at >=
  week_start`.
- **Perfect-score count** ("3 perfect scores this week"): same query,
  `WHERE correct = total`.
- **Study every day** ("maintain your streak all week"): `COUNT(DISTINCT
  day) FROM activity_days WHERE user_id = ? AND day >= week_start` `=
  7`.

```sql
challenge_completions (
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  template_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, week_start, template_id)
)
```

**Templates**: a small hardcoded pool (~6) as TypeScript/SQL constants
— same pattern as `LEAGUES`/`LEAGUE_THRESHOLDS`, no new
content-authoring system. Each week, 3 of the 6 are selected
deterministically by hashing `week_start` (reusing `bank-engine.ts`'s
existing `hash()` function) — the same 3 for every user that week, but
varying week to week instead of being permanently static.

**Completion + reward**: a single RPC (`claim_weekly_challenges()`, or
folded into the existing lesson-completion flow) recomputes each of
the current week's 3 templates' live progress; any that just crossed
their threshold and don't already have a `challenge_completions` row
get one inserted (the primary key prevents double-granting on a
re-check) and the XP reward (same +100 sizing as the team win bonus,
credited to `language_progress.xp` the same way, for the same
next-week-inflation reason) is granted atomically alongside.

### 3b. Open duel matchmaking

```sql
duel_queue (
  user_id uuid references auth.users(id) on delete cascade primary key,
  course text not null,
  cefr_level text not null,
  match_by_level boolean not null default true,
  queued_at timestamptz not null default now()
)
```

`join_open_duel_queue(_course, _match_by_level)`:

1. Look for another waiting entry: same `course`, and — unless
   *either* party has `match_by_level = false` — an adjacent CEFR
   level (same level, or one step away in `levels.ts`'s existing
   ordering).
2. **Concurrency fix (self-critique finding)**: the search must use
   `SELECT ... FOR UPDATE SKIP LOCKED` on candidate `duel_queue` rows,
   Postgres's standard safe-concurrent-queue pattern — without it, two
   users calling this function at nearly the same instant could both
   read the same waiting row and both try to claim it.
3. Found → delete both queue rows, create a `duels` row via the same
   insert `create_duel` already does, skipping only the friendship
   check (this is the one place duel creation doesn't require an
   accepted friendship).
4. Not found → insert the caller as a new waiting row.

`leave_duel_queue()` removes the caller's row. Stale entries (older
than 10 minutes) are skipped as match candidates and opportunistically
deleted the next time anyone calls `join_open_duel_queue` — lazy
cleanup, no cron.

### iOS/web parity

Both platforms get: a weekly challenges card (3 goals, live progress,
claimed state) on the existing home/learn screen area, and an "Open
Duel" entry point next to the existing friend-duel flow (queue
button → matched/waiting state → same duel UI already built for
friend duels once matched).

## Deferred: themed content events

Explicitly **not built in this pass** — scoped during the brainstorm
for whoever picks it up later, kept here so the reasoning survives:

- **What it is**: time-boxed content drops (a holiday-themed lesson
  pack, a bonus-XP window) — a content/curriculum concern, not a
  competitive-mechanic one. Different tooling area entirely (touches
  `pack-tool.ts`/`bank-engine.ts`, not the teams/season/challenges
  backend above).
- **Why deferred**: the two scoping options considered are genuinely
  different sizes of commitment, and deserve their own brainstorming
  pass rather than a rushed bolt-on here.
- **Minimal version (recommended starting point when this is picked
  up)**: add optional `startsAt`/`endsAt` fields to a `Pack` (or a
  lightweight wrapper referencing existing pack ids), and a
  banner/badge in the UI (web + iOS) when a pack is currently active.
  Authored the same way packs are today — hand-edited or via
  `pack-tool.ts` — no new admin UI needed.
- **Full version (explicitly not recommended without further
  scoping)**: an admin UI for creating/previewing/scheduling timed
  content drops without touching code. Closer to its own initiative
  than an extension of this one — don't reach for it first.

## Testing

Same conventions as the rest of this codebase:

- Pure logic (ratio-based promotion/demotion math, challenge-threshold
  checks, week-boundary computation, queue-matching level-adjacency
  logic) extracted into testable functions, unit tested without a
  database — same "pure logic separated from I/O" pattern as
  `progress-math.ts`/`SRSEngine`.
- SQL/RPC logic itself is not unit-tested at the SQL level (matches
  this repo's established precedent — `get_leaderboard`,
  `accept_friend_invite`, etc. have no direct SQL tests either);
  correctness here comes from careful review + real Supabase project
  verification of migrations, same as every other migration in this
  repo.
- iOS: CI-verified via `ios-app-build`/`ios-swift-tests` on a PR per
  phase (no local Xcode/macOS in this dev environment).

## Rollout

Three implementation phases, each its own worktree/branch/PR (not one
combined PR), sequenced by dependency:

1. **Shared building block first**: extract `weekly_xp` out of
   `get_leaderboard`, verify the refactor changes nothing about
   existing leaderboard behavior (existing tests should still pass
   unchanged) — this has to land before teams or season ladder can
   build on it.
2. **Teams and Season ladder** can then proceed in parallel (both only
   depend on `weekly_xp`, not on each other).
3. **Challenges** (solo goals + open duels) has no dependency on 1/2 at
   all and could run fully in parallel with everything.

Migrations need explicit go-ahead before touching the live Supabase
project, same as every other production change in this repo.
