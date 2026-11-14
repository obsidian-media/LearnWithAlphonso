import XCTest
@testable import LearnWithAlphonsoKit

/// Mirrors src/lib/hearts.test.ts -- keep in sync with that file.
final class HeartsEconomyTests: XCTestCase {
    // MARK: - resolveHeartsRefill (same vectors as src/lib/hearts.test.ts)

    private let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    private let step: TimeInterval = HeartsEconomy.heartRefillSeconds

    func testFullHeartsHaveNoTimer() {
        let result = HeartsEconomy.resolveHeartsRefill(hearts: HeartsEconomy.maxHearts, heartsRefillAt: t0.addingTimeInterval(5), now: t0)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
    }

    func testLeavesHeartsUntouchedBeforeTheRefillTimestamp() {
        let refillAt = t0.addingTimeInterval(1)
        let result = HeartsEconomy.resolveHeartsRefill(hearts: 2, heartsRefillAt: refillAt, now: t0)
        XCTAssertEqual(result, HeartsEconomy.HeartsState(hearts: 2, heartsRefillAt: refillAt))
    }

    func testGivesExactlyOneHeartPerDueIntervalAndAtTheBoundary() {
        let late = t0.addingTimeInterval(-1)
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 2, heartsRefillAt: late, now: t0),
                       HeartsEconomy.HeartsState(hearts: 3, heartsRefillAt: late.addingTimeInterval(step)))
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 0, heartsRefillAt: t0, now: t0),
                       HeartsEconomy.HeartsState(hearts: 1, heartsRefillAt: t0.addingTimeInterval(step)))
    }

    func testTwoHoursAwayGivesFourHearts() {
        let due = t0.addingTimeInterval(-4 * step + 1)
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 0, heartsRefillAt: due, now: t0),
                       HeartsEconomy.HeartsState(hearts: 4, heartsRefillAt: due.addingTimeInterval(4 * step)))
    }

    func testCarriesTheLeftoverTimeIntoTheNextHeart() {
        let due = t0.addingTimeInterval(-1.5 * step)
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 1, heartsRefillAt: due, now: t0),
                       HeartsEconomy.HeartsState(hearts: 3, heartsRefillAt: t0.addingTimeInterval(0.5 * step)))
    }

    func testCapsAtMaxHeartsAndClearsTheTimer() {
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 3, heartsRefillAt: t0.addingTimeInterval(-10 * step), now: t0),
                       HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
    }

    func testStartsTheClockForARowBelowTheCapThatHasNone() {
        XCTAssertEqual(HeartsEconomy.resolveHeartsRefill(hearts: 3, heartsRefillAt: nil, now: t0),
                       HeartsEconomy.HeartsState(hearts: 3, heartsRefillAt: t0.addingTimeInterval(step)))
    }

    // MARK: - gainHearts

    func testGainKeepsARunningClockBelowTheCap() {
        let at = t0.addingTimeInterval(900)
        XCTAssertEqual(HeartsEconomy.gainHearts(hearts: 2, amount: 1, heartsRefillAt: at, now: t0),
                       HeartsEconomy.HeartsState(hearts: 3, heartsRefillAt: at))
        XCTAssertEqual(HeartsEconomy.gainHearts(hearts: 0, amount: 1, heartsRefillAt: nil, now: t0),
                       HeartsEconomy.HeartsState(hearts: 1, heartsRefillAt: t0.addingTimeInterval(step)))
    }

    func testGainCapsAtMaxHeartsAndClearsTheTimer() {
        XCTAssertEqual(HeartsEconomy.gainHearts(hearts: 4, amount: 3, heartsRefillAt: t0.addingTimeInterval(900), now: t0),
                       HeartsEconomy.HeartsState(hearts: HeartsEconomy.maxHearts, heartsRefillAt: nil))
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

    // MARK: - gate: same vectors as src/lib/hearts.test.ts's heartsGate block
    func testGateOpenWithHeartsLeft() {
        XCTAssertEqual(HeartsEconomy.gate(hearts: 1, heartsRefillAt: nil, now: Date(timeIntervalSince1970: 1)), .open)
    }
    func testGateBlocksAtZeroBeforeRefillAndReportsIt() {
        let refill = Date(timeIntervalSince1970: 5)
        XCTAssertEqual(HeartsEconomy.gate(hearts: 0, heartsRefillAt: refill, now: Date(timeIntervalSince1970: 1)), .outOfHearts(refillAt: refill))
    }
    func testGateOpensOnceRefillHasPassed() {
        XCTAssertEqual(HeartsEconomy.gate(hearts: 0, heartsRefillAt: Date(timeIntervalSince1970: 5), now: Date(timeIntervalSince1970: 5)), .open)
    }
    func testGateBlocksANegativeCountWithNoTimerAndStartsTheClock() {
        XCTAssertEqual(HeartsEconomy.gate(hearts: -1, heartsRefillAt: nil, now: Date(timeIntervalSince1970: 1)), .outOfHearts(refillAt: Date(timeIntervalSince1970: 1 + HeartsEconomy.heartRefillSeconds)))
    }

    // MARK: - nextHeartCountdown
    func testNextHeartCountdownCountsDownBelowTheCapAndIsNilOtherwise() {
        let now = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(HeartsEconomy.nextHeartCountdown(hearts: 3, heartsRefillAt: now.addingTimeInterval(90.5), now: now), "1:31")
        XCTAssertEqual(HeartsEconomy.nextHeartCountdown(hearts: 3, heartsRefillAt: now.addingTimeInterval(1), now: now), "0:01")
        XCTAssertNil(HeartsEconomy.nextHeartCountdown(hearts: 3, heartsRefillAt: now, now: now))
        XCTAssertNil(HeartsEconomy.nextHeartCountdown(hearts: 5, heartsRefillAt: now.addingTimeInterval(90), now: now))
        XCTAssertNil(HeartsEconomy.nextHeartCountdown(hearts: 3, heartsRefillAt: nil, now: now))
    }

    // MARK: - afterLosingHeart
    func testLosingTheLastHeartStartsTheRefillTimer() {
        let now = Date(timeIntervalSince1970: 1_000)
        let state = HeartsEconomy.afterLosingHeart(hearts: 1, heartsRefillAt: nil, now: now)
        XCTAssertEqual(state, HeartsEconomy.HeartsState(hearts: 0, heartsRefillAt: now.addingTimeInterval(30 * 60)))
    }
    func testLosingAHeartFromFullStartsAClockAndKeepsARunningOne() {
        let now = Date(timeIntervalSince1970: 1_000)
        let timer = now.addingTimeInterval(600)
        XCTAssertEqual(HeartsEconomy.afterLosingHeart(hearts: 5, heartsRefillAt: nil, now: now),
                       HeartsEconomy.HeartsState(hearts: 4, heartsRefillAt: now.addingTimeInterval(30 * 60)))
        XCTAssertEqual(HeartsEconomy.afterLosingHeart(hearts: 3, heartsRefillAt: timer, now: now),
                       HeartsEconomy.HeartsState(hearts: 2, heartsRefillAt: timer))
    }
    func testLosingAHeartSettlesADueRefillFirstAndNeverGoesBelowZero() {
        let now = Date(timeIntervalSince1970: 1_000)
        let late = now.addingTimeInterval(-1)
        XCTAssertEqual(HeartsEconomy.afterLosingHeart(hearts: 2, heartsRefillAt: late, now: now),
                       HeartsEconomy.HeartsState(hearts: 2, heartsRefillAt: late.addingTimeInterval(30 * 60)))
        let timer = now.addingTimeInterval(5)
        XCTAssertEqual(HeartsEconomy.afterLosingHeart(hearts: 0, heartsRefillAt: timer, now: now), HeartsEconomy.HeartsState(hearts: 0, heartsRefillAt: timer))
    }

    func testProIsNeverOutOfHearts() {
        let refill = Date(timeIntervalSince1970: 100)
        XCTAssertEqual(HeartsEconomy.gate(hearts: 0, heartsRefillAt: refill, now: Date(timeIntervalSince1970: 1), unlimited: true), .open)
        XCTAssertEqual(HeartsEconomy.gate(hearts: 0, heartsRefillAt: refill, now: Date(timeIntervalSince1970: 1), unlimited: false), .outOfHearts(refillAt: refill))
    }

    func testOnlyNonProWrongAnswersCostAHeart() {
        XCTAssertTrue(HeartsEconomy.wrongAnswerCostsHeart(unlimited: false))
        XCTAssertFalse(HeartsEconomy.wrongAnswerCostsHeart(unlimited: true))
    }
}
