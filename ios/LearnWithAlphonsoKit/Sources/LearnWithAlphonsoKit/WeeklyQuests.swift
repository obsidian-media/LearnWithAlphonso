import Foundation

/// One weekly quest (the `weekly_quests` table, claimed through `claim_weekly_quest`) with this week's progress.
/// Not a weekly challenge: challenges pay themselves when `get_weekly_challenges` is read and have no claim.
public struct WeeklyQuest: Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let xpReward: Int
    public let progress: Int
    public let target: Int
    public let claimed: Bool

    public var claimable: Bool { progress >= target && !claimed }
}

/// The weekly_quests catalogue (supabase/migrations/20260920060000_v3_engagement_mechanics.sql), mirrored for display
/// like web's src/data/quests.ts. The database copy is the truth `claim_weekly_quest` checks.
public enum WeeklyQuests {
    public enum Metric: Sendable { case xpEarned, lessonsCompleted }

    public struct Def: Sendable, Equatable {
        public let id: String
        public let title: String
        public let metric: Metric
        public let target: Int
        public let xpReward: Int
    }

    public static let defs: [Def] = [
        Def(id: "weekly_xp_150", title: "Weekly Grinder", metric: .xpEarned, target: 150, xpReward: 30),
        Def(id: "weekly_xp_500", title: "XP Marathon", metric: .xpEarned, target: 500, xpReward: 100),
        Def(id: "weekly_lessons_5", title: "Lesson Streak", metric: .lessonsCompleted, target: 5, xpReward: 40),
    ]

    /// True for an id `claim_weekly_quest` knows. A weekly challenge template id (`lessons_5`) is not one.
    public static func isQuestID(_ id: String) -> Bool { defs.contains { $0.id == id } }

    /// This week's quests from the week's XP and lesson count (progress is computed from durable data, as on web).
    public static func build(xpThisWeek: Int, lessonsThisWeek: Int, claimedIDs: Set<String>) -> [WeeklyQuest] {
        defs.map { d in
            WeeklyQuest(
                id: d.id, title: d.title, xpReward: d.xpReward,
                progress: d.metric == .xpEarned ? xpThisWeek : lessonsThisWeek,
                target: d.target, claimed: claimedIDs.contains(d.id))
        }
    }

    /// What a refusal from `claim_weekly_quest` means to the learner; anything unknown gets the generic line.
    public static func claimMessage(reason: String?) -> String {
        switch reason {
        case "not-yet-completed": return "Not finished yet. Keep going!"
        case "already-claimed": return "You already claimed this one."
        case "invalid-week": return "This week just ended. Pull to refresh for the new quests."
        case "no-course-progress": return "Complete a lesson in this course first."
        default: return "Couldn't claim that reward. Try again."
        }
    }

    private static var utcCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    private static func formatter() -> DateFormatter {
        let f = DateFormatter()
        f.calendar = utcCalendar
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    /// The Monday (UTC) that starts the week holding `now`, as `YYYY-MM-DD` -- the week the RPC accepts.
    public static func weekStart(now: Date = Date()) -> String {
        let cal = utcCalendar
        let weekday = cal.component(.weekday, from: now) // 1 = Sunday
        let monday = cal.date(byAdding: .day, value: -((weekday + 5) % 7), to: now)!
        return formatter().string(from: monday)
    }

    /// `weekStart` plus seven days, the exclusive end of the week.
    static func weekEnd(weekStart: String) -> String {
        let f = formatter()
        guard let start = f.date(from: weekStart), let end = utcCalendar.date(byAdding: .day, value: 7, to: start) else {
            return weekStart
        }
        return f.string(from: end)
    }
}
