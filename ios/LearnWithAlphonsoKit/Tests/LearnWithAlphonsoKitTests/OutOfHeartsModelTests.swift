import XCTest
@testable import LearnWithAlphonsoKit

final class OutOfHeartsModelTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_000)

    func testCountdownIsMSSRoundedUpLikeTheWeb() {
        let m = OutOfHeartsModel(refillAt: now.addingTimeInterval(125.2))
        XCTAssertEqual(m.countdown(now: now), "2:06")
        XCTAssertEqual(m.countdown(now: now.addingTimeInterval(124.5)), "0:01")
        XCTAssertNil(m.countdown(now: now.addingTimeInterval(126)))
    }
    func testRefillDueFlipsAtTheTimestamp() {
        let m = OutOfHeartsModel(refillAt: now.addingTimeInterval(10))
        XCTAssertFalse(m.isRefillDue(now: now))
        XCTAssertTrue(m.isRefillDue(now: now.addingTimeInterval(10)))
        XCTAssertFalse(OutOfHeartsModel(refillAt: nil).isRefillDue(now: now))
    }
    func testMessageNamesTheCountdownOrSaysShortly() {
        XCTAssertEqual(OutOfHeartsModel(refillAt: now.addingTimeInterval(61)).message(now: now),
                       "You've used all your hearts for now. They refill automatically in 1:01.")
        XCTAssertEqual(OutOfHeartsModel(refillAt: nil).message(now: now),
                       "You've used all your hearts for now. They'll refill again shortly.")
    }
    /// There is always a way forward. Buy needs the network; practice and review never do.
    func testBuyOnlyOnlineAndPracticeAlwaysOffered() {
        let m = OutOfHeartsModel(refillAt: nil)
        XCTAssertTrue(m.showsBuy(isOnline: true))
        XCTAssertFalse(m.showsBuy(isOnline: false))
        XCTAssertEqual(OutOfHeartsModel.practiceInsteadTitle, "Review instead")
        XCTAssertEqual(OutOfHeartsModel.buyTitle, "Use 50 XP for a heart")
    }
    func testBuyFailureCopyMatchesTheWeb() {
        XCTAssertNil(OutOfHeartsModel.buyFailureMessage(.ok(hearts: 1, xp: 0)))
        XCTAssertEqual(OutOfHeartsModel.buyFailureMessage(.heartsFull(hearts: 5)), "Hearts already full.")
        XCTAssertEqual(OutOfHeartsModel.buyFailureMessage(.insufficientXp(xp: 20)), "Not enough XP for a heart. You have 20 XP in this course.")
        XCTAssertEqual(OutOfHeartsModel.buyFailureMessage(.insufficientXp(xp: nil)), "Not enough XP for a heart.")
        XCTAssertEqual(OutOfHeartsModel.buyFailureMessage(.signedOut), "You've been signed out. Please sign in again.")
    }
}
