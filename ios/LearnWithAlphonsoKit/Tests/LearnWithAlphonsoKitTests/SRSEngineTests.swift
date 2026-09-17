import XCTest
@testable import LearnWithAlphonsoKit

final class SRSEngineTests: XCTestCase {
    // MARK: - computeReviewGrade

    func testResetsIntervalAndRepetitionsOnWrongAnswerAndRecordsALapse() {
        let result = computeReviewGrade(ReviewGradeInput(correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1))
        XCTAssertFalse(result.retired)
        XCTAssertEqual(result.ease, 2.1, accuracy: 0.0001)
        XCTAssertEqual(result.intervalDays, 0)
        XCTAssertEqual(result.repetitions, 0)
        XCTAssertEqual(result.lapses, 2)
    }

    func testFloorsEaseAt1Point3SoItNeverGoesNegativeOnRepeatedMisses() {
        let result = computeReviewGrade(ReviewGradeInput(correct: false, ease: 1.35, intervalDays: 0, repetitions: 0, lapses: 0))
        XCTAssertEqual(result.ease, 1.3, accuracy: 0.0001)
    }

    func testSetsA1DayIntervalOnTheFirstCorrectRepetition() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0))
        XCTAssertFalse(result.retired)
        XCTAssertEqual(result.ease, 2.45, accuracy: 0.0001)
        XCTAssertEqual(result.intervalDays, 1)
        XCTAssertEqual(result.repetitions, 1)
        XCTAssertEqual(result.lapses, 0)
    }

    func testSetsA3DayIntervalOnTheSecondCorrectRepetition() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.45, intervalDays: 1, repetitions: 1, lapses: 0))
        XCTAssertEqual(result.intervalDays, 3)
        XCTAssertEqual(result.repetitions, 2)
    }

    func testGrowsTheIntervalByEaseOnTheThirdCorrectRepetition() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0))
        // repetitions becomes 3, ease becomes min(2.8, 2.6+0.15) = 2.75
        XCTAssertEqual(result.repetitions, 3)
        XCTAssertEqual(result.intervalDays, Int((3.0 * 2.75).rounded()))
    }

    func testRetiresTheItemAfter4CleanRepetitionsInARow() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0))
        XCTAssertTrue(result.retired)
        XCTAssertEqual(result.repetitions, 4)
    }

    func testCapsEaseAt2Point8SoItNeverGrowsUnbounded() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 10, repetitions: 1, lapses: 0))
        XCTAssertEqual(result.ease, 2.8, accuracy: 0.0001)
    }

    func testFallsBackToA6DayIntervalIfTheGrowthFormulaRoundsToZero() {
        let result = computeReviewGrade(ReviewGradeInput(correct: true, ease: 1.3, intervalDays: 0, repetitions: 2, lapses: 0))
        // repetitions becomes 3, intervalDays input is 0 -> round(0 * ease) || 6
        XCTAssertEqual(result.intervalDays, 6)
    }

    // MARK: - computeReviewOutcome

    private let today = "2026-09-14"
    private func addDays(_ days: Int) -> String {
        String(format: "2026-09-%02d", 14 + days)
    }

    func testSchedulesACorrectButNotYetRetiredAnswerUsingTheGrownInterval() {
        let outcome = computeReviewOutcome(
            ReviewGradeInput(correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0),
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
            ReviewGradeInput(correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1),
            today: today,
            addDays: addDays
        )
        guard case let .rescheduled(scheduled) = outcome else {
            return XCTFail("Expected .rescheduled, got \(outcome)")
        }
        XCTAssertEqual(scheduled.dueOn, today)
        XCTAssertEqual(scheduled.repetitions, 0)
    }

    func testRetiresTheItemAndSetsDueOnToTodayIgnoringAddDays() {
        let outcome = computeReviewOutcome(
            ReviewGradeInput(correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0),
            today: today,
            addDays: { _ in XCTFail("addDays should not be called for a retired item"); return "" }
        )
        guard case let .retired(dueOn) = outcome else {
            return XCTFail("Expected .retired, got \(outcome)")
        }
        XCTAssertEqual(dueOn, today)
    }
}
