import Foundation

/// The streak as it should read right now. The `streak` column is only rewritten when the learner next studies,
/// so after a missed day it still holds the old run: the header and widget showed "12" to a learner whose
/// streak had already ended.
///
/// The rule (owner decision, 2026-11-18): `missedDays` is the number of local days strictly between the last
/// active day and today.
/// - 0 missed (studied today or yesterday): the streak as it is.
/// - 1 or more missed, and no more than the learner's streak freezes: shown as it is, with a "protected" mark.
/// - More missed days than freezes: the run is over, and the streak reads 0.
///
/// Note: the server (complete_lesson's streak step, 20261114100000_local_days.sql) bridges exactly ONE missed day
/// with one freeze and resets on two or more, whatever the freeze count. This display rule is the owner's; if the
/// server keeps its rule, a streak shown as protected across 2+ missed days resets on the next lesson.
public enum StreakDisplay {
    public enum State: Sendable, Equatable {
        case active
        /// Missed days that the learner's freezes cover.
        case protected
        /// Missed more days than freezes cover: the streak is gone.
        case lapsed
    }

    public struct Shown: Sendable, Equatable {
        public let streak: Int
        public let state: State
        public init(streak: Int, state: State) {
            self.streak = streak
            self.state = state
        }
    }

    /// Local days strictly between `lastActiveDate` ("yyyy-MM-dd") and today. 0 when it is today, yesterday or
    /// later; nil when the day cannot be read.
    public static func missedDays(lastActiveDate: String, now: Date, timeZone: TimeZone = .current) -> Int? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        guard let last = formatter.date(from: lastActiveDate),
              let gap = calendar.dateComponents([.day], from: calendar.startOfDay(for: last), to: calendar.startOfDay(for: now)).day
        else { return nil }
        return max(0, gap - 1)
    }

    public static func shown(
        streak: Int, lastActiveDate: String?, streakFreezes: Int?, now: Date, timeZone: TimeZone = .current
    ) -> Shown {
        guard streak > 0, let lastActiveDate,
              let missed = missedDays(lastActiveDate: lastActiveDate, now: now, timeZone: timeZone), missed > 0
        else { return Shown(streak: streak, state: .active) }
        if missed <= max(0, streakFreezes ?? 0) { return Shown(streak: streak, state: .protected) }
        return Shown(streak: 0, state: .lapsed)
    }

    public static func visibleStreak(
        streak: Int, lastActiveDate: String?, streakFreezes: Int?, now: Date, timeZone: TimeZone = .current
    ) -> Int {
        shown(streak: streak, lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, now: now, timeZone: timeZone).streak
    }

    /// The header pill's VoiceOver label.
    public static func accessibilityLabel(_ shown: Shown) -> String {
        if shown.state == .protected { return "\(shown.streak)-day streak, protected by a streak freeze" }
        return "Streak: \(shown.streak) day\(shown.streak == 1 ? "" : "s")"
    }

    /// The widget's line under the count while the streak is protected.
    public static let protectedCaption = "Protected by a streak freeze"
}
