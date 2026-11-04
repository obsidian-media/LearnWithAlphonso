import Foundation

/// Where the system notification permission stands, reduced to what the reminder card needs.
public enum ReminderPermission: Equatable, Sendable {
    case notDetermined, granted, denied
}

/// How often the learner has said "Not now" to the in-app reminder card, and when.
public struct ReminderPromptState: Equatable, Sendable {
    public var dismissals: Int
    public var lastDismissedAt: Date?

    public init(dismissals: Int = 0, lastDismissedAt: Date? = nil) {
        self.dismissals = dismissals
        self.lastDismissedAt = lastDismissedAt
    }
}

public enum ReminderPromptCopy {
    public static let title = "Keep your streak going"
    public static let body = "Want a reminder when your streak is about to end?"
    public static let accept = "Remind me"
    public static let decline = "Not now"
}

/// When to offer the reminder card on the lesson-complete screen. The system permission dialog is only ever
/// shown from this card's "Remind me" (iOS never asks twice, so a cold ask over the first celebration would
/// burn the one chance).
public enum ReminderPromptPolicy {
    public static let minCompletedLessons = 2
    public static let minDaysBetweenOffers = 3
    public static let maxDismissals = 2

    public static func shouldShowCard(completedLessons: Int, permission: ReminderPermission, state: ReminderPromptState, now: Date) -> Bool {
        guard permission == .notDetermined, completedLessons >= minCompletedLessons else { return false }
        guard state.dismissals < maxDismissals else { return false }
        guard let last = state.lastDismissedAt else { return true }
        return now.timeIntervalSince(last) >= TimeInterval(minDaysBetweenOffers) * 86_400
    }

    public static func afterNotNow(_ state: ReminderPromptState, now: Date) -> ReminderPromptState {
        ReminderPromptState(dismissals: state.dismissals + 1, lastDismissedAt: now)
    }
}

/// Local persistence for `ReminderPromptState`.
public struct ReminderPromptStore {
    private let defaults: UserDefaults
    static let countKey = "lwa.reminder-prompt.dismissals"
    static let dateKey = "lwa.reminder-prompt.lastDismissedAt"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> ReminderPromptState {
        let seconds = defaults.object(forKey: Self.dateKey) as? Double
        return ReminderPromptState(dismissals: defaults.integer(forKey: Self.countKey), lastDismissedAt: seconds.map { Date(timeIntervalSince1970: $0) })
    }

    public func recordNotNow(now: Date = Date()) {
        let next = ReminderPromptPolicy.afterNotNow(load(), now: now)
        defaults.set(next.dismissals, forKey: Self.countKey)
        defaults.set(next.lastDismissedAt?.timeIntervalSince1970, forKey: Self.dateKey)
    }
}
