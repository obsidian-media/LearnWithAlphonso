import Foundation

/// The learner's daily Hector allowance (BACKLOG 0.0-bq #5), read before Hector greets so a learner who has used it
/// up sees the "out for today" message instead of one more cached greeting.
///
/// There is no status endpoint: `consume_ai_quota` keeps one `ai_usage` row per user, day and kind, and the learner
/// may read their own rows. The day is the UTC date (the function keys on `current_date` on a UTC database), and the
/// call that would take the count past the limit is the one refused, so the allowance is used up once the count has
/// reached it. Fails open: a failed read leaves the greeting as before, because the server still refuses the turn.
///
/// Mirrored in src/lib/hector-allowance.ts and core/logic/HectorAllowance.kt; keep the three in step.
public enum HectorAllowance {
    /// Pro learners' Hector turns per day; the real cap is in consume_ai_quota (20261102120000).
    public static let dailyLimit = 150

    /// The words the server's own quota refusal shows (TutorError.quotaExceeded carries the same).
    public static let outForToday = "You've reached today's AI practice limit. Try again tomorrow."

    /// consume_ai_quota keys on the UTC date.
    public static func utcDay(_ now: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// True when any of today's counts has reached the limit; no row never locks the learner out.
    public static func isUsedUp(counts: [Int], limit: Int = dailyLimit) -> Bool {
        counts.contains { $0 >= limit }
    }
}
