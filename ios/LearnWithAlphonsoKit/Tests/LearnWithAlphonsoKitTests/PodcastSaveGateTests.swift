import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastSaveGateTests: XCTestCase {
    func testAnEpisodeWithNoRowSavesWithoutAGuard() {
        var gate = PodcastSaveGate()
        gate.beginEpisode(lastSeenUpdatedAt: nil)
        XCTAssertTrue(gate.canSave)
        XCTAssertNil(gate.lastSeenUpdatedAt, "nil is what makes PodcastClient upsert")
    }

    func testTheNextSaveIsGuardedOnWhatTheServerStored() {
        var gate = PodcastSaveGate()
        gate.beginEpisode(lastSeenUpdatedAt: nil)
        gate.recordSaved(updatedAt: "2026-10-12T10:00:05+00:00")
        XCTAssertEqual(gate.lastSeenUpdatedAt, "2026-10-12T10:00:05+00:00")
    }

    func testAStaleWriteSuspendsSavesUntilTheLearnerActs() {
        var gate = PodcastSaveGate(lastSeenUpdatedAt: "old")
        gate.recordStale()
        XCTAssertFalse(gate.canSave, "a background flush must not clobber another device's fresher position")
        gate.userStartedPlayback()
        XCTAssertTrue(gate.canSave)
        XCTAssertNil(gate.lastSeenUpdatedAt, "a fresh learner action is a fresh observation: upsert it")
    }

    func testUnauthorizedSuspendsSavesAcrossEpisodesUntilTheLearnerActs() {
        var gate = PodcastSaveGate()
        gate.recordUnauthorized()
        gate.beginEpisode(lastSeenUpdatedAt: "x")
        XCTAssertFalse(gate.canSave)
        gate.userStartedPlayback()
        XCTAssertTrue(gate.canSave, "after a token refresh the next play retries once")
    }

    func testBeginningAnEpisodeClearsAPreviousEpisodesStaleState() {
        var gate = PodcastSaveGate(lastSeenUpdatedAt: "a")
        gate.recordStale()
        gate.beginEpisode(lastSeenUpdatedAt: "b")
        XCTAssertTrue(gate.canSave)
        XCTAssertEqual(gate.lastSeenUpdatedAt, "b")
    }

    func testUserStartedPlaybackKeepsAHealthyObservation() {
        var gate = PodcastSaveGate(lastSeenUpdatedAt: "a")
        gate.userStartedPlayback()
        XCTAssertEqual(gate.lastSeenUpdatedAt, "a")
    }

    func testASaveFromBeforeAnAccountChangeIsNotAcceptedByTheNewAccountsGate() {
        var gate = PodcastSaveGate(lastSeenUpdatedAt: "old-account")
        let ticket = gate.epoch
        XCTAssertTrue(gate.accepts(ticket))
        gate.resetForAccountChange()
        XCTAssertFalse(gate.accepts(ticket), "a chained save from the previous account must not touch the new gate")
        XCTAssertTrue(gate.accepts(gate.epoch))
    }

    func testAnAccountChangeClearsEverythingTheOldAccountLeftOnTheGate() {
        var gate = PodcastSaveGate(lastSeenUpdatedAt: "old-account")
        gate.recordStale()
        gate.recordUnauthorized()
        gate.resetForAccountChange()
        XCTAssertNil(gate.lastSeenUpdatedAt)
        XCTAssertTrue(gate.canSave)
    }

    func testEveryAccountChangeGetsItsOwnEpoch() {
        var gate = PodcastSaveGate()
        let first = gate.epoch
        gate.resetForAccountChange()
        let second = gate.epoch
        gate.resetForAccountChange()
        XCTAssertNotEqual(first, second)
        XCTAssertNotEqual(second, gate.epoch)
        XCTAssertFalse(gate.accepts(first))
    }
}
