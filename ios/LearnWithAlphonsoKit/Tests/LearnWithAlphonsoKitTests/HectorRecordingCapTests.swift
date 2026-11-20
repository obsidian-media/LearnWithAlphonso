import XCTest
@testable import LearnWithAlphonsoKit

final class HectorRecordingCapTests: XCTestCase {
    func testATappedRecordingIsCappedAtAMinuteLikeTheOtherPlatforms() {
        XCTAssertEqual(HectorRecordingCap.seconds, 60)
    }
}
