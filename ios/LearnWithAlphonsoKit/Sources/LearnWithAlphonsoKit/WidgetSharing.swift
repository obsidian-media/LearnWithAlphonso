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

    /// Removes the published snapshot, so the widget falls back to its "nothing published
    /// yet" state. Called on sign-out and account deletion (the app then reloads timelines).
    public static func clearSnapshot(in defaults: UserDefaults) {
        defaults.removeObject(forKey: streakSnapshotDefaultsKey)
    }
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
    /// The app's theme when this was written, as the stored raw value ("royal" or "meadow"; `DSPaletteID`). Nil
    /// in a snapshot written before the widget knew themes: it reads as Royal (`StreakWidgetLook.resolve`).
    public let theme: String?
    /// The learner's last active local day ("yyyy-MM-dd") when this was written, so `asOf` can end the streak on
    /// a day the app is not opened. Nil in a snapshot written before it was recorded.
    public let lastActiveDate: String?
    /// The learner's streak freezes when this was written, so `asOf` can tell a protected streak from a lapsed
    /// one (StreakDisplay). Nil in an older snapshot, which reads as no freezes.
    public let streakFreezes: Int?
    /// Missed days that the freezes cover: the widget shows the streak with a freeze mark. False in an older
    /// snapshot.
    public let isStreakProtected: Bool

    public init(
        streak: Int, longestStreak: Int, studiedToday: Bool, updatedAt: Date, theme: String? = nil,
        lastActiveDate: String? = nil, streakFreezes: Int? = nil, isStreakProtected: Bool = false
    ) {
        self.streak = streak
        self.longestStreak = longestStreak
        self.studiedToday = studiedToday
        self.updatedAt = updatedAt
        self.theme = theme
        self.lastActiveDate = lastActiveDate
        self.streakFreezes = streakFreezes
        self.isStreakProtected = isStreakProtected
    }

    /// Reads a snapshot written by any build: the theme key may be missing (old snapshots), and is then nil.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        streak = try c.decode(Int.self, forKey: .streak)
        longestStreak = try c.decode(Int.self, forKey: .longestStreak)
        studiedToday = try c.decode(Bool.self, forKey: .studiedToday)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        theme = try c.decodeIfPresent(String.self, forKey: .theme)
        lastActiveDate = try c.decodeIfPresent(String.self, forKey: .lastActiveDate)
        streakFreezes = try c.decodeIfPresent(Int.self, forKey: .streakFreezes)
        isStreakProtected = try c.decodeIfPresent(Bool.self, forKey: .isStreakProtected) ?? false
    }

    /// The same numbers under another theme: what the app writes when the learner changes theme.
    public func withTheme(_ theme: String?) -> StreakWidgetSnapshot {
        StreakWidgetSnapshot(
            streak: streak, longestStreak: longestStreak, studiedToday: studiedToday, updatedAt: updatedAt, theme: theme,
            lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, isStreakProtected: isStreakProtected)
    }

    /// This snapshot as it should read at `date`. "Studied today" was true for the learner's local day it was written
    /// on; read on a later day it is false. Without this the widget kept saying "Studied today" after midnight
    /// until the app was next opened. Likewise the streak (StreakDisplay): missed days the freezes cover read as
    /// protected, more than that read 0, instead of the old count until the app is next opened.
    public func asOf(_ date: Date, timeZone: TimeZone = .current) -> StreakWidgetSnapshot {
        let studied = studiedToday
            && localDateString(date, timeZone: timeZone) == localDateString(updatedAt, timeZone: timeZone)
        let shown = StreakDisplay.shown(
            streak: streak, lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, now: date, timeZone: timeZone)
        let isProtected = shown.state == .protected
        guard studied != studiedToday || shown.streak != streak || isProtected != isStreakProtected else { return self }
        return StreakWidgetSnapshot(
            streak: shown.streak, longestStreak: longestStreak, studiedToday: studied, updatedAt: updatedAt, theme: theme,
            lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, isStreakProtected: isProtected)
    }
}

/// The first instant of the next local day after `date`: when a widget showing "Studied today" must redraw.
public func nextLocalMidnight(after date: Date, timeZone: TimeZone = .current) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let startOfDay = calendar.startOfDay(for: date)
    return calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? date.addingTimeInterval(24 * 60 * 60)
}

/// Pure builder -- same "pure logic separated from I/O" split as
/// ProgressMath.swift/NotificationLogic.swift. Neither this function nor
/// StreakWidgetSnapshot above touches UserDefaults or WidgetKit; the app
/// target's WidgetProgressPublisher is the thin wrapper that calls this
/// and does the actual shared-container write + reload. `lastActiveDate`
/// is the learner's local calendar day, "yyyy-MM-dd" (localDateString,
/// NotificationLogic.swift), so "studied today" here always agrees with the
/// streak counter it's paired with.
public func makeStreakWidgetSnapshot(
    streak: Int,
    longestStreak: Int,
    lastActiveDate: String?,
    now: Date = Date(),
    timeZone: TimeZone = .current,
    theme: String? = nil,
    streakFreezes: Int? = nil
) -> StreakWidgetSnapshot {
    // The streak column keeps the old run after a missed day; the widget shows what it is now.
    let shown = StreakDisplay.shown(
        streak: streak, lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, now: now, timeZone: timeZone)
    return StreakWidgetSnapshot(
        streak: shown.streak,
        longestStreak: longestStreak,
        studiedToday: lastActiveDate == localDateString(now, timeZone: timeZone),
        updatedAt: now,
        theme: theme,
        lastActiveDate: lastActiveDate,
        streakFreezes: streakFreezes,
        isStreakProtected: shown.state == .protected
    )
}
