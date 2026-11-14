import Foundation

/// How one badge is drawn: full colour, dimmed with a gold ring that fills, or a grey silhouette with a lock.
public enum BadgeState: Sendable, Hashable {
    case earned
    case progress(value: Int, threshold: Int)
    case locked

    /// The ring's fill, 0 to 1. Only an in-progress badge has one.
    public var fraction: Double? {
        if case let .progress(value, threshold) = self { return BadgePresentation.fraction(value: value, threshold: threshold) }
        return nil
    }
}

/// The state mapping behind the Achievements screen and its detail sheet. The views only draw what these return.
public enum BadgePresentation {
    /// The two top rungs carry crystal wings: the tier chip reads "Diamond prime" for them.
    static let primeIDs: Set<String> = ["streak_365", "xp_25000"]

    /// 0 to 1, clamped: a value past the threshold is a full ring, a value below zero is an empty one.
    public static func fraction(value: Int, threshold: Int) -> Double {
        guard threshold > 0 else { return 0 }
        return min(1, max(0, Double(value) / Double(threshold)))
    }

    /// The state of every badge in the catalog. A badge is earned when the server says so. Of the ones left in a
    /// family, only the next one up (the lowest threshold still unmet) shows progress, and only when the learner has
    /// started on that family; the rest stay locked. The team badge is granted by the server alone, so it never shows
    /// a ring. A family the stats do not cover (or a stat of 0) stays locked. When the unlock status could not be read
    /// (`unlockStatusKnown` false) nothing is known to be earned, so no badge is earned and none shows a ring: a ring on
    /// a badge that is really earned would read "3 of 3".
    public static func states(catalog: [Achievement], unlocked: Set<String>, stats: [String: Int], unlockStatusKnown: Bool = true) -> [String: BadgeState] {
        var result: [String: BadgeState] = [:]
        guard unlockStatusKnown else {
            for a in catalog { result[a.id] = .locked }
            return result
        }
        for a in catalog { result[a.id] = unlocked.contains(a.id) ? .earned : .locked }
        let families = Dictionary(grouping: catalog.filter { !unlocked.contains($0.id) && $0.category != "team" && $0.threshold > 0 },
                                  by: \.category)
        for (category, rest) in families {
            guard let next = rest.min(by: { $0.threshold < $1.threshold }), let value = stats[category], value > 0 else { continue }
            // A stat already past the threshold but not yet granted is a full ring, not a different state.
            result[next.id] = .progress(value: value, threshold: next.threshold)
        }
        return result
    }

    /// "12 of 30", with thousands separators ("1,240 of 2,000"), in the English the catalog is written in.
    public static func progressLine(value: Int, threshold: Int) -> String {
        "\(grouped(min(value, threshold))) of \(grouped(threshold))"
    }

    /// The whole-number percentage of the ring.
    public static func percent(value: Int, threshold: Int) -> Int {
        Int((fraction(value: value, threshold: threshold) * 100).rounded(.down))
    }

    /// The name of the medallion's image in the asset catalog.
    public static func artName(id: String) -> String { "Badge-\(id)" }

    /// The tier chip's text: Bronze, Silver, Gold, Diamond, and Diamond prime for the two winged rungs.
    public static func tierLabel(id: String, tier: String) -> String {
        if primeIDs.contains(id) { return "Diamond prime" }
        return tier.prefix(1).uppercased() + tier.dropFirst()
    }

    /// The family's name on the ladder: "Streak ladder".
    public static func familyName(_ category: String) -> String {
        switch category {
        case "streak": return "Streak"
        case "xp": return "XP"
        case "perfect": return "Perfect lessons"
        case "lessons": return "Lessons"
        case "league": return "League"
        case "freeze": return "Streak freeze"
        case "team": return "Team"
        default: return category.prefix(1).uppercased() + category.dropFirst()
        }
    }

    /// The badge's family from the lowest rung to the highest.
    public static func ladder(for achievement: Achievement, in catalog: [Achievement]) -> [Achievement] {
        catalog.filter { $0.category == achievement.category }.sorted { $0.threshold < $1.threshold }
    }

    /// "7 of 25 unlocked".
    public static func unlockedLine(unlocked: Int, total: Int) -> String { "\(unlocked) of \(total) unlocked" }

    /// The day a badge was unlocked, "Nov 9, 2026", from the server's timestamp (with or without fractional seconds).
    /// nil when the text is not a date, so the sheet shows "Unlocked" alone rather than a wrong day.
    public static func unlockedDate(_ iso: String, timeZone: TimeZone = .current) -> String? {
        let trimmed = iso.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        guard let date = parser.date(from: trimmed) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = timeZone
        out.dateFormat = "MMM d, yyyy"
        return out.string(from: date)
    }

    /// 1240 as "1,240".
    public static func grouped(_ n: Int) -> String {
        let digits = String(abs(n))
        var out = ""
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0, i % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return (n < 0 ? "-" : "") + String(out.reversed())
    }
}
