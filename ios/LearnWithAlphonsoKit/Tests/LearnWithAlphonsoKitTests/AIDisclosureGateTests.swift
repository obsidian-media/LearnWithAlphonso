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

    func testAcknowledgementDoesNotLeakAcrossSuites() {
        let otherSuite = UserDefaults(suiteName: "AIDisclosureGateTests.other")!
        otherSuite.removePersistentDomain(forName: "AIDisclosureGateTests.other")
        AIDisclosureGate.acknowledge(in: defaults)
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: otherSuite))
        otherSuite.removePersistentDomain(forName: "AIDisclosureGateTests.other")
    }
}
