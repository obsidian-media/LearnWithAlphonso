import XCTest
@testable import LearnWithAlphonsoKit

final class BotCheckGateTests: XCTestCase {
    func testWaitsForTheFirstToken() {
        var gate = BotCheckGate()
        XCTAssertFalse(gate.canSend)
        gate.receive(["type": "token", "token": "t1"])
        XCTAssertTrue(gate.canSend)
    }

    func testATokenIsSpentOnceThenWaitsForTheNextOne() {
        var gate = BotCheckGate()
        gate.receive(["type": "token", "token": "t1"])
        XCTAssertEqual(gate.spend(), "t1")
        XCTAssertNil(gate.spend())
        XCTAssertFalse(gate.canSend)
        gate.receive(["type": "token", "token": "t2"])
        XCTAssertEqual(gate.spend(), "t2")
    }

    func testAnExpiredTokenIsNeverSent() {
        var gate = BotCheckGate()
        gate.receive(["type": "token", "token": "t1"])
        gate.receive(["type": "expired"])
        XCTAssertFalse(gate.canSend)
        XCTAssertNil(gate.spend())
    }

    func testNoBotCheckConfiguredSendsWithoutAToken() {
        var gate = BotCheckGate()
        gate.receive(["type": "unavailable"])
        XCTAssertTrue(gate.canSend)
        XCTAssertNil(gate.spend())
        XCTAssertTrue(gate.canSend)
    }

    func testAPageThatNeverAnswersDoesNotBlockSignIn() {
        var gate = BotCheckGate()
        gate.pageTimedOut()
        XCTAssertEqual(gate.state, .unavailable)
        XCTAssertTrue(gate.canSend)
    }

    func testOnceThePageHasAnsweredASlowTokenIsWaitedFor() {
        var gate = BotCheckGate()
        gate.receive(["type": "expired"])
        gate.pageTimedOut()
        XCTAssertEqual(gate.state, .waiting)
        XCTAssertFalse(gate.canSend)
    }

    func testIgnoresMalformedMessages() {
        var gate = BotCheckGate()
        gate.receive("token")
        gate.receive(["type": "token"])
        gate.receive(["type": "token", "token": ""])
        gate.receive(["type": "other"])
        XCTAssertEqual(gate.state, .waiting)
        XCTAssertFalse(gate.heardFromPage)
    }
}
