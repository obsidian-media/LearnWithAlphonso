import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class LessonCompletionErrorTests: XCTestCase {
    func testNetworkFamilyIsOfflineAndQueued() {
        for code in [URLError.Code.notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed] {
            let e = LessonCompletionError.classify(URLError(code))
            XCTAssertEqual(e, .offline, "\(code)")
            XCTAssertTrue(e.shouldQueue)
        }
    }

    func testTimeoutsAreQueued() {
        XCTAssertEqual(LessonCompletionError.classify(URLError(.timedOut)), .timeout)
        XCTAssertEqual(LessonCompletionError.classify(status: 408, code: nil), .timeout)
        XCTAssertTrue(LessonCompletionError.timeout.shouldQueue)
    }

    func test5xxAnd429AreServerAndQueued() {
        for status in [429, 500, 502, 503, 504, 599] {
            let e = LessonCompletionError.classify(ProgressSyncError.server(status: status, message: nil))
            XCTAssertEqual(e, .server(status: status))
            XCTAssertTrue(e.shouldQueue, "\(status)")
        }
    }

    func test401IsUnauthorizedAndNotQueued() {
        let e = LessonCompletionError.classify(ProgressSyncError.server(status: 401, message: "Unauthorized: invalid token"))
        XCTAssertEqual(e, .unauthorized)
        XCTAssertFalse(e.shouldQueue)
    }

    /// A 4xx never shows as offline.
    func testEvery4xxExcept401IsRejectedAndNeverQueued() {
        for status in 400...499 where ![401, 408, 429].contains(status) {
            let e = LessonCompletionError.classify(ProgressSyncError.server(status: status, message: nil))
            guard case .rejected = e else { return XCTFail("\(status) -> \(e)") }
            XCTAssertFalse(e.shouldQueue, "\(status)")
            XCTAssertNotEqual(e.userMessage, LessonCompletionError.offline.userMessage, "\(status)")
            XCTAssertNotNil(e.supportLine, "\(status) must show the support path")
        }
    }

    func testStableCodesAreKeptAndSentencesAreNot() {
        XCTAssertEqual(LessonCompletionError.classify(status: 409, code: "lesson-version-mismatch"), .rejected(code: "lesson-version-mismatch"))
        XCTAssertEqual(LessonCompletionError.classify(status: 403, code: "Invalid or expired lesson session"), .rejected(code: nil))
    }

    func testOutOfHeartsIsRejectedWithItsCode() {
        XCTAssertEqual(LessonCompletionError.classify(ProgressSyncError.outOfHearts(refillAt: nil)), .rejected(code: "out-of-hearts"))
    }

    func testAnUnreadable2xxIsQueuedBecauseTheServerMayHaveRecordedIt() {
        XCTAssertEqual(LessonCompletionError.classify(ProgressSyncError.invalidPayload), .server(status: 502))
        XCTAssertTrue(LessonCompletionError.classify(ProgressSyncError.badResponse).shouldQueue)
    }

    func testCopyHasNoRawCodesAndNoDoubleDash() {
        let all: [LessonCompletionError] = [.offline, .unauthorized, .server(status: 503), .timeout,
            .rejected(code: "lesson-version-mismatch"), .rejected(code: "out-of-hearts"), .rejected(code: nil), .rejected(code: "weird-code")]
        for e in all {
            XCTAssertFalse(e.userMessage.contains("--"), "\(e)")
            XCTAssertFalse(e.userMessage.contains("-mismatch") || e.userMessage.contains("weird-code") || e.userMessage.contains("503"), "\(e)")
        }
        XCTAssertEqual(LessonCompletionError.offline.userMessage, "Saved. It will sync when you're back online.")
    }

    func testQueuedFailuresSayTheLessonIsSaved() {
        for e in [LessonCompletionError.offline, .timeout, .server(status: 500)] {
            XCTAssertTrue(e.userMessage.contains("aved"), "\(e)")
            XCTAssertNil(e.supportLine)
        }
    }
}
