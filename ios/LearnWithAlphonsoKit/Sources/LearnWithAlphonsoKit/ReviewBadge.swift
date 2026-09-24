import Foundation

/// Presentation rule for the Learn tab's due-review badge.
///
/// Lives in the Kit rather than in the view so it is actually unit-tested:
/// the app target has no test coverage anywhere in this repo, only a
/// compile check (`xcodebuild`) in CI.
///
/// The count it formats comes from `SyncQueueStore.lastKnownDueReviews()`,
/// the offline cache, so the badge costs no network call -- the same
/// posture StatusHeaderView already takes. That cache is replaced wholesale
/// from the server's authoritative due list and pruned when an item is
/// graded offline, and because due dates only ever pass, a stale cache
/// under-reports rather than over-reports. The badge can miss reviews that
/// became due since the last fetch; it cannot invent ones that are not
/// waiting.
public enum ReviewBadge {
    /// Badge text, or nil when no badge should be shown at all.
    ///
    /// Zero returns nil rather than "0": a permanent dot on the Learn tab
    /// teaches people to ignore the badge, which costs the signal the
    /// badge exists to carry.
    public static func text(dueCount: Int) -> String? {
        guard dueCount > 0 else { return nil }
        return dueCount > 99 ? "99+" : String(dueCount)
    }
}
