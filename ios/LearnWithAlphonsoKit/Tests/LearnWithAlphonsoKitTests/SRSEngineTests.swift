import XCTest
@testable import LearnWithAlphonsoKit

final class SRSEngineTests: XCTestCase {
    // MARK: - computeReviewGrade

    func testHalvesRepetitionsOnWrongAnswerAndRecordsALapse() {
        let result = computeReviewGrade(ReviewGradeInput(correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1, elapsedDays: 6))
        XCTAssertFalse(result.retired)
        XCTAssertEqual(result.ease, 2.1, accuracy: 0.0001)
        XCTAssertEqual(result.repetitions, 1) // floor(2 * 0.5)
        XCTAssertEqual(result.intervalDays, 3) // half of the previous 6-day interval
        XCTAssertEqual(result.lapses, 2)
    }

    func testDropsAllTheWayToAFreshRestartWhenRepetitionsHalvesToZero() {
        let result = computeReviewGrade(ReviewGradeInput(correct: false, ease: 2.3, intervalDays: 1, repetitions: 1, lapses: 0, elapsedDays: 1))
        XCTAssertEqual(result.repetitions, 0) // floor(1 * 0.5)
        XCTAssertEqual(result.intervalDays, 1) // half of 1 day, floored at the 1-day minimum
    }

    func testScalesThePostLapseIntervalOffTheItemsActualPriorIntervalNotAFixedStepKeyedOffRepetitions() {
        // Regression test for the real audit finding this port missed for a
        // week (2026-09-22 fix in src/lib/srs.ts, not ported here until
        // 2026-09-29): repetitions caps at 3 before retireAfterRepetitions
        // kicks in, so floor(repetitions * 0.5) can only ever be 0 or 1 -- a
        // fixed-step lookup on that value collapsed every lapse to the same
        // 1-or-3-day interval regardless of how long the item's real
        // interval had grown. A well-established 40-day item lapsing should
        // land much further out than a brand-new item lapsing, even though
        // both halve to the same repetitions bucket (1).
        let established = computeReviewGrade(ReviewGradeInput(correct: false, ease: 2.6, intervalDays: 40, repetitions: 3, lapses: 0, elapsedDays: 40))
        let fresh = computeReviewGrade(ReviewGradeInput(correct: false, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0, elapsedDays: 3))
        XCTAssertEqual(established.repetitions, 1) // floor(3 * 0.5)
        XCTAssertEqual(fresh.repetitions, 1) // floor(2 * 0.5) -- same bucket as `established`
        XCTAssertEqual(established.intervalDays, 20) // half of 40, not the old fixed 3-day step
        XCTAssertEqual(fresh.intervalDays, 2) // half of 3
        XCTAssertGreaterThan(established.intervalDays, fresh.intervalDays)
    }

    func testFloorsEaseAt1Point3SoItNeverGoesNegativeOnRepeatedMisses() {
        let result = computeReviewGrade(ReviewGradeInput(correct: false, ease: 1.35, intervalDays: 0, repetitions: 0, lapses: 0, elapsedDays: 0))
        XCTAssertEqual(result.ease, 1.3, accuracy: 0.0001)
    }

    func testSetsA1DayIntervalOnTheFirstCorrectRepetition() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0, elapsedDays: 0))
        XCTAssertFalse(result.retired)
        XCTAssertEqual(result.ease, 2.45, accuracy: 0.0001)
        XCTAssertEqual(result.intervalDays, 1)
        XCTAssertEqual(result.repetitions, 1)
        XCTAssertEqual(result.lapses, 0)
    }

    func testSetsA3DayIntervalOnTheSecondCorrectRepetition() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.45, intervalDays: 1, repetitions: 1, lapses: 0, elapsedDays: 1))
        XCTAssertEqual(result.intervalDays, 3)
        XCTAssertEqual(result.repetitions, 2)
    }

    func testGrowsTheIntervalByEaseOnTheThirdCorrectRepetitionWhenReviewedOnSchedule() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0, elapsedDays: 3))
        // repetitions becomes 3, ease becomes min(2.8, 2.6+0.15) = 2.75
        XCTAssertEqual(result.repetitions, 3)
        XCTAssertEqual(result.intervalDays, Int((3.0 * 2.75).rounded()))
    }

    func testGrowsTheIntervalFurtherWhenTheReviewHappensWellPastItsDueDate() {
        let onTime = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0, elapsedDays: 3))
        let wayOverdue = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0, elapsedDays: 30))
        XCTAssertEqual(wayOverdue.intervalDays, Int((3.0 * 2.75 * 1.5).rounded()))
        XCTAssertGreaterThan(wayOverdue.intervalDays, onTime.intervalDays)
    }

    func testRetiresTheItemAfter4CleanRepetitionsInARow() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0, elapsedDays: 8))
        XCTAssertTrue(result.retired)
        XCTAssertEqual(result.repetitions, 4)
    }

    func testCapsEaseAt2Point8SoItNeverGrowsUnbounded() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 10, repetitions: 1, lapses: 0, elapsedDays: 10))
        XCTAssertEqual(result.ease, 2.8, accuracy: 0.0001)
    }

    func testFallsBackToA6DayIntervalIfTheGrowthFormulaRoundsToZero() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 1.3, intervalDays: 0, repetitions: 2, lapses: 0, elapsedDays: 0))
        // repetitions becomes 3, intervalDays input is 0 -> overdue bonus is a
        // no-op -> round(0 * ease) || 6
        XCTAssertEqual(result.intervalDays, 6)
    }

    // MARK: - computeReviewOutcome

    private let today = "2026-09-14"
    private func addDays(_ days: Int) -> String {
        String(format: "2026-09-%02d", 14 + days)
    }

    func testSchedulesACorrectButNotYetRetiredAnswerUsingTheGrownInterval() {
        let outcome = computeReviewOutcome(
            ReviewGradeInput(correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0, elapsedDays: 0),
            today: today,
            addDays: addDays
        )
        guard case let .rescheduled(scheduled) = outcome else {
            return XCTFail("Expected .rescheduled, got \(outcome)")
        }
        XCTAssertEqual(scheduled.dueOn, "2026-09-15")
        XCTAssertEqual(scheduled.ease, 2.45, accuracy: 0.0001)
        XCTAssertEqual(scheduled.intervalDays, 1)
        XCTAssertEqual(scheduled.repetitions, 1)
        XCTAssertEqual(scheduled.lapses, 0)
    }

    func testReschedulesAWrongAnswerForTodayNotAFutureDate() {
        let outcome = computeReviewOutcome(
            ReviewGradeInput(correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1, elapsedDays: 6),
            today: today,
            addDays: addDays
        )
        guard case let .rescheduled(scheduled) = outcome else {
            return XCTFail("Expected .rescheduled, got \(outcome)")
        }
        XCTAssertEqual(scheduled.dueOn, today)
        XCTAssertEqual(scheduled.repetitions, 1) // halved from 2, not reset to 0
    }

    func testRetiresTheItemAndSetsDueOnToTodayIgnoringAddDays() {
        let outcome = computeReviewOutcome(
            ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0, elapsedDays: 8),
            today: today,
            addDays: { _ in XCTFail("addDays should not be called for a retired item"); return "" }
        )
        guard case let .retired(dueOn) = outcome else {
            return XCTFail("Expected .retired, got \(outcome)")
        }
        XCTAssertEqual(dueOn, today)
    }
}
