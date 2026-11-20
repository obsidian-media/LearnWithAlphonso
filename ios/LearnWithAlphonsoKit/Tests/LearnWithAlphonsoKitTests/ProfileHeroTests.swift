import XCTest
@testable import LearnWithAlphonsoKit

/// The identity hero, week strip and league card rules (src/lib/profile-overview.test.ts holds the same cases).
final class ProfileHeroTests: XCTestCase {
    typealias M = ProfileMath
    private let today = "2026-11-06" // a Friday

    func testLeaguePctIsTheShareThroughThisTiersSpanAndStaysInRange() {
        // sapling spans 300 to 1000 XP: 650 is halfway.
        XCTAssertEqual(M.leaguePct(tier: "silver", courseXP: 650), 50)
        XCTAssertEqual(M.leaguePct(tier: "bronze", courseXP: 0), 0)
        XCTAssertEqual(M.leaguePct(tier: "diamond", courseXP: 9000), 100)
        XCTAssertEqual(M.leaguePct(tier: "silver", courseXP: 5000), 100)
        XCTAssertEqual(M.leaguePct(tier: "silver", courseXP: 10), 0)
    }

    func testLessonsLeftIsTheLevelsLessonsNotYetDone() {
        let p = M.levelProgress(cefr: "A2", units: [["a", "b"], ["c", "d"]], completed: ["a", "b", "c"])
        XCTAssertEqual(M.lessonsLeft(p), 1)
        XCTAssertEqual(M.lessonsLeft(M.levelProgress(cefr: "A1", units: [], completed: [])), 0)
    }

    func testWeekStripStampsDoneDaysRingsTodayAndLeavesTheRestPlain() {
        let strip = M.weekStrip(
            today: today,
            activity: [ProfileActivityDay(day: "2026-11-02", xp: 40), ProfileActivityDay(day: "2026-11-04", xp: 20)],
            speech: [], learning: [], goalMinutes: nil)
        XCTAssertFalse(strip.measuredInMinutes)
        XCTAssertEqual(strip.days.map(\.state), [.done, .missed, .done, .missed, .today, .future, .future])
        XCTAssertEqual(strip.doneDays, 2)
        XCTAssertEqual(strip.days[0].spoken, "40 XP")
        XCTAssertEqual(strip.days[4].spoken, "not yet today")
        XCTAssertEqual(strip.days[6].spoken, "still to come")
    }

    func testWeekStripMeasuresLearningMinutesWhenTheLearnerChoseAGoal() {
        let strip = M.weekStrip(
            today: today,
            activity: [ProfileActivityDay(day: "2026-11-03", xp: 90)],
            speech: [],
            learning: [ProfileLearningDay(day: "2026-11-02", lessonSeconds: 420, practiceSeconds: 240)],
            goalMinutes: 10)
        XCTAssertTrue(strip.measuredInMinutes)
        // XP alone does not make a day done once a goal exists; 11 minutes on Monday does.
        XCTAssertEqual(strip.days[0].state, .done)
        XCTAssertEqual(strip.days[0].spoken, "11 min, goal met")
        XCTAssertEqual(strip.days[1].state, .missed)
        XCTAssertEqual(strip.doneDays, 1)
    }

    func testDrawnFlagFallsBackToNilNeverToTheEmoji() {
        XCTAssertEqual(M.drawnFlagCode(country: "gb"), "GB")
        XCTAssertNil(M.drawnFlagCode(country: "CA"))
        XCTAssertNil(M.drawnFlagCode(country: nil))
    }
}
