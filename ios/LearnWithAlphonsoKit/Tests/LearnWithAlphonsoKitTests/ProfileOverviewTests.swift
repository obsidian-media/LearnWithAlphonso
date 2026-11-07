import XCTest
@testable import LearnWithAlphonsoKit

final class ProfileOverviewTests: XCTestCase {
    typealias M = ProfileMath
    private let today = "2026-11-07" // a Saturday

    private func overview(_ edit: (inout ProfileOverviewData) -> Void = { _ in }) -> ProfileOverviewData {
        var o = ProfileOverviewData(today: today, course: "es")
        edit(&o)
        return o
    }

    // MARK: Hector card

    func testFreeTeaserUsesOnlyOwnWeakSpotsNeverHectorMemory() {
        let weak = [ProfileWeakItem(label: "a", display: "ser and estar", lapses: 3, repetitions: 0)]
        let events = [ProfileWeaknessEvent(category: "secret-memory-topic", eventType: "detected", createdAt: "2026-11-01")]
        let card = M.hectorCard(pro: false, weakItems: weak, weaknessEvents: events)
        XCTAssertEqual(card, .teaser(topics: ["ser and estar"]))
    }

    func testFreeWithNoWeakSpotsHasNoCardEvenWhenMemoryExists() {
        let events = [ProfileWeaknessEvent(category: "past-tense", eventType: "detected", createdAt: "2026-11-01")]
        XCTAssertNil(M.hectorCard(pro: false, weakItems: [], weaknessEvents: events))
    }

    func testProReadsOpenMemoryTopics() {
        let events = [
            ProfileWeaknessEvent(category: "past-tense", eventType: "detected", createdAt: "2026-11-01"),
            ProfileWeaknessEvent(category: "gender", eventType: "detected", createdAt: "2026-11-02"),
            ProfileWeaknessEvent(category: "gender", eventType: "resolved", createdAt: "2026-11-03"),
        ]
        XCTAssertEqual(M.hectorCard(pro: true, weakItems: [], weaknessEvents: events), .pro(topics: ["past tense"]))
        XCTAssertNil(M.hectorCard(pro: true, weakItems: [], weaknessEvents: []))
    }

    func testJoinTopics() {
        XCTAssertEqual(M.joinTopics(["a"]), "a")
        XCTAssertEqual(M.joinTopics(["a", "b"]), "a and b")
    }

    // MARK: Flag

    func testFlagHiddenWhenOffAndShownWhenOn() {
        XCTAssertNil(M.flagEmoji(country: nil))
        XCTAssertNil(M.flagEmoji(country: "ES", showFlag: false))
        XCTAssertNil(M.flagEmoji(country: "x1"))
        XCTAssertEqual(M.flagEmoji(country: "es"), "🇪🇸")
    }

    // MARK: Heat map

    func testHeatMapSpansExactlyThreeMonthsOfUTCDays() {
        XCTAssertEqual(M.threeMonthsWindow(today: "2026-11-07").start, "2026-08-08")
        XCTAssertEqual(M.threeMonthsWindow(today: "2026-05-31").start, "2026-03-01") // Feb clamps to the 28th
        let map = M.heatMap(today: today, rows: [])
        let inRange = map.weeks.flatMap { $0 }.filter(\.inRange)
        XCTAssertEqual(inRange.count, 92) // Aug 8 ... Nov 7
        XCTAssertEqual(inRange.first?.day, "2026-08-08")
        XCTAssertEqual(inRange.last?.day, today)
        XCTAssertTrue(map.weeks.allSatisfy { $0.count == 7 })
        XCTAssertEqual(map.weeks[0][0].day, M.weekStart("2026-08-08")) // Monday-first
    }

