import Foundation

/// What the Profile identity hero, week strip and league card derive from the overview (src/lib/profile-overview.ts:
/// heroLevel, leagueStatus.pct, weekStrip). Pure, so the views never hold a number of their own.
extension ProfileMath {
    /// How far through this tier's XP span the learner is, 0 to 100; 100 at the top tier. Never outside that range.
    public static func leaguePct(tier: String, courseXP: Int) -> Int {
        let idx = LEAGUES.firstIndex(of: tier) ?? 0
        guard idx + 1 < LEAGUES.count else { return 100 }
        let floor = LEAGUE_THRESHOLDS[idx]
        let ceiling = LEAGUE_THRESHOLDS[idx + 1]
        let raw = Double(courseXP - floor) * 100 / Double(max(1, ceiling - floor))
        return min(100, max(0, Int(raw.rounded())))
    }

    /// The lessons still to finish at the learner's CEFR level. Alphonso has no numbered XP level, so the hero's ring
    /// and bar show this level's lesson progress and never state an "XP to next level" the app does not track.
    public static func lessonsLeft(_ p: LevelProgress) -> Int { max(0, p.total - p.done) }

    public struct StripDay: Sendable, Equatable {
        public let day: String
        public let state: RingState
        /// What VoiceOver says after the weekday.
        public let spoken: String
    }

    public struct WeekStrip: Sendable, Equatable {
        public let days: [StripDay]
        public let doneDays: Int
        /// True when the days are measured in learning minutes against the learner's goal; false for the XP rule.
        public let measuredInMinutes: Bool
        public let minutesSpoken: Int
    }

    /// The seven days of this week as the Overview strip shows them: against the learner's own daily goal in
    /// learning minutes when they chose one, otherwise by the XP rule the streak uses.
    public static func weekStrip(
        today: String, activity: [ProfileActivityDay], speech: [ProfileSpeechDay],
        learning: [ProfileLearningDay], goalMinutes: Int?
    ) -> WeekStrip {
        let week = weekRings(today: today, activity: activity, speech: speech)
        func word(_ s: RingState) -> String {
            switch s {
            case .future: return "still to come"
            case .today: return "not yet today"
            default: return "goal not met"
            }
        }
        if let goalMinutes, goalMinutes > 0 {
            let g = goalRings(today: today, learning: learning, goalMinutes: goalMinutes)
            let days = g.days.map {
                StripDay(day: $0.day, state: $0.state, spoken: $0.state == .done ? "\($0.minutes) min, goal met" : word($0.state))
            }
            return WeekStrip(days: days, doneDays: g.metDays, measuredInMinutes: true, minutesSpoken: week.minutesSpoken)
        }
        let days = week.days.map {
            StripDay(day: $0.day, state: $0.state, spoken: $0.state == .done ? "\($0.xp) XP" : word($0.state))
        }
        return WeekStrip(days: days, doneDays: days.filter { $0.state == .done }.count, measuredInMinutes: false, minutesSpoken: week.minutesSpoken)
    }

    /// The countries whose flag Profile draws (the Flags imageset group; scripts/generate-profile-flags.mjs). Any
    /// other country shows its two-letter code in a chip, never the flag emoji.
    public static let drawnFlags: Set<String> = [
        "AR", "AT", "BE", "BG", "CO", "DE", "EE", "ES", "FR", "GB", "HU", "ID",
        "IE", "IT", "LT", "LU", "MC", "NL", "PE", "PL", "RO", "RU", "UA", "US",
    ]

    /// The drawn flag's code for a country, or nil when there is no drawing (or no flag to show at all).
    public static func drawnFlagCode(country: String?) -> String? {
        guard let code = country?.uppercased(), drawnFlags.contains(code) else { return nil }
        return code
    }
}
