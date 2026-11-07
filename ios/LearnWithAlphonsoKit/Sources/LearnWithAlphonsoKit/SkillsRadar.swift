import Foundation

/// The Skills radar's rules (visual round 6.1; src/lib/skills-radar.ts on the web). Pure: it takes the per-skill scores
/// from ProfileMath.skillScores and says what to draw. Nothing here invents a value: a skill with too few answers has
/// no vertex.
public enum SkillsRadar {
    public static let minSkillAnswers = 5
    /// How many skills must have enough answers before a shape is drawn; below that the page shows the empty state.
    public static let minSkillsForRadar = 3

    public static func label(_ skill: String) -> String {
        switch skill {
        case "listening": return "Listening"
        case "speaking": return "Speaking"
        case "vocabulary": return "Vocabulary"
        case "grammar": return "Grammar"
        case "reading": return "Reading"
        default: return skill.capitalized
        }
    }

    public struct Skill: Sendable, Equatable {
        public let skill: String
        public let label: String
        public let answered: Int
        /// 0-100, or nil while the skill has fewer than `minSkillAnswers` answers.
        public let pct: Int?
        /// Answers still needed before this skill is scored.
        public let needed: Int
    }

    public struct Model: Sendable, Equatable {
        public let ready: Bool
        public let skills: [Skill]
        public let scored: Int
        /// The lowest scored skill; nil unless `ready`.
        public let lowest: Skill?
    }

    public struct Point: Sendable, Equatable {
        public let x: Double
        public let y: Double
        public init(x: Double, y: Double) { self.x = x; self.y = y }
    }

    public static func radarModel(_ scores: [ProfileSkillScore]) -> Model {
        let skills = ProfileMath.skills.map { name -> Skill in
            let s = scores.first { $0.skill == name }
            let answered = s?.answered ?? 0
            let enough = answered >= minSkillAnswers && s?.pct != nil
            return Skill(
                skill: name, label: label(name), answered: answered,
                pct: enough ? s?.pct.map { min(100, max(0, $0)) } : nil, needed: max(0, minSkillAnswers - answered))
        }
        let scored = skills.filter { $0.pct != nil }
        if scored.count < minSkillsForRadar { return Model(ready: false, skills: skills, scored: scored.count, lowest: nil) }
        var lowest = scored[0]
        for s in scored.dropFirst() where (s.pct ?? 0) < (lowest.pct ?? 0) { lowest = s }
        return Model(ready: true, skills: skills, scored: scored.count, lowest: lowest)
    }

    /// The point on axis `i` of `n` at radius `r` around the centre (c, c); axis 0 points up. Rounded to 0.1 like the web.
    public static func radarPoint(_ i: Int, _ n: Int, _ r: Double, _ c: Double) -> Point {
        let a = -Double.pi / 2 + Double(i) * 2 * Double.pi / Double(n)
        let x = c + r * cos(a)
        let y = c + r * sin(a)
        return Point(x: (x * 10).rounded() / 10, y: (y * 10).rounded() / 10)
    }

    /// The filled shape: one vertex per scored skill, at its score's share of the radius. Unscored skills add none.
    public static func radarPolygon(_ skills: [Skill], radius: Double, c: Double) -> [Point] {
        var out: [Point] = []
        for (i, s) in skills.enumerated() {
            guard let pct = s.pct else { continue }
            out.append(radarPoint(i, skills.count, radius * Double(pct) / 100, c))
        }
        return out
    }
}

extension ProfileMath {
    public struct GoalRingDay: Sendable, Equatable {
        public let day: String
        public let minutes: Int
        public let goalMinutes: Int
        public let state: RingState
    }

    /// This week's rings against the learner's own daily goal in learning minutes (lesson + practice time). A day is
    /// done when its minutes reach the goal. The streak is NOT computed here: it keeps its XP rule.
    public static func goalRings(today: String, learning: [ProfileLearningDay], goalMinutes: Int) -> (days: [GoalRingDay], metDays: Int) {
        let monday = weekStart(today)
        let days = (0..<7).map { i -> GoalRingDay in
            let day = addDays(monday, i)
            let p = dailyGoalProgress(rows: learning, day: day, goalMinutes: goalMinutes)
            let state: RingState = day > today ? .future : (p.reached ? .done : (day == today ? .today : .missed))
            return GoalRingDay(day: day, minutes: day > today ? 0 : p.minutes, goalMinutes: goalMinutes, state: state)
        }
        return (days, days.filter { $0.state == .done }.count)
    }
}

extension ProfileMath {
    /// When the league week closes, in the learner's own zone ("ends Mon, Nov 9"). Display only: the week itself (and
    /// every streak day) stays on the UTC calendar; this formats the last moment of its Sunday UTC. A nil or unknown
    /// zone reads as UTC.
    public static func leagueWeekEnds(weekEnd: String, timeZone: String?) -> String {
        guard let end = ISO8601DateFormatter().date(from: "\(weekEnd)T23:59:59Z") else { return "ends \(weekEnd)" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = timeZone.flatMap { TimeZone(identifier: $0) } ?? TimeZone(identifier: "UTC")
        f.dateFormat = "EEE, MMM d"
        return "ends \(f.string(from: end))"
    }
}
