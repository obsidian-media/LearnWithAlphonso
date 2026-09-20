import Foundation
import UserNotifications
import LearnWithAlphonsoKit

/// A pending local notification. `identifier` is stable per notification
/// *kind* (not per instance) -- "streak-reminder", "due-review-nudge" -- so
/// scheduling the same kind again cancels and replaces any still-pending
/// one, and callers never need to manage cancellation themselves.
struct ScheduledNotification {
    let identifier: String
    let title: String
    let body: String
    let fireDate: Date
}

/// Generic wrapper around UNUserNotificationCenter -- no consumer touches
/// the notification center directly, they just compute a
/// ScheduledNotification and call schedule(). Deliberately generic (not
/// hardcoded to the two notification kinds below) so future notification
/// kinds (e.g. a weekly leaderboard recap) can reuse this without
/// duplicating the UNUserNotificationCenter plumbing -- see
/// docs/v2-kickoffs/05-push-notifications-infrastructure.md.
@Observable
@MainActor
final class NotificationScheduler {
    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func currentAuthorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func schedule(_ notification: ScheduledNotification) {
        center.removePendingNotificationRequests(withIdentifiers: [notification.identifier])
        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.body
        content.sound = .default

        let comps = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: notification.fireDate
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request = UNNotificationRequest(identifier: notification.identifier, content: content, trigger: trigger)
        center.add(request)
    }

    func cancel(identifier: String) {
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
    }

    // MARK: - The two base notification kinds

    private static let streakReminderIdentifier = "streak-reminder"
    private static let dueReviewNudgeIdentifier = "due-review-nudge"
    private static let weeklyRecapIdentifier = "weekly-recap"

    /// Reschedules (or cancels, if the user already studied today) the daily
    /// streak reminder. Call on every app launch and every lesson
    /// completion -- see LessonPlayerView.finish().
    func scheduleStreakReminder(lastActiveDate: String?, now: Date = Date()) {
        guard let fireDate = nextStreakReminderDate(lastActiveDate: lastActiveDate, now: now) else {
            cancel(identifier: Self.streakReminderIdentifier)
            return
        }
        schedule(ScheduledNotification(
            identifier: Self.streakReminderIdentifier,
            title: "Keep your streak alive",
            body: "You haven't studied today yet -- a quick lesson keeps it going.",
            fireDate: fireDate
        ))
    }

    /// Reschedules (or cancels, if nothing's due) a due-review nudge. Call
    /// whenever ReviewQueueView fetches the due list, reusing that fetch --
    /// no second network round trip just for this.
    func scheduleDueReviewNudge(due: [ReviewItem], now: Date = Date()) {
        let count = dueReviewCount(from: due, today: utcDateString(now))
        guard count > 0 else {
            cancel(identifier: Self.dueReviewNudgeIdentifier)
            return
        }
        // Near-term: a few hours out, so it doesn't fire the instant the
        // queue loads while the app is foregrounded.
        let fireDate = Calendar.current.date(byAdding: .hour, value: 3, to: now) ?? now
        schedule(ScheduledNotification(
            identifier: Self.dueReviewNudgeIdentifier,
            title: "Reviews are waiting",
            body: count == 1 ? "1 item is due for review." : "\(count) items are due for review.",
            fireDate: fireDate
        ))
    }

    /// Reschedules the weekly leaderboard recap -- always fires on the
    /// next upcoming Monday morning (see `nextWeeklyRecapDate`, docs/
    /// v2-kickoffs/03-leaderboards.md's "Deepened feature 2"). Call on
    /// every app launch and right after the recap fires, so it's always
    /// pointing at the *next* occurrence -- there's no "cancel" case here
    /// (unlike the other two kinds) since a weekly recap is always wanted.
    func scheduleWeeklyRecap(now: Date = Date()) {
        let fireDate = nextWeeklyRecapDate(now: now)
        schedule(ScheduledNotification(
            identifier: Self.weeklyRecapIdentifier,
            title: "Your weekly recap is ready",
            body: "See how you did on the leaderboard last week.",
            fireDate: fireDate
        ))
    }
}
