import XCTest
@testable import LearnWithAlphonsoKit

final class AIDisclosureGateTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: #file)
        defaults.removePersistentDomain(forName: #file)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: #file)
        defaults = nil
        super.tearDown()
    }

    func testFreshInstallHasNotAcknowledged() {
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults))
    }

    func testAcknowledgePersistsForReturningUser() {
        AIDisclosureGate.acknowledge(in: defaults)
        XCTAssertTrue(AIDisclosureGate.isAcknowledged(in: defaults))
    }

    /// Build 48 turned a forced "Got it" into a real Allow / Not now choice
    /// naming the providers. A "Got it" from an older build is not that
    /// consent, so it must not count.
    func testLegacyGotItAcknowledgementDoesNotCountAsConsent() {
        defaults.set(true, forKey: "aiDisclosureAcknowledged")
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults))
    }

    func testAcknowledgementDoesNotLeakAcrossSuites() {
        let otherSuite = UserDefaults(suiteName: "AIDisclosureGateTests.other")!
        otherSuite.removePersistentDomain(forName: "AIDisclosureGateTests.other")
        AIDisclosureGate.acknowledge(in: defaults)
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: otherSuite))
        otherSuite.removePersistentDomain(forName: "AIDisclosureGateTests.other")
    }
}
