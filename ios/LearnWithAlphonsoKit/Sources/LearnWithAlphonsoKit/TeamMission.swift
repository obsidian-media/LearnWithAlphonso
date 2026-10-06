import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A team's weekly shared mission (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1).
/// The server computes everything in `get_team_mission()`; this only decodes its row and owns the wording,
/// which is word-for-word the web card's (src/lib/team-mission.ts) and pinned by the shared fixtures
/// (Tests/.../Fixtures/team-mission.fixtures.json, a byte-for-byte copy guarded on the web side).
public enum TeamMissionStatus: String, Sendable, Equatable {
    case needsMembers = "needs_members"
    case inProgress = "in_progress"
    case complete

    /// A status from a newer server that this build does not know is shown as in progress, never a crash.
    init(serverValue: String) {
        self = TeamMissionStatus(rawValue: serverValue) ?? .inProgress
    }
}

public struct TeamMission: Sendable, Equatable {
    public let teamID: String
    public let weekStart: String
    public let weekEnd: String
    public let target: Int
    public let total: Int
    public let myCount: Int
    public let memberCount: Int
    public let status: TeamMissionStatus
    public let rewardXP: Int
    public let rewarded: Bool
    public let daysLeft: Int
    public let percent: Int
    public let headline: String
    public let footer: String

    private static let dayInSeconds: Double = 86_400

    /// Decodes one `get_team_mission` row; nil when a field is missing or mistyped so the caller can tell
    /// "the server broke its contract" from "this learner has no team" (an empty result).
    public init?(row: [String: Any], now: Date) {
        guard let teamID = row["team_id"] as? String,
              let weekStart = row["week_start"] as? String,
              let weekEnd = row["week_end"] as? String,
              let weekEndDate = Self.utcMidnight(weekEnd),
              let target = row["target"] as? Int,
              let total = row["total"] as? Int,
              let myCount = row["my_count"] as? Int,
              let memberCount = row["member_count"] as? Int,
              let rewardXP = row["reward_xp"] as? Int,
              let rewarded = row["rewarded"] as? Bool else { return nil }

        let status = TeamMissionStatus(serverValue: (row["status"] as? String) ?? "")
        let daysLeft = max(0, Int(((weekEndDate.timeIntervalSince(now)) / Self.dayInSeconds).rounded(.up)))
        let percent: Int
        if status == .complete {
            percent = 100
        } else if target > 0 {
            percent = min(100, Int((Double(total) / Double(target) * 100).rounded(.down)))
        } else {
            percent = 0
        }
        let timeLeft = daysLeft == 1 ? "Last day" : "\(daysLeft) days left"

        let headline: String
        let footer: String
        switch status {
        case .needsMembers:
            headline = "Invite a friend to start your team's weekly mission"
            footer = ""
        case .complete:
            headline = "Mission complete!"
            footer = "+\(rewardXP) XP for everyone who joined in"
        case .inProgress:
            headline = "\(total) of \(target) lessons done"
            footer = "You added \(myCount) \u{00B7} \(timeLeft)"
        }

        self.teamID = teamID
        self.weekStart = weekStart
        self.weekEnd = weekEnd
        self.target = target
        self.total = total
        self.myCount = myCount
        self.memberCount = memberCount
        self.status = status
        self.rewardXP = rewardXP
        self.rewarded = rewarded
        self.daysLeft = daysLeft
        self.percent = percent
        self.headline = headline
        self.footer = footer
    }

    /// `yyyy-MM-dd` as midnight UTC (the server's week is a UTC week), or nil when it is not a real date.
    private static func utcMidnight(_ string: String) -> Date? {
        let parts = string.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = calendar.date(from: components),
              calendar.dateComponents([.year, .month, .day], from: date) == components else { return nil }
        return date
    }
}
