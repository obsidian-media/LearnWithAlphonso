import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class EmailCodeFlowTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func sentFlow(_ email: String = "ada@example.com") -> EmailCodeFlow {
        var flow = EmailCodeFlow(email: email)
        flow.codeSent(at: t0)
        return flow
    }

    // MARK: - Back ("Use a different email")

    func testUseDifferentEmailReturnsToTheEmailStepAndKeepsTheAddress() {
        var flow = sentFlow()
        flow.enterCode("123")
        flow.useDifferentEmail()
        XCTAssertEqual(flow.phase, .enteringEmail)
        XCTAssertEqual(flow.email, "ada@example.com")
        XCTAssertEqual(flow.code, "")
        XCTAssertNil(flow.failure)
        XCTAssertNil(flow.codeSentAt)
        XCTAssertFalse(flow.canResend(now: t0.addingTimeInterval(3600)))
    }

    // MARK: - Resend cooldown

    func testResendIsLockedForSixtySecondsThenOpens() {
        let flow = sentFlow()
        XCTAssertEqual(flow.resendSecondsRemaining(now: t0), 60)
        XCTAssertEqual(flow.resendSecondsRemaining(now: t0.addingTimeInterval(59.2)), 1)
        XCTAssertFalse(flow.canResend(now: t0.addingTimeInterval(59.9)))
        XCTAssertEqual(flow.resendSecondsRemaining(now: t0.addingTimeInterval(60)), 0)
        XCTAssertTrue(flow.canResend(now: t0.addingTimeInterval(60)))
    }

    func testResendRestartsTheCooldownClearsTheCodeAndSaysSo() {
        var flow = sentFlow()
        flow.enterCode("111")
        let t1 = t0.addingTimeInterval(75)
        flow.codeResent(at: t1)
        XCTAssertEqual(flow.code, "")
        XCTAssertEqual(flow.codeSentAt, t1)
        XCTAssertEqual(flow.resendSecondsRemaining(now: t1), 60)
        XCTAssertEqual(flow.notice, AuthCopy.codeResent(to: "ada@example.com"))
    }

    func testARateLimitedResendWaitsForTheServersSeconds() {
        var flow = sentFlow()
        let now = t0.addingTimeInterval(61)
        flow.sendFailed(
            SupabaseAuthError.server(status: 429, message: "For security purposes, you can only request this after 42 seconds."),
            now: now
        )
        XCTAssertEqual(flow.failure, .tooManyRequests)
        XCTAssertEqual(flow.resendSecondsRemaining(now: now), 42)
        XCTAssertEqual(flow.phase, .enteringCode)
    }

    // MARK: - Code entry and auto-submit

    func testEnterCodeKeepsAsciiDigitsOnlyAndCapsAtSix() {
        var flow = sentFlow()
        flow.enterCode("12a 3-4\u{0665}5678")
        XCTAssertEqual(flow.code, "123456")
    }

    func testAutoSubmitFiresOnceWhenTheSixthDigitArrives() {
        var flow = sentFlow()
        XCTAssertFalse(flow.enterCode("12345"))
        XCTAssertTrue(flow.enterCode("123456"))
        XCTAssertFalse(flow.enterCode("123456"), "an unchanged complete code must not submit twice")
        XCTAssertFalse(flow.enterCode("1234567"), "a seventh digit is dropped, not a new submission")
    }

    func testAPastedOrAutofilledCodeSubmitsAtOnce() {
        var flow = sentFlow()
        XCTAssertTrue(flow.enterCode("123 456"))
    }

    func testEditingAfterAFailureClearsIt() {
        var flow = sentFlow()
        flow.enterCode("123456")
        flow.verificationFailed(SupabaseAuthError.server(status: 403, message: "Token has expired or is invalid"), now: t0.addingTimeInterval(30))
        XCTAssertNotNil(flow.failure)
        flow.enterCode("12345")
        XCTAssertNil(flow.failure)
    }

    // MARK: - Invalid vs expired (GoTrue answers both with the same 403)

    func testARejectedCodeWithinTheLifetimeIsInvalid() {
        var flow = sentFlow()
        flow.verificationFailed(SupabaseAuthError.server(status: 403, message: "Token has expired or is invalid"), now: t0.addingTimeInterval(300))
        XCTAssertEqual(flow.failure, .invalidCode)
        XCTAssertEqual(flow.failure?.message, AuthCopy.invalidCode)
    }

    func testARejectedCodeAfterTheLifetimeIsExpired() {
        var flow = sentFlow()
        flow.verificationFailed(SupabaseAuthError.server(status: 403, message: "Token has expired or is invalid"),
                                now: t0.addingTimeInterval(EmailCodeFlow.codeLifetime + 1))
        XCTAssertEqual(flow.failure, .expiredCode)
        XCTAssertEqual(flow.failure?.message, AuthCopy.expiredCode)
        XCTAssertNotEqual(AuthCopy.invalidCode, AuthCopy.expiredCode)
    }

    func testANetworkFailureIsNeverCalledAWrongCode() {
        var flow = sentFlow()
        flow.verificationFailed(URLError(.notConnectedToInternet), now: t0.addingTimeInterval(10))
        XCTAssertEqual(flow.failure, .connection)
        XCTAssertEqual(flow.failure?.message, Copy.connectionFailure)
    }

    func testTooManyVerifyAttempts() {
        var flow = sentFlow()
        flow.verificationFailed(SupabaseAuthError.server(status: 429, message: "Too many requests"), now: t0)
        XCTAssertEqual(flow.failure, .tooManyRequests)
    }

    // MARK: - Email step

    func testCanSendCodeNeedsARealLookingAddress() {
        XCTAssertFalse(EmailCodeFlow(email: "").canSendCode)
        XCTAssertFalse(EmailCodeFlow(email: "ada@").canSendCode)
        XCTAssertFalse(EmailCodeFlow(email: "ada@example").canSendCode)
        XCTAssertFalse(EmailCodeFlow(email: "@example.com").canSendCode)
        XCTAssertTrue(EmailCodeFlow(email: "  ada@example.com ").canSendCode)
        XCTAssertEqual(EmailCodeFlow(email: "  ada@example.com ").trimmedEmail, "ada@example.com")
    }

    func testARejectedAddressSaysSoAndStaysOnTheEmailStep() {
        var flow = EmailCodeFlow(email: "ada@example.com")
        flow.sendFailed(SupabaseAuthError.server(status: 400, message: "Unable to validate email address: invalid format"), now: t0)
        XCTAssertEqual(flow.failure, .invalidEmail)
        XCTAssertEqual(flow.phase, .enteringEmail)
        flow.email = "ada@example.org"
        flow.codeSent(at: t0)
        XCTAssertNil(flow.failure)
    }

    func testNoCopyContainsADoubleHyphen() {
        let all = [AuthCopy.footer, AuthCopy.invalidCode, AuthCopy.expiredCode, AuthCopy.tooManyRequests,
                   AuthCopy.invalidEmail, AuthCopy.generic, AuthCopy.appleCredentialRevoked,
                   AuthCopy.codeSentTo("a@b.co"), AuthCopy.resendIn(5), AuthCopy.codeResent(to: "a@b.co")]
        for text in all { XCTAssertFalse(text.contains("--"), text) }
    }
}
