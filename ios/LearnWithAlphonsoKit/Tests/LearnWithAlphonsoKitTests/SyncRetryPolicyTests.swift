import XCTest
@testable import LearnWithAlphonsoKit

final class SyncRetryPolicyTests: XCTestCase {
    func testDelayDoublesFromTheBaseAndCaps() {
        let p = SyncRetryPolicy.standard
        XCTAssertEqual(p.delay(afterAttempt: 1), 30)
        XCTAssertEqual(p.delay(afterAttempt: 2), 60)
        XCTAssertEqual(p.delay(afterAttempt: 5), 480)
        XCTAssertEqual(p.delay(afterAttempt: 30), 6 * 60 * 60)
        XCTAssertEqual(p.maxAttempts, 8)
    }
}
