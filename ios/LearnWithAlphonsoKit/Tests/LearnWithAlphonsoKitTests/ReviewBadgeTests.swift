import XCTest
@testable import LearnWithAlphonsoKit

final class ReviewBadgeTests: XCTestCase {
    // Review Focus #1: a "0" badge is a permanent meaningless dot that
    // teaches people to ignore the badge entirely.
    func testNoBadgeWhenNothingIsDue() {
        XCTAssertNil(ReviewBadge.text(dueCount: 0))
    }

    func testShowsTheCountWhenReviewsAreWaiting() {
        XCTAssertEqual(ReviewBadge.text(dueCount: 1), "1")
        XCTAssertEqual(ReviewBadge.text(dueCount: 42), "42")
    }

    // Review Focus #2: the tab item must not stretch to fit a big number.
    func testCapsLargeCounts() {
        XCTAssertEqual(ReviewBadge.text(dueCount: 99), "99")
        XCTAssertEqual(ReviewBadge.text(dueCount: 100), "99+")
        XCTAssertEqual(ReviewBadge.text(dueCount: 5000), "99+")
    }

    // A negative count cannot come from .count, but treating it as
    // "nothing due" is the only sane reading if it ever does.
    func testTreatsANegativeCountAsNothingDue() {
        XCTAssertNil(ReviewBadge.text(dueCount: -1))
    }
}
