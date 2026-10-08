import XCTest
@testable import LearnWithAlphonsoKit

/// What the whole-screen AI gate shows. The rules that keep a live conversation (transcript, typed text) alive live
/// here, not in the view.
final class AIConsentGateTests: XCTestCase {
    private let allStatuses: [AIConsentStatus] = [.loading, .granted, .denied, .unavailable]

    /// Once the screen has been shown it is never replaced by a spinner or a prompt, whatever the setting does.
    func testAShownScreenIsNeverUnmounted() {
        for status in allStatuses {
            for didRefresh in [false, true] {
                let result = AIConsentGate.presentation(status: status, hasBeenShown: true, didRefresh: didRefresh)
                guard case .content = result else {
                    return XCTFail("\(status) unmounted a shown screen: \(result)")
                }
            }
        }
    }

    func testAShownScreenIsCoveredByTheRightPrompt() {
        XCTAssertEqual(
            AIConsentGate.presentation(status: .denied, hasBeenShown: true, didRefresh: true),
            .content(covered: .consent))
        XCTAssertEqual(
            AIConsentGate.presentation(status: .unavailable, hasBeenShown: true, didRefresh: true),
            .content(covered: .retry))
        XCTAssertEqual(
            AIConsentGate.presentation(status: .granted, hasBeenShown: true, didRefresh: true),
            .content(covered: nil))
        XCTAssertEqual(
            AIConsentGate.presentation(status: .loading, hasBeenShown: true, didRefresh: true),
            .content(covered: nil), "a read in flight never covers a live conversation")
    }

    /// A refusal mid-conversation covers at once, even though this gate's own read has not finished.
    func testARefusalCoversALiveScreenBeforeTheGatesOwnReadFinishes() {
        XCTAssertEqual(
            AIConsentGate.presentation(status: .denied, hasBeenShown: true, didRefresh: false),
            .content(covered: .consent))
    }

    func testAnUnreadableSettingOffersARetryNeverTheConsentSheet() {
        XCTAssertEqual(
            AIConsentGate.presentation(status: .unavailable, hasBeenShown: false, didRefresh: true),
            .prompt(.retry))
        XCTAssertEqual(
            AIConsentGate.presentation(status: .unavailable, hasBeenShown: false, didRefresh: false),
            .prompt(.retry))
    }

    /// A remembered "denied" from before this gate's own read must not ask someone who consented on another device.
    func testADeniedStatusBeforeTheGatesOwnReadIsASpinner() {
        XCTAssertEqual(
            AIConsentGate.presentation(status: .denied, hasBeenShown: false, didRefresh: false), .spinner)
        XCTAssertEqual(
            AIConsentGate.presentation(status: .denied, hasBeenShown: false, didRefresh: true), .prompt(.consent))
    }

    func testNothingIsMountedWhileLoadingAndTheScreenMountsWhenGranted() {
        XCTAssertEqual(AIConsentGate.presentation(status: .loading, hasBeenShown: false, didRefresh: false), .spinner)
        XCTAssertEqual(AIConsentGate.presentation(status: .loading, hasBeenShown: false, didRefresh: true), .spinner)
        XCTAssertEqual(
            AIConsentGate.presentation(status: .granted, hasBeenShown: false, didRefresh: false),
            .content(covered: nil))
    }

    func testAnUnshownScreenIsNeverMountedWithoutConsent() {
        for status in allStatuses where status != .granted {
            for didRefresh in [false, true] {
                let result = AIConsentGate.presentation(status: status, hasBeenShown: false, didRefresh: didRefresh)
                if case .content = result { XCTFail("\(status) mounted a screen that was never shown") }
            }
        }
    }
}
