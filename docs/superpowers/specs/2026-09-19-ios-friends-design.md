# Design: iOS Friends

> Written 2026-09-19. V2, parallel-safe. Shares the `get_friends_progress`
> RPC with `2026-09-19-ios-leaderboards-design.md`'s "friends" scope, but
> is its own screen/PR — the two don't touch the same files.

## Goal

Port the web app's invite-link friends system
(`profile_.friends.tsx` + `invite.$inviterId.tsx`) to iOS: share your own
invite link, accept someone else's, see your friends' streak/weekly-XP.

## Backend (already exists, no changes needed)

Both RPCs are `SECURITY DEFINER`, already `GRANT EXECUTE ... TO
authenticated` (`supabase/migrations/20260912041500_accept_friend_invite.sql`):

- `accept_friend_invite(_inviter_id uuid) RETURNS TABLE (ok boolean,
  message text)` — writes both directions of the friendship atomically.
  Self-invite and unknown-inviter are handled server-side (`ok: false` +
  a message), not client-side validation.
- `get_friends_progress() RETURNS TABLE (user_id uuid, display_name
  text, avatar_seed text, streak integer, week_xp bigint)` — the
  logged-in user's own friends list with stats, ordered by `week_xp
  DESC`.

Same direct-RPC-via-PostgREST pattern as `claimReviewClearBonus`/
leaderboards — no Edge Function needed for either call.

## The invite link itself

The web's invite link is `{origin}/invite/{inviterId}` — a plain web
URL. **Decision needed before implementation**: does an iOS user's
"invite link" open in Safari (fine, hits the existing web route, which
already works for signed-in users) or should it deep-link straight into
the app? A real Universal Link (opens the app instead of Safari,
`applinks:` associated domain + an `apple-app-site-association` file
hosted on the web deploy target) is real infrastructure work — a
`.well-known/apple-app-site-association` route on the web app, an
Associated Domains entitlement in `project.yml`, and `onOpenURL`
handling in `LearnWithAlphonsoApp`. **Recommend for V2: skip Universal
Links, just share the plain web URL** (via `ShareLink`/`UIActivityViewController`)
and let it open in Safari, which already works today since the web
route requires being signed in with the *same* Supabase account (one
account, shared backend — this works with zero new code). Revisit
Universal Links as its own follow-up if opening Safari mid-flow proves
to be a real drop-off problem in practice, not preemptively.

## Components (Swift)

- **Kit**: `ProgressSyncClient.acceptFriendInvite(inviterID: String)
  async throws -> (ok: Bool, message: String)` and
  `fetchFriendsProgress() async throws -> [FriendProgress]`
  (`FriendProgress`: `userID: String, displayName: String, avatarSeed:
  String, streak: Int, weekXP: Int`). Same RPC-call shape as
  `claimReviewClearBonus`.
- **App**: `FriendsView.swift` — invite-link share card (`ShareLink`
  with `https://english-buddy-app-33.vercel.app/invite/{Session.userID}` —
  `Session.userID` already added, see `2026-09-19-ios-leaderboards-design.md`)
  + a list of friends (avatar-seed color circle, streak, week XP —
  same color-derivation formula as leaderboards, worth factoring into
  one shared helper if both land close together rather than duplicating
  a third time).
- Accepting an invite someone sent *you*: since Universal Links are
  deferred, this is either (a) out of scope for V2's iOS slice — friends
  made via the web still show up in `get_friends_progress` since it's
  the same backend/account, so iOS is at minimum a *read* surface for
  friends made elsewhere even with zero accept-flow UI — or (b) a manual
  "paste a friend's user id" text field calling `acceptFriendInvite`
  directly, skipping the URL entirely. Recommend (a) for the initial
  slice, (b) as a cheap add-on if wanted.

## Testing

- Kit: new `ProgressSyncClientTests` cases for both RPC calls, mirroring
  `testClaimReviewClearBonusPostsToTheRpcAndReturnsTheResult`.
- App: `ios-app-build` CI compile is the verification, same precedent as
  every other SwiftUI screen this session.

## Rollout

New tab (or reachable from an existing tab's toolbar, matching the web's
"Friends" being reached from Profile rather than a top-level nav item —
iOS has no Profile screen yet either, so a top-level tab is the more
honest V2 choice until one exists). No backend changes.
