import XCTest
@testable import LearnWithAlphonsoKit

final class PendingSyncNoticeTests: XCTestCase {
    func testHiddenWhenNothingIsWaiting() {
        XCTAssertNil(PendingSyncNotice.message(lessons: 0, reviewAnswers: 0, isConnected: true))
        XCTAssertNil(PendingSyncNotice.message(lessons: 0, reviewAnswers: 0, isConnected: false))
    }

    func testSingularAndPluralAgree() {
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 1, reviewAnswers: 0, isConnected: true),
            "1 lesson is saved on this phone and waiting to sync.")
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 0, reviewAnswers: 1, isConnected: true),
            "1 review answer is saved on this phone and waiting to sync.")
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 2, reviewAnswers: 0, isConnected: true),
            "2 lessons are saved on this phone and waiting to sync.")
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 1, reviewAnswers: 3, isConnected: true),
            "1 lesson and 3 review answers are saved on this phone and waiting to sync.")
    }

    /// Offline, the line says when it will sync instead of offering a retry that cannot work.
    func testOfflineSaysWhenItWillSync() {
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 1, reviewAnswers: 0, isConnected: false),
            "1 lesson is saved on this phone and waiting to sync. It will sync when you're back online.")
        XCTAssertEqual(
            PendingSyncNotice.message(lessons: 2, reviewAnswers: 1, isConnected: false),
            "2 lessons and 1 review answer are saved on this phone and waiting to sync. They will sync when you're back online.")
    }
}