    func testHeatMapIgnoresDaysOutsideWindowAndScalesLevels() {
        let rows = [
            ProfileActivityDay(day: "2026-08-07", xp: 999), // one day too early
            ProfileActivityDay(day: "2026-11-01", xp: 40),
            ProfileActivityDay(day: "2026-11-02", xp: 10),
        ]
        let map = M.heatMap(today: today, rows: rows)
        XCTAssertEqual(map.activeDays, 2)
        let cells = Dictionary(uniqueKeysWithValues: map.weeks.flatMap { $0 }.map { ($0.day, $0) })
        XCTAssertEqual(cells["2026-11-01"]?.level, 4)
        XCTAssertEqual(cells["2026-11-02"]?.level, 1)
        XCTAssertEqual(cells["2026-11-03"]?.level, 0)
    }

    // MARK: Week

    func testWeekRingsDoneMissedTodayFutureAndMinutes() {
        let w = M.weekRings(
            today: today,
            activity: [ProfileActivityDay(day: "2026-11-02", xp: 20), ProfileActivityDay(day: "2026-11-07", xp: 5)],
            speech: [ProfileSpeechDay(day: "2026-11-02", seconds: 90), ProfileSpeechDay(day: "2026-11-03", seconds: 60)])
        XCTAssertEqual(w.days.map(\.day).first, "2026-11-02")
        XCTAssertEqual(w.days.map(\.state), [.done, .missed, .missed, .missed, .missed, .done, .future])
        XCTAssertEqual(w.activeDays, 2)
        XCTAssertEqual(w.minutesSpoken, 3) // 150 s rounds to 3
    }

    func testTodayWithNoXPIsNotMissed() {
        XCTAssertEqual(M.weekRings(today: today, activity: [], speech: []).days[5].state, .today)
    }

    // MARK: Big numbers

    func testXPIsThisCourseOnlyAndStreakIsCurrentNotLongest() {
        let o = overview {
            $0.streak = 4
            $0.longestStreak = 40
            $0.courses = [
                ProfileCourseProgress(course: "es", xp: 120, cefrLevel: "A1", leagueTier: "bronze"),
                ProfileCourseProgress(course: "fr", xp: 900, cefrLevel: "A2", leagueTier: "silver"),
            ]
            $0.completions = [
                ProfileCompletion(lessonID: "l1", language: "es", correct: 3, total: 4),
                ProfileCompletion(lessonID: "l2", language: "fr", correct: 5, total: 5),
            ]
            $0.activity = [ProfileActivityDay(day: "2026-11-03", xp: 30), ProfileActivityDay(day: "2026-10-20", xp: 99)]
        }
        let n = M.bigNumbers(o) { id in id == "l1" ? ["Hola", "hola", "Adios"] : ["bonjour"] }
        XCTAssertEqual(n.courseXP, 120)
        XCTAssertEqual(n.streak, 4)
        XCTAssertEqual(n.longestStreak, 40)
        XCTAssertEqual(n.lessonsDone, 1)
        XCTAssertEqual(n.accuracyPct, 75)
        XCTAssertEqual(n.wordsLearned, 2)
        XCTAssertEqual(n.xpThisWeek, 30)
    }

    func testNewLearnerHasZerosAndNoAccuracy() {
        let n = M.bigNumbers(overview()) { _ in [] }
        XCTAssertEqual([n.streak, n.courseXP, n.wordsLearned, n.lessonsDone], [0, 0, 0, 0])
        XCTAssertNil(n.accuracyPct)
    }

    // MARK: Records, level, weak, achievements, league, friends

    func testPersonalRecordsCountPerfectLessons() {
        let o = overview {
            $0.bestDayXP = 80
            $0.longestStreak = 9
            $0.completions = [
                ProfileCompletion(lessonID: "a", language: "es", correct: 5, total: 5),
                ProfileCompletion(lessonID: "b", language: "es", correct: 4, total: 5),
                ProfileCompletion(lessonID: "c", language: "es", correct: 0, total: 0),
            ]
        }
        XCTAssertEqual(M.personalRecords(o), M.Records(bestDayXP: 80, bestStreak: 9, perfectLessons: 1))
    }

