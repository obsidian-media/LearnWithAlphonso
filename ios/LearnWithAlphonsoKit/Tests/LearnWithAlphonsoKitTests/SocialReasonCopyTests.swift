import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Reads the SAME fixture the web pins (Fixtures/social-reason.fixtures.json is a byte copy of
/// src/lib/social-reason.fixtures.json, guarded by src/lib/social-reason-copy.test.ts, which also fails when a
/// migration returns a code the fixture does not map). Change both together.
final class SocialReasonCopyTests: XCTestCase {
    private func fixtures() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "social-reason.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    func testEveryReasonHasTheSharedWordingAndNoneFallsThrough() throws {
        let reasons = try XCTUnwrap(fixtures()["reasons"] as? [String: String])
        XCTAssertGreaterThanOrEqual(reasons.count, 28)
        for (code, text) in reasons {
            XCTAssertTrue(SocialReasonCopy.isKnown(code), "\(code) reaches the generic fallback")
            XCTAssertEqual(SocialReasonCopy.message(for: code), text, code)
        }
        XCTAssertEqual(SocialReasonCopy.knownCodes, Set(reasons.keys))
    }

    func testNilIsAConnectionFailureAndUnknownIsGeneric() throws {
        let f = try fixtures()
        XCTAssertEqual(SocialReasonCopy.message(for: nil), f["connection"] as? String)
        XCTAssertEqual(SocialReasonCopy.message(for: "something-new"), f["generic"] as? String)
        XCTAssertEqual(SocialReasonCopy.generic, f["generic"] as? String)
        XCTAssertEqual(SocialReasonCopy.nameSaveFailed, f["nameSaveFailed"] as? String)
    }

    func testSharedCopyConstants() throws {
        let f = try fixtures()
        let reasons = try XCTUnwrap(f["reasons"] as? [String: String])
        XCTAssertEqual(Copy.connectionFailure, f["connection"] as? String)
        XCTAssertEqual(Copy.nameNotAllowed, reasons["blocked-content"])
        XCTAssertEqual(Copy.savedOffline, "Saved. It will sync when you're back online.")
    }

    func testFailureMessageNamesTheRealCause() {
        XCTAssertEqual(SocialReasonCopy.failureMessage(for: URLError(.notConnectedToInternet)), Copy.connectionFailure)
        XCTAssertEqual(SocialReasonCopy.failureMessage(for: ProgressSyncError.badResponse), Copy.connectionFailure)
        XCTAssertEqual(SocialReasonCopy.failureMessage(for: ProgressSyncError.server(status: 401, message: nil)),
                       SocialReasonCopy.message(for: "unauthenticated"))
        XCTAssertEqual(SocialReasonCopy.failureMessage(for: ProgressSyncError.server(status: 500, message: nil)),
                       SocialReasonCopy.generic)
        XCTAssertEqual(SocialReasonCopy.failureMessage(for: ProgressSyncError.invalidPayload), SocialReasonCopy.generic)
    }

    func testNameSaveMessageMapsTheServerCodes() {
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(status: 400, message: "blocked-content")),
                       Copy.nameNotAllowed)
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(status: 400, message: "invalid-name")),
                       SocialReasonCopy.message(for: "invalid-name"))
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(
            status: 400, message: "new row for relation \"profiles\" violates check constraint \"profiles_display_name_length_chk\"")),
                       SocialReasonCopy.message(for: "invalid-name"))
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: URLError(.timedOut)), Copy.connectionFailure)
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(status: 500, message: nil)),
                       SocialReasonCopy.nameSaveFailed)
    }

    func testNameSaveMessageSendsAnExpiredSessionToSignIn() {
        let signIn = SocialReasonCopy.message(for: "unauthenticated")
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(status: 401, message: nil)), signIn)
        XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: ProgressSyncError.server(status: 401, message: "JWT expired")), signIn)
    }
}
