import Foundation

/// The Profile screen's rules (visual round 6, part 4; src/lib/profile-overview.ts on the web). The rows are read in one
/// batch (ProgressSyncClient+ProfileOverview.swift); everything the screen shows is derived here, so no number is typed
/// into a view.
///
/// The day: the streak, activity_days and speech_days book a day as the UTC date of the server clock. The heat map,
/// the week rings and the streak use that same day, so they can never disagree about which day a lesson counted for.

public struct ProfileActivityDay: Sendable, Equatable {
    public let day: String
    public let xp: Int
    public init(day: String, xp: Int) { self.day = day; self.xp = xp }
}

public struct ProfileSpeechDay: Sendable, Equatable {
    public let day: String
    public let seconds: Int
    public init(day: String, seconds: Int) { self.day = day; self.seconds = seconds }
}

public struct ProfileCompletion: Sendable, Equatable {
    public let lessonID: String
    public let language: String
    public let correct: Int
    public let total: Int
    public init(lessonID: String, language: String, correct: Int, total: Int) {
        self.lessonID = lessonID; self.language = language; self.correct = correct; self.total = total
    }
}

public struct ProfileWeakItem: Sendable, Equatable {
    public let label: String
    public let display: String
    public let lapses: Int
    public let repetitions: Int
    public init(label: String, display: String, lapses: Int, repetitions: Int) {
        self.label = label; self.display = display; self.lapses = lapses; self.repetitions = repetitions
    }
}

public struct ProfileWeaknessEvent: Sendable, Equatable {
    public let category: String
    public let eventType: String
    public let createdAt: String
    public init(category: String, eventType: String, createdAt: String) {
        self.category = category; self.eventType = eventType; self.createdAt = createdAt
    }
}

public struct ProfileCourseProgress: Sendable, Equatable {
    public let course: String
    public let xp: Int
    public let cefrLevel: String
    public let leagueTier: String
    public init(course: String, xp: Int, cefrLevel: String, leagueTier: String) {
        self.course = course; self.xp = xp; self.cefrLevel = cefrLevel; self.leagueTier = leagueTier
    }
}

public struct ProfileAchievementRow: Sendable, Equatable {
    public let id: String
    public let progress: Int
    public let unlockedAt: String?
    public init(id: String, progress: Int, unlockedAt: String?) {
        self.id = id; self.progress = progress; self.unlockedAt = unlockedAt
    }
}

/// What the one batched read returns.
public struct ProfileOverviewData: Sendable, Equatable {
    public var today: String
    public var course: String
    public var displayName: String?
    public var avatarSeed: String?
    /// Set only while the learner's flag is on.
    public var country: String?
    public var courses: [ProfileCourseProgress]
    public var streak: Int
    public var longestStreak: Int
    public var streakFreezes: Int
    public var completions: [ProfileCompletion]
    public var activity: [ProfileActivityDay]
    public var bestDayXP: Int
    public var speech: [ProfileSpeechDay]
    public var weakItems: [ProfileWeakItem]
    public var savedWords: Int
    public var weaknessEvents: [ProfileWeaknessEvent]
    public var achievements: [ProfileAchievementRow]
    public var friends: [FriendProgress]

    public init(
        today: String, course: String, displayName: String? = nil, avatarSeed: String? = nil, country: String? = nil,
        courses: [ProfileCourseProgress] = [], streak: Int = 0, longestStreak: Int = 0, streakFreezes: Int = 0,
        completions: [ProfileCompletion] = [], activity: [ProfileActivityDay] = [], bestDayXP: Int = 0,
        speech: [ProfileSpeechDay] = [], weakItems: [ProfileWeakItem] = [], savedWords: Int = 0,
        weaknessEvents: [ProfileWeaknessEvent] = [], achievements: [ProfileAchievementRow] = [],
        friends: [FriendProgress] = []
    ) {
        self.today = today; self.course = course; self.displayName = displayName; self.avatarSeed = avatarSeed
        self.country = country; self.courses = courses; self.streak = streak; self.longestStreak = longestStreak
        self.streakFreezes = streakFreezes; self.completions = completions; self.activity = activity
        self.bestDayXP = bestDayXP; self.speech = speech; self.weakItems = weakItems; self.savedWords = savedWords
        self.weaknessEvents = weaknessEvents; self.achievements = achievements; self.friends = friends
    }
}

public enum ProfileMath {
    // MARK: Days (UTC)

