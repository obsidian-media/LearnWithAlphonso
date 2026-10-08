import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class TutorErrorTests: XCTestCase {
    private func body(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    private let midnight = Date(timeIntervalSince1970: 1_791_417_600) // 2026-10-08T00:00:00Z
    private let sixPM = Date(timeIntervalSince1970: 1_791_396_000) // 2026-10-07T18:00:00Z

    // MARK: - from(status:body:)

    func testNotEntitledCode() {
        XCTAssertEqual(TutorError.from(status: 403, body: body(["error": "not-entitled"])), .notEntitled)
    }

    func testConsentRequiredCode() {
        XCTAssertEqual(TutorError.from(status: 403, body: body(["error": "ai-consent-required"])), .aiConsentRequired)
    }

    func testQuotaExceededParsesResetsAtWithFractionalSeconds() {
        let error = TutorError.from(
            status: 429,
            body: body(["error": "quota-exceeded", "resetsAt": "2026-10-08T00:00:00.000Z", "message": "Daily CHAT limit"])
        )
        XCTAssertEqual(error, .quotaExceeded(resetsAt: midnight))
    }

    func testQuotaExceededParsesResetsAtWithoutFractionalSeconds() {
        let error = TutorError.from(status: 429, body: body(["error": "quota-exceeded", "resetsAt": "2026-10-08T00:00:00Z"]))
        XCTAssertEqual(error, .quotaExceeded(resetsAt: midnight))
    }

    func testQuotaExceededWithNullOrBadResetsAtHasNoDate() {
        XCTAssertEqual(
            TutorError.from(status: 429, body: body(["error": "quota-exceeded", "resetsAt": NSNull()])),
            .quotaExceeded(resetsAt: nil)
        )
        XCTAssertEqual(
            TutorError.from(status: 429, body: body(["error": "quota-exceeded", "resetsAt": "soon"])),
            .quotaExceeded(resetsAt: nil)
        )
    }

    /// NVIDIA's own rate limit is a 429 too, but it is not the learner's daily quota.
    func testUpstreamRateLimitIsNotTheDailyQuota() {
        XCTAssertEqual(
            TutorError.from(status: 429, body: body(["error": "Rate limited, please try again shortly"])),
            .server(message: nil)
        )
    }

    /// The consent state could not be read. That is a retryable server error, never "consent required".
    func testConsentCheckFailureIsAServerErrorNotConsentRequired() {
        XCTAssertEqual(
            TutorError.from(status: 503, body: body(["error": "consent-check-failed"])),
            .server(message: nil)
        )
    }

    func testUnauthorizedIsSignedOutWhateverTheBody() {
        XCTAssertEqual(TutorError.from(status: 401, body: Data()), .signedOut)
        XCTAssertEqual(TutorError.from(status: 401, body: body(["error": "Session expired — sign in again."])), .signedOut)
    }

    func testServerPrefersDetailOverError() {
        XCTAssertEqual(
            TutorError.from(status: 503, body: body(["detail": "Cloud voice service is not configured", "error": "x"])),
            .server(message: "Cloud voice service is not configured")
        )
        XCTAssertEqual(
            TutorError.from(status: 500, body: body(["error": "Hector is not configured"])),
            .server(message: nil)
        )
    }

    func testNonJSONBodyIsAServerErrorWithNoMessage() {
        XCTAssertEqual(TutorError.from(status: 502, body: Data("Bad gateway".utf8)), .server(message: nil))
    }

    // MARK: - from(_ error:)

    func testTransportFailuresAreNetwork() {
        XCTAssertEqual(TutorError.from(URLError(.notConnectedToInternet)), .network)
        XCTAssertEqual(TutorError.from(URLError(.timedOut)), .network)
    }

    func testATutorErrorPassesThrough() {
        XCTAssertEqual(TutorError.from(TutorError.notEntitled), .notEntitled)
    }

    func testAnythingElseIsAGenericServerError() {
        struct Odd: Error {}
        XCTAssertEqual(TutorError.from(Odd()), .server(message: nil))
    }

    // MARK: - userMessage

    func testQuotaCopyNamesTheResetTime() {
        let message = TutorError.quotaExceeded(resetsAt: midnight)
            .userMessage(now: sixPM, timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertEqual(message, "You've reached today's AI practice limit. It resets at 12:00 AM.")
    }

    func testQuotaCopyForTheBurstLimitSaysWaitAMinute() {
        let message = TutorError.quotaExceeded(resetsAt: sixPM.addingTimeInterval(40)).userMessage(now: sixPM)
        XCTAssertEqual(message, "Too many requests. Wait a minute and try again.")
    }

    func testQuotaCopyWithoutATime() {
        XCTAssertEqual(
            TutorError.quotaExceeded(resetsAt: nil).userMessage(),
            "You've reached today's AI practice limit. Try again tomorrow."
        )
    }

    func testNetworkCopyMatchesTheSharedConnectionFailureString() {
        XCTAssertEqual(TutorError.network.userMessage(), "Couldn't reach the server. Check your connection and try again.")
    }

    /// Never a raw code, never a literal "--", never empty.
    func testEveryCaseHasLearnerCopy() {
        let all: [TutorError] = [
            .signedOut, .notEntitled, .aiConsentRequired, .quotaExceeded(resetsAt: nil),
            .quotaExceeded(resetsAt: midnight), .network, .server(message: "quota-exceeded"), .server(message: nil),
        ]
        for error in all {
            let message = error.userMessage(now: sixPM)
            XCTAssertFalse(message.isEmpty, "\(error)")
            XCTAssertFalse(message.contains("--"), "\(error)")
            XCTAssertFalse(message.contains("quota-exceeded"), "\(error)")
            XCTAssertTrue(message.hasSuffix("."), "\(error)")
        }
    }
}
