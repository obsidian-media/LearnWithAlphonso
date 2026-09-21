import Foundation

/// Constants + wire format shared between the app target and the
/// LearnWithAlphonsoWidget extension (WidgetKit home-screen streak widget,
/// V4 candidate #6). Living here rather than in the app target means both
/// targets (which already depend on this package) get the exact same
/// identifiers and Codable shape with zero duplication risk -- a typo'd
/// App Group id or widget kind string in only one of the two targets is
/// exactly the kind of silent-failure bug a shared constant avoids.
public enum WidgetSharing {
    /// The App Group both the app and the widget extension are entitled to
    /// (project.yml's `entitlements` block on both targets) -- the shared
    /// UserDefaults suite the app -> widget snapshot round-trips through.
    /// NOTE: an App Group with this identifier must be registered in the
    /// Apple Developer portal and added to both App IDs' capabilities
    /// before a *signed* (TestFlight/App Store) build can actually use it.
    /// A Simulator debug build (CODE_SIGNING_ALLOWED=NO, this repo's only
    /// CI-verified build path today -- see .github/workflows/ci.yml's
    /// ios-app-build job) doesn't enforce entitlements at all, so that
    /// registration step is a real prerequisite left for whoever signs the
    /// next release, not something buildable/verifiable from here.
    public static let appGroupID = "group.com.obsidianmedia.learnwithalphonso"

    /// Matches the `kind:` StreakWidget's StaticConfiguration is declared
    /// with (LearnWithAlphonsoWidget/StreakWidget.swift) -- WidgetProgressPublisher
    /// (app target) passes this same value to
    /// WidgetCenter.shared.reloadTimelines(ofKind:) after every progress
    /// update, so the two must never drift independently.
    public static let streakWidgetKind = "LearnWithAlphonsoStreakWidget"

    /// The UserDefaults(suiteName: appGroupID) key the snapshot is stored
    /// under.
    public static let streakSnapshotDefaultsKey = "streakWidgetSnapshot"
}

/// Read-only progress snapshot published for the home-screen streak
/// widget. Deliberately small and flattened (not the full
/// LessonCompletionProgress) -- the widget only ever needs enough to
/// render a streak count and "did you study today," not hearts/XP/league
/// data it has no UI for. One-directional by design: the app (via
/// WidgetProgressPublisher) is the only writer; StreakTimelineProvider
/// (widget extension) only ever reads this back, never writes to it.
public struct StreakWidgetSnapshot: Codable, Sendable, Equatable {
    public let streak: Int
    public let longestStreak: Int
    public let studiedToday: Bool
    public let updatedAt: Date

    public init(streak: Int, longestStreak: Int, studiedToday: Bool, updatedAt: Date) {
        self.streak = streak
        self.longestStreak = longestStreak
        self.studiedToday = studiedToday
        self.updatedAt = updatedAt
    }
}

/// Pure builder -- same "pure logic separated from I/O" split as
/// ProgressMath.swift/NotificationLogic.swift. Neither this function nor
/// StreakWidgetSnapshot above touches UserDefaults or WidgetKit; the app
/// target's WidgetProgressPublisher is the thin wrapper that calls this
/// and does the actual shared-container write + reload. `lastActiveDate`
/// follows the same UTC-anchored "yyyy-MM-dd" convention as
/// ProgressMath.swift's streak math (utcDateString, NotificationLogic.swift)
/// rather than the device's local calendar day, so "studied today" here
/// always agrees with the streak counter it's paired with.
public func makeStreakWidgetSnapshot(
    streak: Int,
    longestStreak: Int,
    lastActiveDate: String?,
    now: Date = Date()
) -> StreakWidgetSnapshot {
    StreakWidgetSnapshot(
        streak: streak,
        longestStreak: longestStreak,
        studiedToday: lastActiveDate == utcDateString(now),
        updatedAt: now
    )
}
