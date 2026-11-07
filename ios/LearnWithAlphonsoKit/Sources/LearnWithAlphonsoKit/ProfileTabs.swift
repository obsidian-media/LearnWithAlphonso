import Foundation

/// Profile's three tabs (round 6.1, option A). Which section lives on which tab is data here, so the platforms
/// pin the same assignment (web src/lib/profile-tabs.ts, Android ProfileTabs) and a test proves no section was
/// dropped or duplicated when Profile was split.
public enum ProfileTab: String, CaseIterable, Sendable {
    case overview, progress, social

    public var label: String {
        switch self {
        case .overview: return "Overview"
        case .progress: return "Progress"
        case .social: return "Social"
        }
    }
}

public enum ProfileSectionID: String, CaseIterable, Sendable {
    case bigNumbers, thisWeek, hector, settings
    case skills, heatMap, records, level, weakSpots, achievements
    case league, friends, share
}

public enum ProfileTabs {
    public static let tabSections: [ProfileTab: [ProfileSectionID]] = [
        .overview: [.bigNumbers, .thisWeek, .hector, .settings],
        .progress: [.skills, .heatMap, .records, .level, .weakSpots, .achievements],
        .social: [.league, .friends, .share],
    ]

    /// Every section Profile had before the split (plus the skills slot), in the old single-column order.
    public static let allSections: [ProfileSectionID] = [
        .bigNumbers, .thisWeek, .heatMap, .records, .level, .weakSpots, .hector, .achievements,
        .league, .friends, .share, .settings, .skills,
    ]

    /// Step between tabs; clamps at the ends.
    public static func stepTab(_ current: ProfileTab, delta: Int) -> ProfileTab {
        let all = ProfileTab.allCases
        let i = all.firstIndex(of: current) ?? 0
        return all[min(all.count - 1, max(0, i + (delta > 0 ? 1 : -1)))]
    }

    public static func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

    private static func grouped(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    public static func heatSummary(activeDays: Int) -> String {
        "\(grouped(activeDays)) active \(plural(activeDays, "day", "days"))"
    }
    public static func recordsSummary(bestStreak: Int) -> String { "Best streak \(grouped(bestStreak))" }
    public static func weakSummary(total: Int) -> String { total == 0 ? "Nothing to review" : "\(total) to review" }
    public static func achievementsSummary(unlocked: Int, total: Int) -> String { "\(unlocked) of \(total)" }
}
