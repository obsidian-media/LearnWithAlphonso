import XCTest
@testable import LearnWithAlphonsoKit

/// Mirrors src/lib/hearts.test.ts -- keep in sync with that file.
final class HeartsEconomyTests: XCTestCase {
    // MARK: - resolveHeartsRefill

    func testLeavesHeartsUntouchedWhenNoRefillIsPending() {
        let result = HeartsEconomy.resolveHeartsRefill(hearts: 3, heartsRefillAt: nil, now: Date())
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: 3, heartsRefillAt: nil))
    }

    func testLeavesHeartsUntouchedBeforeTheRefillTimestamp() {
        let now = Date()
        let refillAt = now.addingTimeInterval(1)
        let result = HeartsEconomy.resolveHeartsRefill(hearts: 0, heartsRefillAt: refillAt, now: now)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: 0, heartsRefillAt: refillAt))
    }

    func testRestoresToMaxHeartsAndClearsTheTimerOnceThePastTimestampHasPassed() {
        let now = Date()
        let refillAt = now.addingTimeInterval(-1)
        let result = HeartsEconomy.resolveHeartsRefill(hearts: 0, heartsRefillAt: refillAt, now: now)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
    }

    func testRestoresExactlyAtTheRefillTimestampBoundary() {
        let now = Date()
        let result = HeartsEconomy.resolveHeartsRefill(hearts: 0, heartsRefillAt: now, now: now)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
    }

    // MARK: - gainHearts

    func testAddsHeartsUpToTheCap() {
        let result = HeartsEconomy.gainHearts(hearts: 3, amount: 1)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: 4, heartsRefillAt: nil))
    }

    func testCapsAtMaxHearts() {
        let result = HeartsEconomy.gainHearts(hearts: 4, amount: 3)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
    }

    func testClearsAPendingRefillTimerOnAnyGain() {
        let result = HeartsEconomy.gainHearts(hearts: 0, amount: 1)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: 1, heartsRefillAt: nil))
    }

    // MARK: - perfectLessonBonusEarned

    func testIsTrueWhenEveryQuestionWasCorrect() {
        XCTAssertTrue(HeartsEconomy.perfectLessonBonusEarned(correct: 8, total: 8))
    }

    func testIsFalseOnAnyMiss() {
        XCTAssertFalse(HeartsEconomy.perfectLessonBonusEarned(correct: 7, total: 8))
    }

    func testIsFalseForAZeroQuestionLesson() {
        XCTAssertFalse(HeartsEconomy.perfectLessonBonusEarned(correct: 0, total: 0))
    }

    // MARK: - streakHeartMilestoneReached

    func testFiresWhenTheStreakAdvancesOntoAMultipleOf7() {
        XCTAssertTrue(HeartsEconomy.streakHeartMilestoneReached(oldStreak: 6, newStreak: 7))
    }

    func testDoesNotFireAgainOnASameDayRecheck() {
        XCTAssertFalse(HeartsEconomy.streakHeartMilestoneReached(oldStreak: 7, newStreak: 7))
    }

    func testDoesNotFireOnNonMultiples() {
        XCTAssertFalse(HeartsEconomy.streakHeartMilestoneReached(oldStreak: 7, newStreak: 8))
    }

    func testFiresAt14And21() {
        XCTAssertTrue(HeartsEconomy.streakHeartMilestoneReached(oldStreak: 13, newStreak: 14))
        XCTAssertTrue(HeartsEconomy.streakHeartMilestoneReached(oldStreak: 20, newStreak: 21))
    }

    // MARK: - buyHeartWithXp

    func testSucceedsAndDeductsTheCostWhenAffordableAndNotFull() {
        let result = HeartsEconomy.buyHeartWithXp(hearts: 2, xp: 100)
        XCTAssertEqual(result, .ok(hearts: 3, xp: 100 - HeartsEconomy.xpHeartCost))
    }

    func testRejectsWhenHeartsAreAlreadyFull() {
        let result = HeartsEconomy.buyHeartWithXp(hearts: HeartsEconomy.maxHearts, xp: 1000)
        XCTAssertEqual(result, .heartsFull)
    }

    func testRejectsWhenXpIsInsufficient() {
        let result = HeartsEconomy.buyHeartWithXp(hearts: 2, xp: HeartsEconomy.xpHeartCost - 1)
        XCTAssertEqual(result, .insufficientXp)
    }

    func testSucceedsExactlyAtTheCostBoundary() {
        let result = HeartsEconomy.buyHeartWithXp(hearts: 2, xp: HeartsEconomy.xpHeartCost)
        XCTAssertEqual(result, .ok(hearts: 3, xp: 0))
    }
}
