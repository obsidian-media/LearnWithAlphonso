import XCTest
@testable import LearnWithAlphonsoKit

final class NotificationTapTests: XCTestCase {
    func testSupportReplyOpensHelp() {
        // The shape APNs delivers: the alert under "aps", the server's data keys beside it.
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "Dana \u{00B7} Support team", "body": "You have a reply in Help"], "sound": "default"],
            "type": "support",
        ]
        XCTAssertEqual(notificationTapDestination(userInfo: userInfo), .help)
    }

    func testOtherPushTypesHaveNoDestination() {
        XCTAssertNil(notificationTapDestination(userInfo: ["type": "nudge"]))
        XCTAssertNil(notificationTapDestination(userInfo: ["type": "overtake"]))
        XCTAssertNil(notificationTapDestination(userInfo: ["type": "Support"]))
        XCTAssertNil(notificationTapDestination(userInfo: ["type": "support "]))
    }

    func testMissingOrNonTextTypeHasNoDestination() {
        XCTAssertNil(notificationTapDestination(userInfo: [:]))
        XCTAssertNil(notificationTapDestination(userInfo: ["aps": ["alert": "x"]]))
        XCTAssertNil(notificationTapDestination(userInfo: ["type": 5]))
        XCTAssertNil(notificationTapDestination(userInfo: ["type": ["support"]]))
    }

    func testAnAlertThatMerelyMentionsSupportIsNotARoute() {
        // The words on the lock screen never decide where a tap goes; only the data type does.
        let userInfo: [AnyHashable: Any] = ["aps": ["alert": ["title": "support", "body": "support"]], "type": "nudge"]
        XCTAssertNil(notificationTapDestination(userInfo: userInfo))
    }
}
