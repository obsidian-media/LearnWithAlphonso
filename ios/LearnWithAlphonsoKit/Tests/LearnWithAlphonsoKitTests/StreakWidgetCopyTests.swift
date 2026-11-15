import XCTest
@testable import LearnWithAlphonsoKit

final class StreakWidgetCopyTests: XCTestCase {
    func testSingularAndPlural() {
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 1), "day in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 0), "days in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 2), "days in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 31), "days in a row")
    }

    func testBestLine() {
        XCTAssertEqual(StreakWidgetCopy.best(streak: 4, longestStreak: 12), "Best: 12")
        // A longest that lags the current streak never shows a best below it.
        XCTAssertEqual(StreakWidgetCopy.best(streak: 15, longestStreak: 12), "Best: 15")
    }

    func testTheFixedStringsAreTheOnesTheAppShipped() {
        XCTAssertEqual(StreakWidgetCopy.studiedToday, "Studied today")
        XCTAssertEqual(StreakWidgetCopy.notStudiedYet, "Not studied yet")
        XCTAssertEqual(StreakWidgetCopy.empty, "Open Alphonso to start your streak")
    }
}
