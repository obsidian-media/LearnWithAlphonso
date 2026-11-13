import XCTest
@testable import LearnWithAlphonsoKit

final class AccountSuspensionTests: XCTestCase {
    func testCopyIsPlainAndNamesTheSupportAddress() {
        XCTAssertEqual(AccountSuspension.title, "This account is suspended.")
        XCTAssertEqual(
            AccountSuspension.body,
            "If you think this is a mistake, contact support at support@alphonsoecosystem.app."
        )
        XCTAssertEqual(AccountSuspension.message, "This account is suspended. If you think this is a mistake, contact support at support@alphonsoecosystem.app.")
    }

    func testUserBannedSignInErrorMapsToSuspended() {
        XCTAssertTrue(AccountSuspension.isSuspended(SupabaseAuthError.server(status: 400, message: "User is banned")))
        XCTAssertTrue(AccountSuspension.isSuspended(SupabaseAuthError.server(status: 403, message: "account_suspended")))
    }

    func testOrdinaryFailuresAreNotSuspensions() {
        XCTAssertFalse(AccountSuspension.isSuspended(SupabaseAuthError.server(status: 400, message: "Token has expired or is invalid")))
        XCTAssertFalse(AccountSuspension.isSuspended(SupabaseAuthError.server(status: 429, message: nil)))
        XCTAssertFalse(AccountSuspension.isSuspended(SupabaseAuthError.badResponse))
        XCTAssertFalse(AccountSuspension.isSuspended(URLError(.notConnectedToInternet)))
    }

    func testApiAnswerIsRecognisedOnlyAs403WithTheMarker() {
        let body = Data(#"{"error":"account_suspended"}"#.utf8)
        XCTAssertTrue(AccountSuspension.isSuspended(status: 403, body: body))
        XCTAssertFalse(AccountSuspension.isSuspended(status: 401, body: body))
        XCTAssertFalse(AccountSuspension.isSuspended(status: 403, body: Data(#"{"error":"nope"}"#.utf8)))
        XCTAssertFalse(AccountSuspension.isSuspended(status: 403, body: nil))
    }
}
