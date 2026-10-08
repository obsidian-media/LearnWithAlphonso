import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class AppleCredentialTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suite = ""

    override func setUp() {
        super.setUp()
        suite = "AppleCredentialTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)!
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testRevokedOrUnknownToAppleSignsOutWithAnExplanation() {
        XCTAssertEqual(AppleCredentialPolicy.decision(for: .revoked), .signOut(notice: AuthCopy.appleCredentialRevoked))
        XCTAssertEqual(AppleCredentialPolicy.decision(for: .notFound), .signOut(notice: AuthCopy.appleCredentialRevoked))
    }

    func testAuthorizedTransferredAndLookupErrorsKeepTheSession() {
        XCTAssertEqual(AppleCredentialPolicy.decision(for: .authorized), .keepSession)
        XCTAssertEqual(AppleCredentialPolicy.decision(for: .transferred), .keepSession)
        XCTAssertEqual(AppleCredentialPolicy.decision(for: .unknown), .keepSession)
    }

    func testOnlyTheAccountThatSignedInWithAppleHereIsChecked() {
        let link = AppleCredentialLink(appleUserID: "001234.abc", supabaseUserID: "u1")
        XCTAssertEqual(AppleCredentialPolicy.appleUserToCheck(link: link, signedInUserID: "u1"), "001234.abc")
        XCTAssertNil(AppleCredentialPolicy.appleUserToCheck(link: link, signedInUserID: "u2"))
        XCTAssertNil(AppleCredentialPolicy.appleUserToCheck(link: nil, signedInUserID: "u1"))
        XCTAssertNil(AppleCredentialPolicy.appleUserToCheck(link: link, signedInUserID: nil))
    }

    func testTheCredentialLinkRoundTripsAndClears() {
        let store = AppleCredentialStore(defaults: defaults)
        XCTAssertNil(store.load())
        let link = AppleCredentialLink(appleUserID: "001234.abc", supabaseUserID: "u1")
        store.save(link)
        XCTAssertEqual(AppleCredentialStore(defaults: defaults).load(), link)
        store.clear()
        XCTAssertNil(store.load())
    }

    func testGivenNamesAreKeptPerAccountAndAllClearTogether() {
        let store = AppleGivenNameStore(defaults: defaults)
        store.save("Zoë", userID: "u1")
        store.save("Ana", userID: "u2")
        XCTAssertEqual(store.load(userID: "u1"), "Zoë")
        XCTAssertEqual(store.load(userID: "u2"), "Ana")
        defaults.set("keep me", forKey: "unrelated.key")
        store.clearAll()
        XCTAssertNil(store.load(userID: "u1"))
        XCTAssertNil(store.load(userID: "u2"))
        XCTAssertEqual(defaults.string(forKey: "unrelated.key"), "keep me")
    }
}
