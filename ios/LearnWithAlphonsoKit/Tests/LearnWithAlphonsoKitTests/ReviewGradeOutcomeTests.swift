import XCTest
@testable import LearnWithAlphonsoKit

/// Whether a just-graded review item should still count as due today.
///
/// BACKLOG 0.0-z #5: the Learn tab badge stayed at 2, then 3, after the review
/// queue was cleared, because an ONLINE grade never touched the cached due
/// list (only the offline path removed items from it). This is the rule the
/// view applies to the server's own answer to decide whether to drop the item.
final class ReviewGradeOutcomeTests: XCTestCase {
    private let today = "2026-10-05"

    func testScheduledForALaterDayIsNoLongerDueToday() {
        let outcome = ReviewGradeOutcome(retired: false, dueOn: "2026-10-06")
        XCTAssertFalse(outcome.isStillDue(on: today))
    }

    /// A wrong answer keeps the item due today on the real server, so it must
    /// stay in the count -- removing it would under-report real work.
    func testWrongAnswerThatStaysDueTodayIsStillDue() {
        let outcome = ReviewGradeOutcome(retired: false, dueOn: today, correct: false)
        XCTAssertTrue(outcome.isStillDue(on: today))
    }

    func testOverdueItemIsStillDue() {
        let outcome = ReviewGradeOutcome(retired: false, dueOn: "2026-10-01")
        XCTAssertTrue(outcome.isStillDue(on: today))
    }

    func testRetiredItemIsNeverDue() {
        // Retired items come back with a dueOn that must not matter.
        let outcome = ReviewGradeOutcome(retired: true, dueOn: today)
        XCTAssertFalse(outcome.isStillDue(on: today))
    }

    /// Month and year boundaries: the comparison is on ISO dates, so plain
    /// string order must agree with calendar order.
    func testComparesAcrossMonthAndYearBoundaries() {
        XCTAssertFalse(ReviewGradeOutcome(retired: false, dueOn: "2026-11-01").isStillDue(on: "2026-10-31"))
        XCTAssertFalse(ReviewGradeOutcome(retired: false, dueOn: "2027-01-01").isStillDue(on: "2026-12-31"))
        XCTAssertTrue(ReviewGradeOutcome(retired: false, dueOn: "2026-12-31").isStillDue(on: "2027-01-01"))
    }
}
