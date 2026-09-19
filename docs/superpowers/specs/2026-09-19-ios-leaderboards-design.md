# Design: iOS Leaderboards

> Written 2026-09-19. V2, parallel-safe (new screen, new tab, touches no
> file any other V2 iOS doc touches). Companion doc:
> `2026-09-19-ios-friends-design.md` shares the same `get_friends_progress`
> RPC data but is a separate screen/PR.

## Goal

Port the web app's `/league` screen (global/friends/country ×
weekly/all-time leaderboards) to iOS, as a new tab.

## Why this is cheap

`get_leaderboard(_scope text, _period text)` already exists as a
`SECURITY DEFINER` Postgres RPC (`supabase/migrations/20260822065513_*.sql`),
already granted to `authenticated`, and already does all the real work
(scope filtering, period-based XP aggregation, ranking, LIMIT 50) —
**no Edge Function, no new backend code**. This is the same
direct-RPC-via-PostgREST pattern already used for
`ProgressSyncClient.claimReviewClearBonus` in
`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift`.

The RPC returns `TABLE (user_id uuid, display_name text, country text,
avatar_seed text, xp integer)` — it does **not** include an `isYou` flag
(the web computes that client-side by comparing `row.user_id` to the
logged-in user's own id). Do the same on iOS: compare against
`Session.userID` (already added — `SupabaseSession.userID`, decoded from
GoTrue's `user.id` in the auth response, exposed via `Session.userID`).

## Components (Swift)

- **Kit**: `ProgressSyncClient.fetchLeaderboard(scope: String, period:
  String) async throws -> [LeaderboardRow]`, calling
  `POST {supabaseURL}/rest/v1/rpc/get_leaderboard` with body
  `{"_scope": scope, "_period": period}` — same request shape as
  `claimReviewClearBonus`. `LeaderboardRow`: `userID: String, displayName:
  String, country: String?, avatarSeed: String, xp: Int`.
- **App**: `LeaderboardView.swift` — a `Course`-independent screen (XP is
  account-wide via `language_progress`/`user_progress`, not per-course;
  verify this against `get_leaderboard`'s actual join before assuming).
  Two `Picker`s (scope: global/friends/country; period: weekly/all-time),
  a `List` of ranked rows (rank number, avatar-seed color circle with
  first-letter initial — matches the web's `hsl(seed.charCodeAt(0)*37 %
  360, 40%, 45%)` color derivation, port that formula exactly), highlight
  the current user's own row.
- Empty states per scope, matching the web's copy: "Add friends to
  compete side by side" (friends), "Set your country on your profile to
  see this board" (country — note iOS has no profile/country-setting UI
  yet; this empty state will be the common case until one exists, that's
  fine, not a blocker for this doc), "Finish a lesson to appear on the
  board" (global).

## Data flow

1. `.task(id: (scope, period))` triggers `fetchLeaderboard` on change.
2. Loading state while in flight; error state on failure (network only —
   the RPC itself fails closed to an empty result for an unauthenticated
   caller, never throws).

## Testing

- Kit: `ProgressSyncClientTests` — new test verifying the RPC request
  shape (`_scope`/`_period` in the body, `rest/v1/rpc/get_leaderboard`
  path) and response decoding, same pattern as
  `testClaimReviewClearBonusPostsToTheRpcAndReturnsTheResult`.
- App: no local test target exists for SwiftUI views (matches this
  repo's precedent — `ios-app-build` CI compiling it is the verification).

## Rollout

Wire into `RootView`'s `TabView` as a new "League" tab. No backend
changes, no migration, no Edge Function deploy — this ships the moment
CI is green.
