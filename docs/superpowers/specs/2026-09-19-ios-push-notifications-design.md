# Design: iOS Push Notifications

> Written 2026-09-19. V2, parallel-safe at the code level, but has a real
> non-code prerequisite (APNs setup) that blocks testing on a device —
> see "Prerequisites" before starting implementation.

## Goal

Two notification types, matching the original design doc's V3 wishlist
pulled forward: a streak-reminder (fires once daily if the user hasn't
completed a lesson yet) and a due-review nudge (fires when items become
due). **V2 scope is local, scheduled notifications — not a server-push
system.** Both of these are things the *device itself* can compute and
schedule without a server round trip (a streak reminder just needs "did
I already study today," a due-review nudge just needs "is anything due
today"), so `UNUserNotificationCenter`'s local scheduling API is
sufficient — no APNs server infrastructure, no push token storage, no
new Edge Function.

## Prerequisites (not code)

- `NSUserNotificationsUsageDescription`... actually iOS doesn't require
  an Info.plist usage string for notifications (unlike camera/mic) — the
  system permission *prompt* is triggered by
  `UNUserNotificationCenter.requestAuthorization`, no Info.plist entry
  needed. No blocker here.
- **Push Notifications capability**: even for *local* notifications, add
  it as a capability isn't strictly required either (that's only for
  remote/APNs push) — confirm this against Apple's current docs before
  assuming, since this project has been burned before by assuming
  Apple platform behavior instead of checking (see the
  `UISupportedInterfaceOrientations` upload-validation surprise in
  `ARCHITECTURE.md`'s "Known rough edges").
- This is genuinely testable in the iOS Simulator (local notifications
  work in Simulator) — unlike Hector/mic features, this doesn't need a
  physical device to verify the core scheduling logic, though the actual
  banner/sound delivery is worth a real-device check before considering
  it done.

## Components (Swift)

- **Kit**: a pure function `nextStreakReminderDate(lastActiveDate:
  String?, now: Date) -> Date?` and `dueReviewCount(from: [ReviewItem],
  today: String) -> Int` — testable without touching
  `UNUserNotificationCenter` at all, same "pure logic separated from I/O"
  pattern as `SRSEngine`/`ProgressMath`. The actual scheduling call is a
  thin, untested (by precedent — no SwiftUI view has a test target
  either) wrapper around these.
- **App**: `NotificationScheduler.swift` — wraps
  `UNUserNotificationCenter.current()`:
  - `requestAuthorization() async -> Bool`
  - `scheduleStreakReminder(at: Date)` — cancels any existing pending
    request with the same identifier first (`removePendingNotificationRequests`),
    then schedules a new one. Re-run this scheduling on every app launch
    and every lesson completion (so completing today's lesson cancels
    today's reminder).
  - `scheduleDueReviewNudge(dueCount: Int)` — similar, driven by
    `ReviewQueueView`'s existing `fetchDueReviews` call (reuse that data,
    don't add a second fetch just for this).
  - Call `requestAuthorization` once, from a natural moment (not app
    launch cold-open — that's a bad first impression; the web app has no
    precedent for this since it's push-notification-free, so use
    judgment: after the user's first lesson completion is a reasonable
    "they're engaged, ask now" moment).

## Data flow

1. On `LessonPlayerView.finish()` success and on `ReviewQueueView`'s
   queue-load, recompute and reschedule both notification types.
2. No new backend calls, no new tables, no new Edge Function.

## Error handling

- Permission denied: don't nag: check
  `UNUserNotificationCenter.current().notificationSettings().authorizationStatus`
  before attempting to schedule anything, and don't re-prompt
  automatically if the user said no once (only via a Settings deep link
  the user explicitly taps, if a settings UI for this gets built later —
  not required for this initial slice).

## Testing

- Kit: XCTest for `nextStreakReminderDate`/`dueReviewCount`, fixed-date
  cases the same way `SRSEngineTests` injects `today`/`addDays` instead
  of reading the system clock.
- App: `ios-app-build` CI compile is the verification for
  `NotificationScheduler.swift` and any UI (a permission-prompt trigger
  point, not a full screen).

## Rollout

No backend changes. No migration. Ships once CI is green, same as every
other iOS slice this session.
