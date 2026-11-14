import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The state mapping behind the redesigned Duels, League and Teams screens.
final class SocialPresentationTests: XCTestCase {
    // MARK: Duels

    func testTheDuelsSummaryNamesOnlyThePartsThatAreNotZero() {
        XCTAssertEqual(DuelsPresentation.summary(pending: 1, active: 1, finished: 3), "1 pending \u{00B7} 1 active \u{00B7} 3 finished")
        XCTAssertEqual(DuelsPresentation.summary(pending: 0, active: 2, finished: 0), "2 active")
        XCTAssertEqual(DuelsPresentation.summary(pending: 0, active: 0, finished: 4), "4 finished")
        XCTAssertNil(DuelsPresentation.summary(pending: 0, active: 0, finished: 0))
    }

    func testTheShareIsTheLearnersPortionOfTheXPEarned() {
        XCTAssertEqual(DuelsPresentation.share(mine: 120, theirs: 95), 120.0 / 215.0, accuracy: 0.0001)
        XCTAssertEqual(DuelsPresentation.share(mine: 0, theirs: 40), 0, accuracy: 0.0001)
        XCTAssertEqual(DuelsPresentation.share(mine: 40, theirs: 0), 1, accuracy: 0.0001)
    }

    func testTheShareIsEvenWhenNobodyHasEarnedAnythingAndNeverNegative() {
        XCTAssertEqual(DuelsPresentation.share(mine: 0, theirs: 0), 0.5, accuracy: 0.0001)
        // A start higher than the current XP (a clock or data slip) must not draw a bar below zero or above full.
        XCTAssertEqual(DuelsPresentation.share(mine: -5, theirs: 10), 0, accuracy: 0.0001)
        XCTAssertEqual(DuelsPresentation.share(mine: 10, theirs: -5), 1, accuracy: 0.0001)
    }

    func testAFinishedDuelReadsAsWonLostTiedOrDeclinedForThisLearner() {
        let won = DuelsPresentation.result(status: "completed", winnerID: "me", myID: "me")
        XCTAssertEqual(won.label, "You won")
        XCTAssertEqual(won.tone, .won)
        let lost = DuelsPresentation.result(status: "completed", winnerID: "them", myID: "me")
        XCTAssertEqual(lost.label, "You lost")
        XCTAssertEqual(lost.tone, .lost)
        let tied = DuelsPresentation.result(status: "completed", winnerID: nil, myID: "me")
        XCTAssertEqual(tied.label, "Tied")
        XCTAssertEqual(tied.tone, .tied)
        // Declined wins over a stray winner on the row.
        let declined = DuelsPresentation.result(status: "declined", winnerID: "me", myID: "me")
        XCTAssertEqual(declined.label, "Declined")
        XCTAssertEqual(declined.tone, .declined)
    }

    func testAWinnerIsNeverTheLearnerWhenTheLearnerIsUnknown() {
        XCTAssertEqual(DuelsPresentation.result(status: "completed", winnerID: "x", myID: nil).tone, .lost)
    }

    // MARK: League

    func testOnlyTheTopThreeRanksGetAMedal() {
        XCTAssertEqual(LeaguePresentation.medal(rank: 1), .gold)
        XCTAssertEqual(LeaguePresentation.medal(rank: 2), .silver)
        XCTAssertEqual(LeaguePresentation.medal(rank: 3), .bronze)
        XCTAssertNil(LeaguePresentation.medal(rank: 4))
        XCTAssertNil(LeaguePresentation.medal(rank: 0))
    }

    func testTheLeagueTitleUsesTheTierDisplayName() {
        XCTAssertEqual(LeaguePresentation.tierTitle(tier: "ruby"), "Treetop league")
        XCTAssertEqual(LeaguePresentation.tierTitle(tier: "bronze"), "Sprout league")
        XCTAssertNil(LeaguePresentation.tierTitle(tier: nil))
        XCTAssertNil(LeaguePresentation.tierTitle(tier: ""))
    }

    func testTheGoalChipsAreThePurposeTheLevelAndTheDate() {
        let chips = PathGoalChips.labels(purposeID: "travel", targetLevel: "B1", targetDate: "2027-05-10")
        XCTAssertEqual(chips, ["Travel", "Finish B1", "by " + GoalCopy.formatDate("2027-05-10")])
    }

    func testAnUnknownOrMissingPurposeLeavesItOutRatherThanInventingOne() {
        for purpose in [nil, "", "teleport"] as [String?] {
            let chips = PathGoalChips.labels(purposeID: purpose, targetLevel: "A2", targetDate: "2027-01-02")
            XCTAssertEqual(chips.count, 2)
            XCTAssertEqual(chips.first, "Finish A2")
        }
    }

    // MARK: Teams

    func testJoinAndCreateNeedSomethingTyped() {
        XCTAssertFalse(TeamsPresentation.canJoin(code: ""))
        XCTAssertFalse(TeamsPresentation.canJoin(code: "   "))
        XCTAssertTrue(TeamsPresentation.canJoin(code: "K7MQ2X"))
        XCTAssertFalse(TeamsPresentation.canCreate(name: " \n"))
        XCTAssertTrue(TeamsPresentation.canCreate(name: "Night Owls"))
    }
}
