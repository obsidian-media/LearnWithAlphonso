# Support help chat (Miya)

Living reference for the in-app Help chat, the staff scopes behind it and the notices it sends. Verified 2026-11-22 against d8350542 (code) and the production database (read-only SELECT: `support_purge_old`, `support_queue_staff_reply` (the 30-minute window), `support_messages_notify`, `support_notify_queue`, `support_digest_seen`, `support_conversations.urgent` all exist; the two function bodies contain `12 months` and `30 minutes`). The build history is in `docs/superpowers/plans/2026-11-14-support-help-chat.md`; this file is what is true now.

## The persona

The AI helper is **Miya**, always labelled AI: "Miya (AI helper)" with an "AI" tag, and an opening line that says it is an AI helper that cannot change the account (`src/lib/support-copy.ts:21-22,36`). A person's reply is drawn as `<first name> · Support team`, or `Support team` with no usable first name, never as Miya, never a surname, email or id (`src/lib/support-notify.ts:82-87`). At launch `support_ai` is off, so Help is human-only (admin spec status row). 50 learner messages a day (`SUPPORT_DAILY_LIMIT`, `support-copy.ts:101`).

## Notices when a person replies (milestone 6)

Wording (`src/lib/support-notify.ts:98-111`; no message text, ever, because a lock screen is public and an email can be forwarded):

- Email subject: `You have a reply from <label>`. Body: "Open Learn With Alphonso and go to Help to read it." and "Replying to this email will not reach us."
- Push: title `<label>`, body `You have a reply in Help`, data `{type:"support"}`.
- Sender: `SUPPORT_NOTIFY_FROM`, default in `DEFAULT_SUPPORT_FROM` (`src/lib/support-notify.server.ts:85`, read at `:435`).
- Owner digest: subject `[Alphonso] 1 new support ticket` / `N new support tickets`, body points to the admin Support page, a count only (`support-notify.ts:114-125`). Goes to `REPORT_NOTIFY_TO`; empty means no digest (`support-notify.server.ts:239,434`).

Queueing (SQL `supabase/migrations/20261117100300_support_notifications.sql`, mirrored by constants in `support-notify.ts:13-24`, pinned together by `src/lib/support-notify-migration.test.ts`):

- Trigger `support_messages_notify` fires only for `author_kind = 'staff'` rows (`:112-115`). AI, learner and system lines never notify.
- One notice per burst: no new row while one for the conversation is waiting, or was delivered in the last 30 minutes (`:75-84`).
- The row is inserted first, then posted to `/api/internal/support-notify` via pg_net with the Vault `report_notify_secret`; any failure is a WARNING and leaves the row for the sweep (`:86-108`). The queue holds ids and times only.
- **30 per hour hold:** the route sends an email only if fewer than 30 went out in the last hour (`NOTIFY_EMAILS_PER_HOUR`, `support-notify.ts:20,74-76`; `support-notify.server.ts` "email held back: hourly cap reached"). The 30 is the project mail cap. A held email stays undelivered and the sweep retries it.
- **Retry and give-up:** the 15-minute sweep (`run_maintenance_sweep` then `maintenance.server.ts` calling `sweepSupport`) retries a row not delivered after 10 minutes and sets `gave_up_at` after 24 hours (`support-notify.ts:16,18,62-71`; `support-notify.server.ts:216-232`). A row is delivered only when both email and push are done; an account with no address skips the email; a deleted learner marks it delivered.
- **`support_digest_seen`:** the owner digest counts tickets with `status = 'new'` that have no row in `support_digest_seen`, and rows are written only after the email sends (a failed send retries next pass). Each hand-off is therefore counted once even if the learner writes again. At most one digest per 15 minutes, measured from the newest `seen_at` (`support-notify.server.ts:237-254,359-406`; `support-notify.ts:24,128-130`).
- **12-month retention:** `support_purge_old()` deletes `solved` conversations whose `solved_at` is more than 12 calendar months ago in UTC (`:121-139`); messages, notes, queue and digest rows follow by cascade. Unsolved or solved-without-time conversations are never purged. The append-only trigger on `support_messages` allows the delete only while `lwa.support_retention = 'on'`, set inside the function. The sweep calls it in its own exception block (`:163-167`). `staff_audit_log` keeps ids and status changes only and is not touched.

## Staff scopes (milestones 3 and 4 of the plan)

