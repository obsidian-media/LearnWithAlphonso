import Foundation

/// The wording of the learning-goal card. Kept in the Kit (not the SwiftUI layer) so it is tested on
/// any machine, and word-for-word the same as the web card (src/components/GoalCard.tsx): change
/// both together. "Day" here is always a UTC day, like the rest of the app.
public enum GoalCopy {
    public static let estimateNote = "An estimate of lessons, not of fluency."

    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    /// "2026-11-10" -> "10 Nov 2026". A fixed English table (not the system locale) so it matches the
    /// web card exactly; anything that is not a real date comes back unchanged.
    public static func formatDate(_ iso: String) -> String {
        let parts = iso.split(separator: "-").map(String.init)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month),
              let date = utc.date(from: DateComponents(year: year, month: month, day: day)),
              utc.component(.day, from: date) == day
        else { return iso }
        return "\(day) \(months[month - 1]) \(year)"
    }

    /// What to say when the goal could not be loaded. "Showing your last saved plan" is only true when
    /// there IS one: offline with nothing cached must not promise a plan (reviewer finding).
    public static func loadFailureMessage(_ error: LearningGoalError, hadCachedPlan: Bool) -> String {
        if error == .offline, !hadCachedPlan { return "You're offline. Connect to load your goal." }
        return error.userMessage
    }

    public static func headline(for goal: StoredGoal) -> String {
        "Finish \(goal.targetLevel) by \(formatDate(goal.targetDate))"
    }

    public static func progress(for plan: GoalPlan) -> String {
        "\(plan.lessonsInScope - plan.lessonsRemaining) of \(plan.lessonsInScope) lessons done"
    }

    public static func statusLine(for status: GoalStatus) -> String {
        switch status {
        case .done: return "Goal reached."
        case .expired: return "The date has passed. Pick a new date to keep going."
        case .justStarted: return "Just started. Check back next week."
        case .ahead: return "Ahead of plan."
        case .onTrack: return "On track."
        case .behind: return "Behind plan."
        case .unknown: return "Keep going."
        }
    }

    /// nil once the goal is reached or its date has passed: a weekly number would mean nothing.
    public static func weeklyLine(for plan: GoalPlan) -> String? {
        guard plan.status != .done, plan.status != .expired else { return nil }
        return "\(plan.requiredPerWeek) lessons a week to finish on time; \(plan.lessonsDoneLast7Days) in the last 7 days."
    }

    /// The two lines shown under the date picker while setting a goal.
    public static func previewLines(for plan: GoalPlan) -> (perWeek: String, left: String) {
        ("\(plan.requiredPerWeek) lessons a week", "\(plan.lessonsRemaining) lessons left to finish \(plan.targetLevel).")
    }

    /// Shown whenever the server sent a suggested date (it only does when behind, expired, or
    /// unrealistic, and only when there is a recent pace to extrapolate from).
    public static func suggestionLine(for plan: GoalPlan) -> String? {
        guard let date = plan.suggestedDate else { return nil }
        return "At your recent pace, \(formatDate(date)) is realistic."
    }

    public static func realismLine(for plan: GoalPlan) -> String? {
        switch plan.realism {
        case .ok, .unknown: return nil
        case .ambitious: return "Ambitious: about two lessons a day or more."
        case .unrealistic: return "Unrealistic for most learners at this date."
        }
    }

    /// `months` ahead as "YYYY-MM-DD", clamped to the end of a shorter month (31 Aug + 6 months is
    /// 28 Feb, not 3 Mar).
    public static func monthsFromToday(_ months: Int, now: Date = Date()) -> String {
        isoDay(utc.date(byAdding: .month, value: months, to: now) ?? now)
    }

    public static func tomorrow(now: Date = Date()) -> String {
        isoDay(utc.date(byAdding: .day, value: 1, to: now) ?? now)
    }

    /// The UTC calendar day of `date` as "YYYY-MM-DD" (what the server expects for a target date).
    public static func day(from date: Date) -> String {
        isoDay(date)
    }

    /// Noon UTC on "YYYY-MM-DD", or nil when it is not a real date. Noon, not midnight, so a date
    /// picker in any time zone shows the same calendar day.
    public static func date(fromDay day: String) -> Date? {
        let parts = day.split(separator: "-").map(String.init)
        guard parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              let date = utc.date(from: DateComponents(year: y, month: m, day: d, hour: 12)),
              utc.component(.day, from: date) == d, utc.component(.month, from: date) == m
        else { return nil }
        return date
    }

    private static func isoDay(_ date: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
}
