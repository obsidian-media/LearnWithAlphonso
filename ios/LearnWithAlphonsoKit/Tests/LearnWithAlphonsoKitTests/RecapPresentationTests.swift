import XCTest
@testable import LearnWithAlphonsoKit

final class RecapPresentationTests: XCTestCase {
    func testAWeekWithXPCheersAndAQuietWeekSleeps() {
        XCTAssertEqual(RecapPresentation.pose(lastWeekXP: 120), "levelup-cheer")
        XCTAssertEqual(RecapPresentation.pose(lastWeekXP: 1), "levelup-cheer")
        XCTAssertEqual(RecapPresentation.pose(lastWeekXP: 0), "sleepy-night")
    }

    func testAnUnreadTotalIsAQuietWeekNotACheer() {
        XCTAssertEqual(RecapPresentation.pose(lastWeekXP: nil), "sleepy-night")
        XCTAssertEqual(RecapPresentation.pose(lastWeekXP: -5), "sleepy-night")
    }
}
