# Study together: team missions and language buddies

Date: 2026-10-06. Status: design approved by the owner on 2026-10-06 (BACKLOG 0.0-ac item 2). Decisions made with the owner: both features in one spec, built in the order below; target scales with team size; reward is XP plus a shared badge; members see the team total plus their own count; buddies pair with an existing friend or through opt-in matching; the buddy goal is a small weekly lesson count with a pair streak; **buddies talk through fixed preset messages only, never free text** (free text would add a new kind of user-generated content and change the App Store submission: App Privacy answers, age rating and moderation scrutiny).

## Implementation status (kept current)

| Phase | What | State |
|---|---|---|
| 1 | Team mission: database, `get_team_mission()`, web card, privacy line, export | MERGED and live (PRs #230, #231) |
| 2a | Team player badge (database grant, catalog, three bundles) | MERGED and live (#232) |
| 2b | Team mission on iOS | MERGED (#233), in no build |
| 2c | Team mission on Android | MERGED (#234), in no release |
| 3a | Buddy pairing between friends and weekly goal, server and web | IN REVIEW (branch `feat/buddy-pairing`, plan `2026-10-06-buddy-pairing-web.md`) |
| 3b | Opt-in matching with strangers (`buddy_pool`) | BLOCKED on the owner's age-rating decision (BACKLOG 0.0-ai) |
| 4 | Buddy on iOS and Android | iOS IN REVIEW (branch `feat/buddy-native`); Android next |
| 5 | Buddy preset messages, server and web | NOT started |
| 6 | Buddy presets on iOS and Android | NOT started |

**Part 1 (team mission) is complete on web, iOS and Android; what remains is Parts 2-3 (phases 3-6, the language buddy).** Native device checks are owner-run (`android/LearnWithAlphonso/DEVICE-CHECKLIST.md`, and the iOS checks listed in BACKLOG).

Plans: `docs/superpowers/plans/2026-10-06-team-mission-web.md`, `2026-10-06-team-player-badge.md`. Phases 2b and 2c were executed directly from the web plan's fixtures and the patterns of the goal planner (no separate plan file). Findings that changed the design along the way: the payout course is the one the member studied, not `profiles.active_language` (BACKLOG 0.0-af); a team below two members is never paid; the dead `mergeGuestProgress` endpoint was removed because it could fake lesson completions. Running the SQL while verifying the older payouts also showed that **joining or creating a team never worked in production** (an ambiguous `team_id` in `_join_team_impl` and `get_my_team`, fixed in `20261006170000`), so nobody could be on a team, which also made the team screen and the mission card on it unreachable, and `get_team_mission` returns nothing without a team membership: the whole mission feature was effectively dormant until that migration.

## Goal

Rivals are solo experiences; this app already has teams, friends, duels, nudges, block and report. Give learners a reason to study *with* someone: a weekly goal a team reaches together, and one study partner with a shared streak.

## What exists today (reused, not rebuilt)

- `teams` / `team_members(team_id, user_id, joined_at)`, `get_my_team`, `_join_team_impl`, `kick_team_member`, weekly leaderboard, the lazy weekly +100 XP bonus (a side effect of a read function, guarded by a primary key, no cron).
- `lesson_completions(user_id, lesson_id, completed_at, ...)` (best attempt kept per lesson), `language_progress.xp`, `achievements` / `user_achievements`.
- `friendships`, `nudges` (insert policy requires an accepted friendship), `blocked_users`, `content_reports`, `block_user`, the display-name filter.
- Pattern from the goal planner: a pure function in `src/lib/`, a shared fixtures JSON pinned byte-for-byte into the iOS Kit and Android core tests, wording identical across platforms, stale-async guards in the client models.

## Part 1: Team mission

- **Week** = ISO week starting Monday, UTC, the same `wk` the weekly challenges and team bonus use.
- **Target** = `MISSION_PER_MEMBER (4) x member count`, snapshotted into `team_missions` on the first read of the week. Members who join later raise the target only from the next week. A team needs at least `MISSION_MIN_MEMBERS (2)` to have a mission.
- **Progress** = distinct lessons completed this week (`completed_at >= max(week_start, member joined_at)`) by *current* members. Distinct because `lesson_completions` keeps one row per lesson, so replays cannot farm it. Counting from `joined_at` stops join-hopping. A member who leaves takes their contribution with them (documented; simplest rule that cannot be gamed).
- **Reward**, lazily on the next read after the total reaches the target, exactly once per team per week: each member with at least one contributing lesson gets `MISSION_XP (50)` added to `language_progress.xp` for their active course, and the `team_player` achievement (a new `achievements` row; the badge ships in Phase 2 (PR `feat/team-player-badge`) together with the iOS and Android catalogs, because the achievements catalog is mirrored on all three platforms, so Phase 1 pays the XP and records it in `team_mission_rewards`). Idempotent through a primary key on `team_mission_rewards(team_id, week_start, user_id)`.
- **Payout course**: the reward lands on the course the member actually studied (their latest contributing lesson's `language`), never on `profiles.active_language`, which nothing writes and so is always `en`. A team below two members at read time is shown as `needs_members` and is never paid.
- **Accepted edge cases**: payout resolves against *current* members, so a contributor who leaves between the week's end and the first read can drop a finished mission below target (leaving takes your contribution with you). The card shows no "offline, last known" label when a cached value outlives a failed refresh; a native follow-up.
- **Visibility**: team total, target, the caller's own count, days left, whether it is complete. Per-member ranks stay in the existing leaderboard.
- **Surface**: `get_team_mission()` (SECURITY DEFINER, same shape as `get_my_team`), a card on the team screen on web, iOS and Android, plus a line on the Learn page for team members.

## Part 2: Language buddy (pairing and weekly goal)

- **One active buddy per user.** `buddy_pairs(id, user_a, user_b, source, created_at, ended_at, streak_weeks, grace_available)` with `user_a < user_b`, a partial unique index per user while `ended_at IS NULL`, and `CHECK (user_a <> user_b)`.
- **Pair with a friend**: `request_buddy(friend_id)` creates a `buddy_requests` row (accepted friendship required, neither blocked, neither already paired); the friend accepts with `respond_buddy_request`. Both must consent.
- **Opt-in matching**: `join_buddy_pool(course)` puts the caller in `buddy_pool(user_id, course, cefr_level, joined_at)`; the call tries to match the oldest compatible waiting learner (same course, CEFR level within one step, not blocked either way, not paired) with `FOR UPDATE SKIP LOCKED`, the same shape as `join_open_duel_queue`. `leave_buddy_pool()` withdraws. Matching is opt-in and explained in the UI.
- **Weekly goal**: each buddy completes `BUDDY_LESSONS (3)` distinct lessons in the week (counted from `max(week_start, pair created_at)`). Resolved lazily by `get_my_buddy()` for every unresolved past week, recorded in `buddy_weeks(pair_id, week_start, a_count, b_count, outcome)`: both hit it -> `streak_weeks + 1`; otherwise, if `grace_available`, the grace is spent and the streak holds; otherwise the streak resets to 0. A hit week restores the grace.
- **Ending**: either buddy can end the pair at any time (`end_buddy`); blocking a buddy ends the pair. Reporting a buddy uses the existing `content_reports`.

## Part 3: Buddy presets (no free text)

- A fixed list of `BUDDY_PRESETS` (8 short encouragements, for example `lets_study`, `nice_work`, `keep_going`, `need_a_hand`, `on_my_way`, `good_morning`, `good_night`, `proud_of_you`). The server stores and validates only the **preset id**; the display text lives in the clients with identical wording (pinned by the shared fixtures).
- `send_buddy_message(preset_id)` (SECURITY DEFINER): requires an active pair, the sender in the pair, the preset id in the allowed list, not blocked, and a rate limit (`BUDDY_MESSAGES_PER_HOUR`, 20). Stored in `buddy_messages(id, pair_id, sender_id, preset_id, created_at)`. Reads are through `get_buddy_messages(since)`; clients poll on foreground and while the screen is open (no realtime socket). A push can reuse the existing `send-push` function later; not in the first cut.
- This is the existing nudge idea made specific to the pair. It adds no user-written content, so App Privacy answers, the age rating and the moderation surface do not change.

## Data and privacy

- New tables (all RLS on, closed by default under the 2026-10-06 privilege rule, each GRANTs only what its policy backs, `-- client-grants: none` where server-only): `team_missions`, `team_mission_rewards`, `buddy_pairs`, `buddy_requests`, `buddy_pool`, `buddy_weeks`, `buddy_messages`. Members read their own pair rows; writes go through the SECURITY DEFINER functions.
- Account deletion: every table has `ON DELETE CASCADE` to `auth.users`. The GDPR export (`USER_ID_EXPORT_TABLES` / `OTHER_OWNED_EXPORT_TABLES`) includes the caller's pair, requests, pool entry and messages; each export table has a SELECT policy for the caller (a test enforces it).
- `privacy.tsx` gets a line on team missions, buddy pairing and preset messages. No change to the App Store privacy answers is expected (no new data type collected beyond what teams and friends already imply); the owner confirms before the iOS build.

## Cross-platform

- Server computes everything; clients render. Pure planner functions in `src/lib/team-mission.ts` and `src/lib/buddy.ts` (`planTeamMission`, `resolveBuddyWeek`), shared fixtures in `src/lib/study-together.fixtures.json` copied byte-for-byte into iOS Kit tests and Android core test resources, pinned by a web test, as with the goal planner.
- Copy parity across `TeamMissionCard.tsx`, iOS `StudyTogetherCopy.swift`, Android `StudyTogetherCopy.kt`.
- iOS and Android code is merged when green but included in no build; the owner cuts builds.

## Error handling

Missions: no team -> no card; fewer than 2 members -> a quiet "invite a friend to start a mission". Buddy: every RPC returns a typed status (`ok`, `not_friends`, `blocked`, `already_paired`, `not_paired`, `rate_limited`, `bad_preset`) that clients map to fixed wording. Offline: show the last cached state labelled as offline, never fabricate progress.

## Testing

- Pure planner functions: table tests plus mutation checks on every guard (target snapshot, join-time counting, grace logic).
- SQL: migration tests pin the exact grants and policies; the policy replay and `rls-client-writes` guards already cover privileges; live verification after deploy through `information_schema.role_table_grants` and the real RPCs (a seeded two-user case through service-role setup is acceptable; real sign-in is owner-run).
- Clients: generation-counter guards unit-tested on Android, reviewed on iOS and web.
- Fresh `fable` reviewer on each PR.

## Phases (one PR each, merged when green)

1. Team mission: migration, `get_team_mission`, planner and fixtures, web card, privacy line.
2. Team mission on iOS and Android.
3. Buddy pairing and weekly goal: migration, RPCs, planner, web.
4. Buddy on iOS and Android.
5. Buddy presets: migration, RPCs, web.
6. Buddy presets on iOS and Android.

## Out of scope (YAGNI)

Free-text chat, images or voice between buddies, team streaks, votes or captain-set targets, realtime sockets, rewards beyond XP and one badge, buddy push notifications (follow-up), more than one buddy.

## Owner items

Confirm the app's minimum age and age rating before stranger matching ships (matching shows another learner's display name and level; no contact channel beyond presets). Confirm App Privacy answers need no change. Sign off device checks for the three surfaces per `DEVICE-CHECKLIST.md`.
