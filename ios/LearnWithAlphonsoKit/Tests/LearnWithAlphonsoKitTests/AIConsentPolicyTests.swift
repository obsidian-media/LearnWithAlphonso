import XCTest
@testable import LearnWithAlphonsoKit

/// Review was blocked by a whole-sheet consent wall. Only screens that ARE AI may be walled; everything else
/// works without consent, item by item.
final class AIConsentPolicyTests: XCTestCase {
    func testOnlyTheAIScreensMayBeWalled() {
        let walled = AIConsentSurface.allCases.filter(AIConsentPolicy.blocksWholeScreen)
        XCTAssertEqual(Set(walled), [.hector, .conversation, .campaign])
    }

    func testReviewTranslateItemWithoutConsentIsLocalWithAnOptIn() {
        XCTAssertEqual(AIConsentPolicy.translateMode(on: .review, consentGranted: false), .localWithOptIn)
        XCTAssertEqual(AIConsentPolicy.translateMode(on: .review, consentGranted: true), .ai)
    }

    func testReviewSpeakItemWithoutConsentIsTypedWithAnOptIn() {
        XCTAssertEqual(AIConsentPolicy.speakMode(on: .review, consentGranted: false), .localWithOptIn)
        XCTAssertEqual(AIConsentPolicy.speakMode(on: .review, consentGranted: true), .ai)
    }

    func testPlacementNeverUsesAIEvenWithConsent() {
        for granted in [false, true] {
            XCTAssertEqual(AIConsentPolicy.translateMode(on: .placement, consentGranted: granted), .local)
            XCTAssertEqual(AIConsentPolicy.speakMode(on: .placement, consentGranted: granted), .local)
        }
    }

    func testNoSurfaceUsesAIWithoutConsent() {
        for surface in AIConsentSurface.allCases {
            XCTAssertNotEqual(AIConsentPolicy.translateMode(on: surface, consentGranted: false), .ai, "\(surface)")
            XCTAssertNotEqual(AIConsentPolicy.speakMode(on: surface, consentGranted: false), .ai, "\(surface)")
        }
    }

    func testSpeakFallbackCopyNamesTheRealCause() {
        XCTAssertEqual(
            AIConsentCopy.speakFallback(micUnavailable: false, isConnected: true, hasAIConsent: false),
            AIConsentCopy.speakFallbackNoConsent)
        XCTAssertEqual(
            AIConsentCopy.speakFallback(micUnavailable: false, isConnected: false, hasAIConsent: true),
            "You're offline, so speech can't be checked. Type the phrase instead.")
        XCTAssertEqual(
            AIConsentCopy.speakFallback(micUnavailable: true, isConnected: true, hasAIConsent: true),
            "The microphone isn't available. Type the phrase instead.")
        XCTAssertFalse(
            AIConsentCopy.speakFallback(micUnavailable: false, isConnected: true, hasAIConsent: false)
                .contains("offline"))
        XCTAssertFalse(AIConsentCopy.speakFallbackNoConsent.contains("--"))
    }
}
