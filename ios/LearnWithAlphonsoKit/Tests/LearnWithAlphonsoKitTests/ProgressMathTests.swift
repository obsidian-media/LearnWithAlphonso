import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressMathTests: XCTestCase {
    // MARK: - computeXpGain

    func testAwards10XpPerCorrectAnswer() {
        XCTAssertEqual(computeXpGain(correct: 3, total: 5), 30)
    }

    func testAddsA20XpPerfectLessonBonusWhenEveryAnswerIsCorrect() {
        XCTAssertEqual(computeXpGain(correct: 5, total: 5), 70)
    }

    func testAwardsNothingForZeroCorrectAnswers() {
        XCTAssertEqual(computeXpGain(correct: 0, total: 6), 0)
    }

    // MARK: - computeStreakUpdate

    private func baseStreakInput(lastActiveDate: String?, streak: Int = 4, freezes: Int = 1) -> StreakInput {
        StreakInput(lastActiveDate: lastActiveDate, today: "2026-09-13", streak: streak, longestStreak: 10, freezes: freezes)
    }

    func testMakesNoChangeOnARepeatActivityTheSameDay() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: "2026-09-13"))
        XCTAssertEqual(result.streak, 4)
        XCTAssertEqual(result.longestStreak, 10)
        XCTAssertEqual(result.freezes, 1)
    }

    func testStartsANewStreakAt1OnFirstEverActivity() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: nil))
        XCTAssertEqual(result.streak, 1)
        XCTAssertEqual(result.freezes, 1)
    }

    func testExtendsTheStreakByOneOnAConsecutiveDay() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: "2026-09-12"))
        XCTAssertEqual(result.streak, 5)
        XCTAssertEqual(result.longestStreak, 10)
    }

    func testBridgesAMissedDayBySpendingAFreezeWhenOneIsAvailable() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: "2026-09-11"))
        XCTAssertEqual(result.streak, 5)
        XCTAssertEqual(result.freezes, 0)
    }

    func testResetsTo1AcrossAMissedDayWithNoFreezeAvailable() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: "2026-09-11", freezes: 0))
        XCTAssertEqual(result.streak, 1)
        XCTAssertEqual(result.freezes, 0)
    }

    func testResetsTo1AfterAGapWiderThan2DaysRegardlessOfFreezes() {
        let result = computeStreakUpdate(baseStreakInput(lastActiveDate: "2026-09-01"))
        XCTAssertEqual(result.streak, 1)
    }

    func testRaisesLongestStreakWhenTheNewStreakExceedsIt() {
        let result = computeStreakUpdate(StreakInput(lastActiveDate: "2026-09-12", today: "2026-09-13", streak: 10, longestStreak: 10, freezes: 1))
        XCTAssertEqual(result.longestStreak, 11)
    }

    func testAwardsABonusFreezeOnEvery10thStreakDay() {
        let result = computeStreakUpdate(StreakInput(lastActiveDate: "2026-09-12", today: "2026-09-13", streak: 9, longestStreak: 9, freezes: 0))
        XCTAssertEqual(result.streak, 10)
        XCTAssertEqual(result.freezes, 1)
    }

    func testDoesNotAwardAFreezeWhenTheStreakResetsOnAMilestoneAdjacentCount() {
        let result = computeStreakUpdate(StreakInput(lastActiveDate: "2026-09-01", today: "2026-09-13", streak: 9, longestStreak: 9, freezes: 0))
        XCTAssertEqual(result.streak, 1)
        XCTAssertEqual(result.freezes, 0)
    }

    // MARK: - computeLeaguePromotion

    func testStaysInBronzeBelowTheFirstThreshold() {
        let result = computeLeaguePromotion(xp: 50, oldIdx: 0)
        XCTAssertEqual(result.leagueTier, "bronze")
        XCTAssertEqual(result.newIdx, 0)
    }

    func testPromotesToTheHighestLeagueWhoseThresholdIsMet() {
        let result = computeLeaguePromotion(xp: 3200, oldIdx: 0)
        XCTAssertEqual(result.leagueTier, "ruby")
        XCTAssertEqual(result.newIdx, 3)
    }

    func testPromotesAllTheWayToDiamondAtTheTopThreshold() {
        let result = computeLeaguePromotion(xp: 8000, oldIdx: 0)
        XCTAssertEqual(result.leagueTier, "diamond")
        XCTAssertEqual(result.newIdx, 4)
    }

    func testNeverDemotesEvenIfXpMathWereToImplyALowerLeague() {
        let diamondIdx = LEAGUES.firstIndex(of: "diamond")!
        let result = computeLeaguePromotion(xp: 0, oldIdx: diamondIdx)
        XCTAssertEqual(result.leagueTier, "diamond")
        XCTAssertEqual(result.newIdx, diamondIdx)
    }

    // MARK: - deriveLessonCompletion

    private let lesson = LessonCompletionShape(questionIds: ["q1", "q2", "q3"])

    func testDerivesCorrectAsTotalMinusTheRealMissedQuestions() throws {
        let result = try deriveLessonCompletion(lesson: lesson, total: 3, missedQuestionIds: ["q2"])
        XCTAssertEqual(result.correct, 2)
    }

    func testDedupesRepeatedMissedQuestionIdsBeforeDerivingCorrect() throws {
        let result = try deriveLessonCompletion(lesson: lesson, total: 3, missedQuestionIds: ["q2", "q2", "q2"])
        XCTAssertEqual(result.correct, 2)
    }

    func testTreatsZeroMissesAsAPerfectScore() throws {
        let result = try deriveLessonCompletion(lesson: lesson, total: 3, missedQuestionIds: [])
        XCTAssertEqual(result.correct, 3)
    }

    func testTreatsEveryQuestionMissedAsAZeroScore() throws {
        let result = try deriveLessonCompletion(lesson: lesson, total: 3, missedQuestionIds: ["q1", "q2", "q3"])
        XCTAssertEqual(result.correct, 0)
    }

    func testRejectsATotalThatDoesNotMatchTheLessonsRealQuestionCount() {
        XCTAssertThrowsError(try deriveLessonCompletion(lesson: lesson, total: 5, missedQuestionIds: [])) { error in
            XCTAssertEqual(error as? LessonCompletionError, .invalidPayload)
        }
    }

    func testRejectsAMissedQuestionIdThatDoesNotBelongToThisLesson() {
        XCTAssertThrowsError(try deriveLessonCompletion(lesson: lesson, total: 3, missedQuestionIds: ["not-a-real-question"])) { error in
            XCTAssertEqual(error as? LessonCompletionError, .invalidPayload)
        }
    }

    func testRejectsMoreDistinctMissedIdsThanTheLessonHasQuestions() {
        let tiny = LessonCompletionShape(questionIds: ["q1"])
        XCTAssertThrowsError(try deriveLessonCompletion(lesson: tiny, total: 1, missedQuestionIds: ["q1", "not-a-real-question"])) { error in
            XCTAssertEqual(error as? LessonCompletionError, .invalidPayload)
        }
    }
}
