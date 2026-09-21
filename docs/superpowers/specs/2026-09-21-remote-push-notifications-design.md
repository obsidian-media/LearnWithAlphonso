# Design: Remote (APNs) Push Notifications

> Written 2026-09-21. V4 candidate #2 (`docs/BACKLOG.md` §2.1,
> `docs/v4-kickoffs/00-INDEX.md` #2). **Additive** to the already-shipped
> V2 local-notification system (`NotificationScheduler.swift` +
> `NotificationLogic.swift`) -- that system is `UNUserNotificationCenter`
> local scheduling only (streak reminder, due-review nudge, weekly recap,
> weakness-practice nudge), no APNs, no server, no device tokens. This
> doc is about a materially different, server-driven delivery path for
> two existing weak features: nudge-a-friend and leaderboard-overtake.

## Hard external blocker (read this first)

Sending a real push requires an **APNs Auth Key** (developer.apple.com ->
Certificates, Identifiers & Profiles -> Keys) plus enabling the **Push
Notifications** capability on the App ID -- both interactive portal
actions only a human with Apple Developer account access can perform, in
the same category as the still-open RevenueCat Paid Applications
Agreement. **No push can be sent or tested end-to-end from this
environment.** Scope below is therefore "everything short of an actual
delivered push, built to the same 'gracefully do nothing if unconfigured'
contract `AppConfig.revenueCatAPIKey`/`EntitlementStore` already
establish for exactly this kind of missing-secret situation" -- not the
full vision, and not pretending otherwise.

## Server-side trigger mechanism (verified this session, not assumed)

Re-checked Supabase's current platform capability directly (docs search +
`list_extensions` against the live project) rather than trusting the
V3 kickoff doc's "unverified, check yourself" flag:

- `pg_net` (async HTTP from Postgres) is available on this project but
  **not yet enabled** (`list_extensions` shows `pg_net` with
  `installed_version: null`) -- this migration enables it.
