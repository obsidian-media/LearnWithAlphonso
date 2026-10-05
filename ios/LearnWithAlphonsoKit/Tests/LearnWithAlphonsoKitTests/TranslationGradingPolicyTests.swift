import XCTest
@testable import LearnWithAlphonsoKit

/// Whether a written translation may be sent to the server (and on to NVIDIA)
/// for a second opinion. The lesson used to be wrapped in the AI-consent gate
/// wholesale, so declining "Not now" popped the learner out of every lesson,
/// including ones with no AI question (BACKLOG 0.0-z #2). Consent is now
/// enforced at the one place a written answer leaves the device instead.
final class TranslationGradingPolicyTests: XCTestCase {
    func testAsksServerOnlyWithConsentNetworkAndToken() {
        XCTAssertTrue(
            TranslationGradingPolicy.mayAskServer(isConnected: true, hasAccessToken: true, hasAIConsent: true))
    }

    /// The property this whole change exists for: a learner who has not
    /// allowed AI processing never has their written answer sent anywhere,
    /// even with a network and a valid session.
    func testNeverAsksServerWithoutConsent() {
        XCTAssertFalse(
            TranslationGradingPolicy.mayAskServer(isConnected: true, hasAccessToken: true, hasAIConsent: false))
    }

    func testDoesNotAskServerOffline() {
        XCTAssertFalse(
            TranslationGradingPolicy.mayAskServer(isConnected: false, hasAccessToken: true, hasAIConsent: true))
    }

    func testDoesNotAskServerWithoutAToken() {
        XCTAssertFalse(
            TranslationGradingPolicy.mayAskServer(isConnected: true, hasAccessToken: false, hasAIConsent: true))
    }

    /// Exhaustive: of the eight combinations, exactly one may ask. A future
    /// edit that loosens any one condition fails here, not in review.
    func testExactlyOneOfEightCombinationsMayAsk() {
        let bools = [false, true]
        var allowed = 0
        for connected in bools {
            for token in bools {
                for consent in bools
                where TranslationGradingPolicy.mayAskServer(
                    isConnected: connected, hasAccessToken: token, hasAIConsent: consent)
                {
                    allowed += 1
                }
            }
        }
        XCTAssertEqual(allowed, 1)
    }
}
