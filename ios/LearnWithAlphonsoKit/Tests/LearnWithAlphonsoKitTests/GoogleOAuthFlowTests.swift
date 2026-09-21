import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class GoogleOAuthFlowTests: XCTestCase {
    func testChallengeForVerifierMatchesAKnownS256Vector() {
        // echo -n "test-verifier-value" | sha256sum, base64url-encoded.
        XCTAssertEqual(
            SupabaseOAuthFlow.challenge(forVerifier: "test-verifier-value"),
            "R-yFp3ykg184xTSr9BXHiHtbqWZXIG_H4B3K5EWSDzM"
        )
    }

    func testMakePKCEChallengeProducesAUniqueUnpaddedUrlSafeVerifierAndAMatchingChallenge() {
        let first = SupabaseOAuthFlow.makePKCEChallenge()
        let second = SupabaseOAuthFlow.makePKCEChallenge()

        XCTAssertNotEqual(first.verifier, second.verifier)
        XCTAssertFalse(first.verifier.contains("+"))
        XCTAssertFalse(first.verifier.contains("/"))
        XCTAssertFalse(first.verifier.contains("="))
        XCTAssertEqual(first.challenge, SupabaseOAuthFlow.challenge(forVerifier: first.verifier))
    }

    func testAuthorizeURLIncludesProviderRedirectAndChallenge() {
        let url = SupabaseOAuthFlow.authorizeURL(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            redirectTo: "com.obsidianmedia.learnwithalphonso://login-callback",
            challenge: GooglePKCEChallenge(verifier: "v", challenge: "c")
        )

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.scheme, "https")
        XCTAssertEqual(components.host, "example.supabase.co")
        XCTAssertEqual(components.path, "/auth/v1/authorize")
        let items = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(items["provider"] ?? nil, "google")
        XCTAssertEqual(items["redirect_to"] ?? nil, "com.obsidianmedia.learnwithalphonso://login-callback")
        XCTAssertEqual(items["code_challenge"] ?? nil, "c")
        XCTAssertEqual(items["code_challenge_method"] ?? nil, "s256")
    }

    func testAuthorizationCodeExtractsTheCodeQueryItemFromACallbackURL() {
        let url = URL(string: "com.obsidianmedia.learnwithalphonso://login-callback?code=abc123&state=xyz")!
        XCTAssertEqual(SupabaseOAuthFlow.authorizationCode(from: url), "abc123")
    }

    func testAuthorizationCodeReturnsNilWhenTheCallbackHasNoCode() {
        let url = URL(string: "com.obsidianmedia.learnwithalphonso://login-callback?error=access_denied")!
        XCTAssertNil(SupabaseOAuthFlow.authorizationCode(from: url))
    }
}