    private static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static func date(_ day: String) -> Date? {
        let p = day.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return utc.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    private static func string(_ d: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public static func addDays(_ day: String, _ n: Int) -> String {
        guard let d = date(day), let r = utc.date(byAdding: .day, value: n, to: d) else { return day }
        return string(r)
    }

    /// Today as the streak counts it: the UTC calendar date.
    public static func streakToday(now: Date = Date()) -> String { string(now) }

    /// Monday of the week holding `day`.
    public static func weekStart(_ day: String) -> String {
        guard let d = date(day) else { return day }
        let weekday = utc.component(.weekday, from: d) // 1 = Sunday
        return addDays(day, -((weekday + 5) % 7))
    }

    /// The heat map's span, in calendar months.
    public static let heatMapMonths = 3
    /// The friends board's week: the last 7 days including today.
    public static let friendsWeekDays = 7

    /// Exactly `heatMapMonths` calendar months ending today: the day after the same date 3 months ago (clamped).
    public static func threeMonthsWindow(today: String) -> (start: String, end: String) {
        guard let t = date(today) else { return (today, today) }
        let c = utc.dateComponents([.year, .month, .day], from: t)
        let first = utc.date(from: DateComponents(year: c.year, month: c.month! - heatMapMonths, day: 1))!
        let lastDay = utc.range(of: .day, in: .month, for: first)!.count
        let back = utc.date(from: DateComponents(
            year: utc.component(.year, from: first), month: utc.component(.month, from: first),
            day: min(c.day!, lastDay)))!
        return (addDays(string(back), 1), today)
    }

    // MARK: Heat map

    public struct HeatCell: Sendable, Equatable {
        public let day: String
        public let xp: Int
        public let level: Int
        public let inRange: Bool
    }

    public struct HeatMap: Sendable, Equatable {
        public let weeks: [[HeatCell]]
        public let activeDays: Int
        public let start: String
        public let end: String
    }

    /// Monday-first week columns over the 3-month window. Level is the day's XP against the learner's best day in it.
    public static func heatMap(today: String, rows: [ProfileActivityDay]) -> HeatMap {
        let (start, end) = threeMonthsWindow(today: today)
        var xpByDay: [String: Int] = [:]
        for r in rows where r.day >= start && r.day <= end { xpByDay[r.day, default: 0] += r.xp }
        let maxXP = xpByDay.values.max() ?? 0
        var weeks: [[HeatCell]] = []
        var w = weekStart(start)
        while w <= end {
            weeks.append((0..<7).map { i in
                let day = addDays(w, i)
                let inRange = day >= start && day <= end
                let xp = inRange ? (xpByDay[day] ?? 0) : 0
                let level = (xp > 0 && maxXP > 0) ? min(4, max(1, Int((Double(4 * xp) / Double(maxXP)).rounded(.up)))) : 0
                return HeatCell(day: day, xp: xp, level: level, inRange: inRange)
            })
            w = addDays(w, 7)
        }
        return HeatMap(weeks: weeks, activeDays: xpByDay.values.filter { $0 > 0 }.count, start: start, end: end)
    }

    // MARK: Week rings

    public enum RingState: Sendable, Equatable { case done, missed, today, future }

    public struct RingDay: Sendable, Equatable {
        public let day: String
        public let xp: Int
        public let seconds: Int
        public let state: RingState
    }

    public struct Week: Sendable, Equatable {
        public let days: [RingDay]
        public let activeDays: Int
        public let minutesSpoken: Int
    }

    /// This week, Monday to Sunday. A day is done when it earned XP: the rule that keeps the streak alive.
    public static func weekRings(today: String, activity: [ProfileActivityDay], speech: [ProfileSpeechDay]) -> Week {
        let monday = weekStart(today)
        var xp: [String: Int] = [:]
        for r in activity { xp[r.day, default: 0] += r.xp }
        var spoken: [String: Int] = [:]
        for r in speech { spoken[r.day, default: 0] += r.seconds }
        let days = (0..<7).map { i -> RingDay in
            let day = addDays(monday, i)
            let dayXP = xp[day] ?? 0
            let state: RingState = day > today ? .future : (dayXP > 0 ? .done : (day == today ? .today : .missed))
            return RingDay(day: day, xp: dayXP, seconds: day > today ? 0 : (spoken[day] ?? 0), state: state)
        }
        let seconds = days.reduce(0) { $0 + $1.seconds }
        return Week(
            days: days, activeDays: days.filter { $0.xp > 0 }.count,
            minutesSpoken: Int((Double(seconds) / 60).rounded()))
    }

    // MARK: Big numbers

    public struct BigNumbers: Sendable, Equatable {
        public let streak: Int
        public let longestStreak: Int
        public let courseXP: Int
        public let xpThisWeek: Int
        public let wordsLearned: Int
        public let savedWords: Int
        public let lessonsDone: Int
        public let accuracyPct: Int?
    }

    /// `vocabTerms` maps a finished lesson id to the words it teaches (the app's content), so this stays pure.
    public static func bigNumbers(_ o: ProfileOverviewData, vocabTerms: (String) -> [String]) -> BigNumbers {
        let mine = o.completions.filter { $0.language == o.course }
        let correct = mine.reduce(0) { $0 + $1.correct }
        let total = mine.reduce(0) { $0 + $1.total }
        let words = Set(mine.flatMap { vocabTerms($0.lessonID) }.map { $0.lowercased() })
        let monday = weekStart(o.today)
        return BigNumbers(
            streak: o.streak,
            longestStreak: o.longestStreak,
            courseXP: o.courses.first { $0.course == o.course }?.xp ?? 0,
            xpThisWeek: o.activity.filter { $0.day >= monday && $0.day <= o.today }.reduce(0) { $0 + $1.xp },
            wordsLearned: words.count,
            savedWords: o.savedWords,
            lessonsDone: mine.count,
            accuracyPct: total > 0 ? Int((100 * Double(correct) / Double(total)).rounded()) : nil)
    }

    public struct Records: Sendable, Equatable {
        public let bestDayXP: Int
        public let bestStreak: Int
        public let perfectLessons: Int
    }

    public static func personalRecords(_ o: ProfileOverviewData) -> Records {
        Records(
            bestDayXP: o.bestDayXP, bestStreak: o.longestStreak,
            perfectLessons: o.completions.filter { $0.total > 0 && $0.correct == $0.total }.count)
    }

    // MARK: Level

    public struct LevelProgress: Sendable, Equatable {
        public let level: String
        public let next: String?
        public let done: Int
        public let total: Int
        public let pct: Int
        public let unitsLeft: Int
    }

    public static let levelOrder = ["A1", "A2", "B1", "B2", "C1", "C2"]

    /// `units` is each unit's lesson ids for the learner's level in this course.
    public static func levelProgress(cefr: String, units: [[String]], completed: Set<String>) -> LevelProgress {
        let level = levelOrder.contains(cefr) ? cefr : "A1"
        let lessons = units.flatMap { $0 }
        let finished = lessons.filter { completed.contains($0) }.count
        let idx = levelOrder.firstIndex(of: level)!
        return LevelProgress(
            level: level, next: idx + 1 < levelOrder.count ? levelOrder[idx + 1] : nil,
            done: finished, total: lessons.count,
            pct: lessons.isEmpty ? 0 : Int((100 * Double(finished) / Double(lessons.count)).rounded()),
            unitsLeft: units.filter { !$0.allSatisfy(completed.contains) }.count)
    }

    // MARK: Weak spots and Hector

    /// The weak spots to fix first: the most-missed, then the least-practiced.
    public static func weakSpots(_ items: [ProfileWeakItem], n: Int = 3) -> (top: [ProfileWeakItem], total: Int) {
        let sorted = items.sorted { a, b in
            a.lapses != b.lapses ? a.lapses > b.lapses : a.repetitions < b.repetitions
        }
        return (Array(sorted.prefix(n)), items.count)
    }

    /// Open weakness categories, most open first (detected minus resolved).
    public static func openMemoryCategories(_ events: [ProfileWeaknessEvent]) -> [String] {
        var by: [String: (open: Int, last: String)] = [:]
        for e in events {
            var v = by[e.category] ?? (0, e.createdAt)
            v.open += e.eventType == "detected" ? 1 : -1
            if e.createdAt > v.last { v.last = e.createdAt }
            by[e.category] = v
        }
        return by.filter { $0.value.open > 0 }
            .sorted { a, b in
                a.value.open != b.value.open ? a.value.open > b.value.open
                    : (a.value.last != b.value.last ? a.value.last > b.value.last : a.key < b.key)
            }
            .map { $0.key }
    }

    public enum HectorCard: Sendable, Equatable {
        case pro(topics: [String])
        case teaser(topics: [String])
    }

    /// "Hector noticed". Pro: the open weakness categories Hector is primed with. Free: a teaser built ONLY from the
    /// learner's own weak spots on this course; it never reads Hector's memory, and with no weak spot there is no card.
    public static func hectorCard(pro: Bool, weakItems: [ProfileWeakItem], weaknessEvents: [ProfileWeaknessEvent]) -> HectorCard? {
        if pro {
            let topics = openMemoryCategories(weaknessEvents).prefix(2).map { $0.replacingOccurrences(of: "-", with: " ") }
            return topics.isEmpty ? nil : .pro(topics: Array(topics))
        }
        let topics = weakSpots(weakItems, n: 2).top.map { $0.display }
        return topics.isEmpty ? nil : .teaser(topics: topics)
    }

    /// "a", "a and b", "a, b and c".
    public static func joinTopics(_ topics: [String]) -> String {
        topics.count <= 1 ? (topics.first ?? "") : topics.dropLast().joined(separator: ", ") + " and " + topics.last!
    }

    // MARK: Achievements, league, friends

    public static func achievementStats(_ o: ProfileOverviewData) -> [String: Int] {
        [
            "streak": o.streak,
            // A badge unlocks when any one course's XP passes the threshold.
            "xp": o.courses.map(\.xp).max() ?? 0,
            "perfect": personalRecords(o).perfectLessons,
            "lessons": o.completions.count,
            "league": o.achievements.filter { $0.id.hasPrefix("league_") }.map(\.progress).max() ?? 0,
            "freeze": o.streakFreezes,
        ]
    }

    /// The locked badge closest to done. The team badge is granted by the server only, so never "in reach".
    public static func nextAchievement(stats: [String: Int], unlocked: Set<String>, catalog: [Achievement]) -> (achievement: Achievement, value: Int)? {
        var best: (achievement: Achievement, value: Int, ratio: Double)?
        for a in catalog where a.category != "team" && !unlocked.contains(a.id) && a.threshold > 0 {
            let value = stats[a.category] ?? 0
            let ratio = Double(value) / Double(a.threshold)
            if ratio >= 1 { continue }
            if best == nil || ratio > best!.ratio { best = (a, value, ratio) }
        }
        return best.map { ($0.achievement, $0.value) }
    }

    public struct LeagueStatus: Sendable, Equatable {
        public let tier: String
        public let next: String?
        public let xpToNext: Int
    }

    /// Tiers are promoted by this course's XP passing LEAGUE_THRESHOLDS, never demoted.
    public static func leagueStatus(tier: String, courseXP: Int) -> LeagueStatus {
        let idx = LEAGUES.firstIndex(of: tier) ?? 0
        let next = idx + 1 < LEAGUES.count ? LEAGUES[idx + 1] : nil
        return LeagueStatus(tier: tier, next: next, xpToNext: next == nil ? 0 : max(0, LEAGUE_THRESHOLDS[idx + 1] - courseXP))
    }

    /// The friends board's week: the last 7 days including today.
    public static func rollingWeekXP(today: String, activity: [ProfileActivityDay]) -> Int {
        let from = addDays(today, -(friendsWeekDays - 1))
        return activity.filter { $0.day >= from && $0.day <= today }.reduce(0) { $0 + $1.xp }
    }

    public struct FriendWeekRow: Sendable, Equatable {
        public let key: String
        public let displayName: String
        public let avatarSeed: String
        public let weekXP: Int
        public let isYou: Bool
    }

    public static func friendsWeek(_ friends: [FriendProgress], meName: String, meSeed: String, meWeekXP: Int, max: Int = 5) -> [FriendWeekRow] {
        var rows = friends.map { FriendWeekRow(key: $0.userID, displayName: $0.displayName, avatarSeed: $0.avatarSeed, weekXP: $0.weekXP, isYou: false) }
        rows.append(FriendWeekRow(key: "you", displayName: meName, avatarSeed: meSeed, weekXP: meWeekXP, isYou: true))
        rows.sort { a, b in a.weekXP != b.weekXP ? a.weekXP > b.weekXP : (a.isYou && !b.isYou) }
        if rows.count <= max { return rows }
        let you = rows.firstIndex { $0.isYou }!
        return you < max ? Array(rows.prefix(max)) : Array(rows.prefix(max - 1)) + [rows[you]]
    }

    // MARK: Flag

    /// The learner's flag, only while they turned it on (profiles.country is set only then). nil hides it.
    public static func flagEmoji(country: String?, showFlag: Bool = true) -> String? {
        guard showFlag, let code = country?.uppercased(), code.count == 2,
              code.unicodeScalars.allSatisfy({ $0.value >= 65 && $0.value <= 90 }) else { return nil }
        return String(String.UnicodeScalarView(code.unicodeScalars.compactMap { Unicode.Scalar(127397 + $0.value) }))
    }

    // MARK: Share card

    public static let shareAppName = "Learn with Alphonso"

    /// Every line of text on the share card: real stats only, no link.
    public static func shareCardLines(name: String, courseLabel: String, level: String, streak: Int, minutesSpoken: Int, xpThisWeek: Int) -> [String] {
        [
            shareAppName, "\(name)'s week", "\(courseLabel) \(level)",
            String(streak), "day streak",
            String(minutesSpoken), minutesSpoken == 1 ? "minute spoken" : "minutes spoken",
            String(xpThisWeek), "XP this week",
        ]
    }
}
