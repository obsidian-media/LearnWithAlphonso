import XCTest
@testable import LearnWithAlphonsoKit

final class StreakWidgetCopyTests: XCTestCase {
    func testSingularAndPlural() {
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 1), "day in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 0), "days in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 2), "days in a row")
        XCTAssertEqual(StreakWidgetCopy.caption(streak: 31), "days in a row")
    }
}