Scopes `support.read`, `support.reply`, `support.assign` (`src/lib/staff-scopes.ts:19-21`). Role `support` has all three plus `users.read`, `users.notes`, `user.block`, `reports.manage`; `support_ai` has none and is not a login; the owner has every scope (`:32-44,58-62`). Server gates in `src/lib/staff-support.functions.ts` via `requireStaff`:

| Action | Scope | Notes |
|---|---|---|
| list, open a ticket | `support.read` | `:100,149` |
| reply, add note, set status | `support.reply` | status change needs a reason (`:176,269,305`) |
| take a ticket, give back your own | `support.assign` | no reason (`:213,233-246`) |
| give to someone else, or take another person's | `support.assign` + `staff.manage` | reason required |
| hand to owner (sets `urgent`, moves to open) | `support.assign` | reason required, goes only upward (`:335`) |
| clear urgent | `staff.manage` | reason required (`:366`) |

The assignee must be active staff who may read support; the learner can never be assignee (SQL in `20261117100200` and `20261127110000_admin_support_screen.sql:143-150`). Console UI only hides what the scopes forbid (`TicketPane.tsx:227-230`); the server decides.

### Reason-in-SQL rule

Every staff write is one SECURITY DEFINER function with `search_path=''` that changes the ticket and writes its `staff_audit_log` row in the same transaction through `staff_record(...)`. The reason is checked in SQL, not only in TypeScript, so a caller that skips the console is still refused: `staff_support_set_status` needs 3 to 500 characters (`20261127110000:59-61`); `staff_support_assign` needs one unless the move is picking up an unassigned ticket or giving back your own (fixed words recorded); hand-to-owner and clear-urgent check the actor in SQL too. Reply and note use fixed reasons ("ticket reply", "ticket note"). Message and note text never go in the record. The console function wrapper trims and validates the same 3 to 500 rule (`staff-support.functions.ts:200-206`).

## Console Support screen (rebuilt in #683)

`admin/routes/support.tsx` (`ssr: false`; the old `/support/<id>` lands on `?t=<id>`) renders `src/components/console/support/SupportScreen.tsx` and `TicketPane.tsx`. It calls the existing server functions above, so each call still checks its own scope. Buttons follow the scopes: reply box and status actions need `support.reply` (`TicketPane.tsx:227,490,620-662`), take/give back need `support.assign` (`:542-557`), "hand to owner" shows to non-owners with `support.assign` (`:599`), and a reader sees "You can read tickets but not reply." (`:704`). Owners see urgent tickets first (`SupportScreen.tsx:239`; `staff_support_inbox`). The breach clock is the `support_breach_hours` setting (default 8, set through `staffSetSetting` with a reason).

## Link chips and native parity

An AI answer may carry one chip, an allow-listed id, never a URL: `subscription`, `ai-features`, `settings`, `league`, with text "Open the subscription screen", "Open AI features", "Open Settings", "Open your league" (`src/lib/support-links.ts:13-26`). The id is stored as a trailing `[[link:<id>]]` marker in the `ai` body and lifted to a `link` field; the marker counts for `ai` messages only, an unknown id gives no link, and the staff inbox strips it (`:34-60`). The Swift (`SupportLinks.swift`) and Kotlin (`SupportLinks.kt`) twins repeat ids, labels and the marker rule, and `src/lib/support-native-parity.test.ts` fails if copy, ids or chip text drift.

Per-host chip rules:

- iOS: opened from Settings, so "AI features" and "Settings" leave the chat back to Settings, "subscription" opens over Settings, and `league` returns no action so that chip is left out (the answer reads as text) (`SettingsView.swift:388-394`). Entry points from error screens open the chat with no chips. `X-Client: ios` sets channel `ios`.
- Android: entry is the Settings "Help" row, route `help`; subscription opens Hector, AI features and Settings pop back, league navigates to the league (`RootScreen.kt:425-436`).
- Push tap: iOS has a notification delegate; type `support` maps to Help (`NotificationTap.swift:16`, `AppDelegate.swift:44-52`, `SupportPushTap`), shown as a banner in the foreground. Android carries `type` in the intent and opens `help/reply`, whose back chip reads "Back" (`RootScreen.kt:438-451`, `AlphonsoMessagingService.kt:33`).

## Open or unverified

- (unverified: needs a device) neither platform's push tap, nor email and push delivery end to end, was run on a device; the plan lists the owner steps (`SUPPORT_NOTIFY_FROM` sender confirmed in Resend, "Customer Support" in the App Store and Play privacy forms).