    func testLevelProgress() {
        let p = M.levelProgress(cefr: "A2", units: [["a", "b"], ["c", "d"]], completed: ["a", "b", "c"])
        XCTAssertEqual(p.done, 3)
        XCTAssertEqual(p.total, 4)
        XCTAssertEqual(p.pct, 75)
        XCTAssertEqual(p.unitsLeft, 1)
        XCTAssertEqual(p.next, "B1")
        XCTAssertNil(M.levelProgress(cefr: "C2", units: [], completed: []).next)
        XCTAssertEqual(M.levelProgress(cefr: "zz", units: [], completed: []).level, "A1")
    }

    func testWeakSpotsMostMissedFirst() {
        let items = [
            ProfileWeakItem(label: "a", display: "A", lapses: 1, repetitions: 0),
            ProfileWeakItem(label: "b", display: "B", lapses: 3, repetitions: 2),
            ProfileWeakItem(label: "c", display: "C", lapses: 3, repetitions: 0),
            ProfileWeakItem(label: "d", display: "D", lapses: 0, repetitions: 0),
        ]
        let w = M.weakSpots(items)
        XCTAssertEqual(w.top.map(\.display), ["C", "B", "A"])
        XCTAssertEqual(w.total, 4)
    }

    func testNextAchievementIsClosestLockedAndNeverTeam() {
        func ach(_ id: String, _ cat: String, _ t: Int) -> Achievement {
            try! JSONDecoder().decode(Achievement.self, from: Data(
                #"{"id":"\#(id)","title":"T","description":"D","icon":"star","tier":"bronze","category":"\#(cat)","threshold":\#(t)}"#.utf8))
        }
        let catalog = [ach("s7", "streak", 7), ach("s3", "streak", 3), ach("team", "team", 1), ach("x", "xp", 100)]
        let next = M.nextAchievement(stats: ["streak": 2, "xp": 10, "team": 0], unlocked: [], catalog: catalog)
        XCTAssertEqual(next?.achievement.id, "s3")
        XCTAssertEqual(next?.value, 2)
        XCTAssertNil(M.nextAchievement(stats: ["streak": 9, "xp": 500], unlocked: [], catalog: catalog.filter { $0.category != "team" }))
        XCTAssertEqual(M.nextAchievement(stats: ["streak": 2], unlocked: ["s3"], catalog: catalog)?.achievement.id, "s7")
    }

    func testLeagueXPToNextFromThresholds() {
        XCTAssertEqual(M.leagueStatus(tier: "bronze", courseXP: 120), M.LeagueStatus(tier: "bronze", next: "silver", xpToNext: 180))
        XCTAssertEqual(M.leagueStatus(tier: "diamond", courseXP: 99999), M.LeagueStatus(tier: "diamond", next: nil, xpToNext: 0))
    }

    func testFriendsWeekKeepsYouVisible() {
        let friends = (1...6).map { FriendProgress(userID: "f\($0)", displayName: "F\($0)", avatarSeed: "0", streak: 1, weekXP: 100 * $0) }
        let rows = M.friendsWeek(friends, meName: "Me", meSeed: "0", meWeekXP: 5)
        XCTAssertEqual(rows.count, 5)
        XCTAssertTrue(rows.last!.isYou)
        XCTAssertEqual(M.friendsWeek([], meName: "Me", meSeed: "0", meWeekXP: 0).count, 1)
    }

    func testRollingWeekIsSevenDaysIncludingToday() {
        let rows = [ProfileActivityDay(day: "2026-11-01", xp: 7), ProfileActivityDay(day: "2026-10-31", xp: 50)]
        XCTAssertEqual(M.rollingWeekXP(today: today, activity: rows), 7)
    }

    func testShareCardHasNoLink() {
        let lines = M.shareCardLines(name: "Ana", courseLabel: "Spanish", level: "A1", streak: 4, minutesSpoken: 1, xpThisWeek: 30)
        XCTAssertTrue(lines.contains("minute spoken"))
        XCTAssertFalse(lines.joined().lowercased().contains("http"))
    }
}