- `pg_cron` is also available, but **not needed for either feature here**:
  both nudge-send and lesson-completion are already real-time *events*
  the database sees the instant they happen (a row insert / an Edge
  Function already running), not something that needs to be discovered on
  a timer. A **Database Webhook** (Supabase's own name for "a trigger
  function that calls `net.http_post`") is the right-shaped tool for an
  event, and is well-documented, current platform functionality -- see
  Supabase's own "Execute pg_net in a trigger" example. `pg_cron` stays
  unused by this slice; it's the right tool for a genuinely time-based
  job (e.g. a future "nudge someone who hasn't opened the app in 3 days"
  campaign), not for this.
- Because this project already carries the newer `sb_publishable_...` key
  format (`AppConfig.supabasePublishableKey`), Supabase's own migration
  guide flags that `pg_net`/webhook calls should authenticate via the
  `apikey` header with a secret key rather than `Authorization: Bearer`
  for the *new* key format -- but the legacy `service_role` key (a real
  JWT) still works with `Authorization: Bearer` until end of 2026 per the
  same doc, and every existing Edge Function in this repo
  (`complete-lesson`, etc.) still authenticates callers via JWT
  (`anonClient.auth.getClaims`), so this design keeps using
  `Authorization: Bearer <service_role_key>` for consistency with the
  rest of the codebase rather than introducing a second auth convention
  for just this one trigger.

## What already exists that this builds on

- `nudges` table (`20260920020000_nudges.sql`) -- the event this nudges
  the *content* half of the push already exists; this design only adds
  the *delivery* half via a trigger.
- `complete-lesson` Edge Function -- already the one server-side place
  that knows a user's XP just changed, already batches activity-event
  writes. Overtake detection is computed here rather than inventing a
  second, separately-scheduled job.
- `AppConfig.revenueCatAPIKey` / `EntitlementStore.isConfigured` -- the
  exact "nil/empty secret -> feature no-ops, never crashes, never breaks
  the surrounding flow" contract this design copies for
  `supabase/functions/_shared/apns.ts`.

## Components

### Migration (`supabase/migrations/<ts>_remote_push_notifications.sql`)

- `CREATE EXTENSION IF NOT EXISTS pg_net;`
- `device_tokens` table: `id`, `user_id` (defaults `auth.uid()`), `token`
  (raw APNs hex device token), `platform` (`'ios'` only for now),
  `created_at`, `updated_at`. Unique on `(user_id, token)` -- not `token`
  alone, so a shared device with two accounts signed in over time doesn't
  need cross-user reassignment logic (a real but out-of-scope edge case,
  see "Left out"). RLS: `auth.uid() = user_id`-scoped
  select/insert/update/delete, same pattern as `nudges`/`duels`.
- A trigger function on `nudges` (`AFTER INSERT`) that reads a
  `push_trigger_service_key` secret from Supabase Vault and, if present,
  fires `net.http_post` at the new `send-push` Edge Function; if the
  Vault secret isn't set yet, it's a silent no-op (`RETURN NEW`), not an
  error -- nudge-sending itself must never fail because push delivery
  isn't wired up yet. **Operational step a human still owes**: run
  `select vault.create_secret('<the actual service_role key>',
  'push_trigger_service_key');` once against the real project. Not done
  as part of this migration -- a real secret value has no business being
  typed into a file this agent writes or a git-committed migration.

### `supabase/functions/_shared/apns.ts`

`sendPushToUser(admin, userId, title, body, data)` -- the one place that
knows how to sign an ES256 JWT from `APNS_KEY_P8`/`APNS_KEY_ID` and POST
to `api.push.apple.com`. Returns `{ sent: 0, skipped: "not_configured" }`
without touching the network at all when `APNS_KEY_P8` /`APNS_KEY_ID` /
`APNS_TEAM_ID` / `APNS_BUNDLE_ID` aren't all set -- the
`revenueCatAPIKey`-style contract. A 400/410 APNs response (bad/dead
token) prunes that row from `device_tokens` reactively; any other
failure is swallowed (best-effort -- a push failure must never surface as
an error to whatever triggered it).

### `supabase/functions/send-push/index.ts`

Thin HTTP wrapper around `_shared/apns.ts`, invoked only by the `nudges`
DB trigger above (`{ userId, title, body, data }` body,
`service_role`-JWT-authenticated, same `verify_jwt` default every other
function in this repo already uses).

### `complete-lesson/index.ts` (existing function, extended)

After computing `xp = curLp.xp + xpGain`, if `xpGain > 0`: query accepted
friends (same course) whose current `xp` falls in `(curLp.xp, xp]` --
those are exactly the friends this completion just passed. For each,
call `sendPushToUser` in-process (no extra HTTP hop, this function
already has an admin client) with the same copy the existing client-side
toast uses ("Someone passed you on the leaderboard!"). Best-effort,
`await`ed but never allowed to fail the response the client is waiting
on (wrapped so a push error can't turn a successful lesson completion
into a 500).

### iOS

- `ios/LearnWithAlphonso/Sources/AppDelegate.swift` (new) --
  `UIApplicationDelegate` posting `Foundation.NotificationCenter`
  notifications for `didRegisterForRemoteNotificationsWithDeviceToken`/
  `didFailToRegisterForRemoteNotificationsWithError`. A plain
  `UIApplicationDelegate`, not touching any existing local-notification
  code (`NotificationScheduler` stays exactly as-is -- confirms the V3
  kickoff doc's "verify by reading the file, don't assume" flag: the two
  systems are cleanly separable, this doesn't even touch that file).
- `ios/LearnWithAlphonso/Sources/RemotePushRegistrar.swift` (new) -- an
  `@Observable @MainActor` class (same shape as `NotificationScheduler`)
  wrapping `UIApplication.shared.registerForRemoteNotifications()` and
  holding the resulting hex token once the AppDelegate notification
  fires.
- `LearnWithAlphonsoKit/Sources/.../RemotePushLogic.swift` (new) -- the
  one pure, testable piece: `hexString(fromDeviceToken:)`. Everything
  else here is thin I/O wrapping (App-layer, untested by this repo's own
  established precedent, same as `NotificationScheduler` itself).
- `ProgressSyncClient` gains `registerDeviceToken(token:)` (PostgREST
  upsert, `on_conflict=user_id,token`) and `unregisterDeviceToken(token:)`
  -- same direct-PostgREST pattern as `sendNudge`/`markNudgesRead`, no
  Edge Function needed (own-row RLS is the whole trust boundary).
- **Permission**: reuses the *existing* priming moment
  (`LessonPlayerView.scheduleStreakReminderAfterCompletion`, first lesson
  completion) -- iOS has exactly one system notification-permission
  prompt for both local and remote notifications
  (`UNUserNotificationCenter.requestAuthorization`); this design doesn't
  add a second prompt, it just also calls
  `UIApplication.shared.registerForRemoteNotifications()` right after
  that existing call succeeds. `RootView`'s existing `.task` (where
  `triggerSync()`/`scheduleWeeklyRecap()` already run once
  `session.accessToken` is available) also calls
  `registrar.registerIfAuthorized()` on every launch/foreground --
  catches token refresh and the "already granted in a prior session"
  case without a second permission dialog. The token uploads via
  `registerDeviceToken` once both the hex token and `session.accessToken`
  are available.
- `LearnWithAlphonso.entitlements` (new, per-config: `Debug` gets
  `aps-environment: development`, `Release` gets
  `aps-environment: production`) wired via `project.yml`'s
  `CODE_SIGN_ENTITLEMENTS` -- mirrors the existing per-config
  `INFOPLIST_KEY_RCApiKey` split exactly.

## Left out of this slice (explicit scoping, not oversight)

- **Actual delivery / any real-device verification** -- the hard blocker
  above. Nothing here can be proven to deliver a push until a human
  creates the APNs Auth Key and enables the Push Notifications capability
  + App ID entry at developer.apple.com, and someone runs the one Vault
  `create_secret` call with the real service-role key.
- **Sign-out token cleanup** -- no call site yet calls
  `unregisterDeviceToken` on sign-out (the method exists; wiring it to
  `Session`'s sign-out path is a small, separate follow-up). A stale
  token past sign-out just keeps receiving pushes for whoever's still
  signed into that device until APNs itself reports it dead.
- **Cross-user token reassignment** on a shared device (see the
  `(user_id, token)` uniqueness note above) -- multiple accounts on one
  physical device each get their own row; no attempt to detect "this
  token used to belong to someone else."
- **Android** -- no Android app exists in this repo.
- **A settings toggle to mute push** -- `UNUserNotificationCenter`'s own
  system Settings deep link is the only control surface right now, same
  as the local-notification system's existing "no in-app mute UI" gap.

## Testing / verification performed

- Migration SQL reviewed by hand (no local Supabase/Postgres available to
  actually run it -- confirmed via `AGENTS.md`/no `supabase` CLI on
  `PATH`).
- `deno check` against the new/changed Edge Function TypeScript.
- `bun run typecheck` (repo-wide `tsc --noEmit` unaffected -- no web-side
  files touched by this slice).
- iOS: no local Xcode/macOS. Verification is a real `ios-app-build` CI
  run via a pull request (per this repo's established convention) --
  Simulator-only, `CODE_SIGNING_ALLOWED=NO`, doesn't touch
  `ios-release.yml`'s signing pipeline.
