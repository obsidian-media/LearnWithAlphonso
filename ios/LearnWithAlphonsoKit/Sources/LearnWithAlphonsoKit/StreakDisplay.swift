import Foundation

/// The server's streak step, mirrored exactly: `computeStreakUpdate` (supabase/functions/complete-lesson/
/// progress-math.ts, and src/lib/progress-math.ts) and its SQL twin in 20261114100000_local_days.sql. Every
/// client-side streak number (the header, the widget, the profile, the optimistic value of a queued lesson) is
/// derived from this one function, so the app shows what the server will actually do.
///
/// `gap` is the number of calendar days from the last active day to today:
/// - 0: same day, no change. A last active day in the future counts as today (the server never moves it back).
/// - 1: the next day, +1.
/// - 2 with `bridgeUtcDay` (the account's day_basis is still "utc"): the one-time bridge from UTC days to local
///   days, +1, no freeze spent.
/// - 2 with a freeze: +1, one freeze spent.
/// - anything else: the run starts again at 1.
/// After that, a streak that grew to a multiple of 10 earns a freeze.
public enum StreakRule {
    public struct Outcome: Sendable, Equatable {
        public let streak: Int
        public let longestStreak: Int
        public let freezes: Int
        /// True when the run only continues because a freeze is spent.
        public let spentFreeze: Bool
    }

    public static func next(
        streak: Int, longestStreak: Int, lastActiveDate: String?, today: String, freezes: Int, dayBasis: String?
    ) -> Outcome {
        var next = streak
        var left = freezes
        var spent = false
        if let lastActiveDate, !lastActiveDate.isEmpty {
            let gap = dayGap(from: lastActiveDate, to: today) ?? Int.max
            if gap <= 0 {
                // Same day (or a skewed future day): no change.
            } else if gap == 1 || (gap == 2 && bridgesUtcDay(dayBasis)) {
                next = streak + 1
            } else if gap == 2 && left > 0 {
                next = streak + 1
                left -= 1
                spent = true
            } else {
                next = 1
            }
        } else {
            next = 1
        }
        if next > streak && next % 10 == 0 { left += 1 }
        return Outcome(streak: next, longestStreak: max(longestStreak, next), freezes: left, spentFreeze: spent)
    }

    /// `streakBridge` (supabase/functions/_shared/local-day.ts): anything but "local" still counts UTC days. A
    /// client that has not read the column yet (nil) agrees with the server's own default, "utc".
    public static func bridgesUtcDay(_ dayBasis: String?) -> Bool {
        dayBasis != "local"
    }

    /// Whole calendar days between two "yyyy-MM-dd" days (negative when `to` is earlier); nil when unreadable.
    public static func dayGap(from: String, to: String) -> Int? {
        guard let a = utcDay(from), let b = utcDay(to) else { return nil }
        return Int((b.timeIntervalSince(a) / 86_400).rounded())
    }

    private static func utcDay(_ day: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter.date(from: day)
    }
}

/// The streak as it should read right now. The `streak` column is only rewritten when the learner next studies,
/// so after missed days it still holds the old run: the header and widget showed "12" to a learner whose streak
/// had already ended. The answer is what the server would do with a lesson today (StreakRule):
/// - it continues the run without a freeze: the streak as it is (`active`);
/// - it continues the run only by spending a freeze: the streak, marked `protected`;
/// - it would restart the run: 0 (`lapsed`).
public enum StreakDisplay {
    public enum State: Sendable, Equatable {
        case active
        /// Alive only because the next lesson spends a streak freeze.
        case protected
        /// The next lesson starts a new run.
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

    /// `today` is the learner's local day, "yyyy-MM-dd" (localDateString).
    public static func shown(
        streak: Int, lastActiveDate: String?, streakFreezes: Int?, dayBasis: String?, today: String
    ) -> Shown {
        guard streak > 0, let lastActiveDate, !lastActiveDate.isEmpty else { return Shown(streak: max(0, streak), state: .active) }
        if (StreakRule.dayGap(from: lastActiveDate, to: today) ?? Int.max) <= 0 { return Shown(streak: streak, state: .active) }
        let outcome = StreakRule.next(
            streak: streak, longestStreak: streak, lastActiveDate: lastActiveDate, today: today,
            freezes: max(0, streakFreezes ?? 0), dayBasis: dayBasis)
        guard outcome.streak == streak + 1 else { return Shown(streak: 0, state: .lapsed) }
        return Shown(streak: streak, state: outcome.spentFreeze ? .protected : .active)
    }

    public static func shown(
        streak: Int, lastActiveDate: String?, streakFreezes: Int?, dayBasis: String?, now: Date,
        timeZone: TimeZone = .current
    ) -> Shown {
        shown(streak: streak, lastActiveDate: lastActiveDate, streakFreezes: streakFreezes, dayBasis: dayBasis,
              today: localDateString(now, timeZone: timeZone))
    }

    public static func shown(_ progress: LessonCompletionProgress, now: Date, timeZone: TimeZone = .current) -> Shown {
        shown(streak: progress.streak, lastActiveDate: progress.lastActiveDate, streakFreezes: progress.streakFreezes,
              dayBasis: progress.dayBasis, now: now, timeZone: timeZone)
    }

    /// The header pill's (and the profile tile's) VoiceOver label.
    public static func accessibilityLabel(_ shown: Shown) -> String {
        if shown.state == .protected { return "\(shown.streak)-day streak, protected by a streak freeze" }
        return "Streak: \(shown.streak) day\(shown.streak == 1 ? "" : "s")"
    }

    /// The widget's and the profile's line while the streak is protected.
    public static let protectedCaption = "Protected by a streak freeze"
}
