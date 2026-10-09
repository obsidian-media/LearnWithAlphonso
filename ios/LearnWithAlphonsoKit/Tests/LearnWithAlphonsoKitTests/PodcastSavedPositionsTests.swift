import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastSavedPositionsTests: XCTestCase {
    private func episode(position: Int, updatedAt: String?) -> PodcastEpisode {
        PodcastEpisode(
            id: "e1", folderID: "f1", slug: "s", title: "T", description: nil,
            audioURL: URL(string: "https://example.com/a.mp3")!, durationSeconds: 300,
            positionSeconds: position, playbackUpdatedAt: updatedAt)
    }

    func testAnEpisodeListedBeforeThePlayWasSavedResumesWhereTheLearnerStopped() {
        var saved = PodcastSavedPositions()
        let stale = episode(position: 6, updatedAt: "2026-10-09T10:00:06Z")
        saved.noteSeen(stale)
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        let resumed = saved.applying(to: stale)
        XCTAssertEqual(resumed.positionSeconds, 45)
        XCTAssertEqual(resumed.playbackUpdatedAt, "2026-10-09T10:00:45Z",
                       "the next save must guard on what this device last stored, not on the stale snapshot")
    }

    func testASnapshotFromAnotherDeviceWinsEvenWhenItsClockIsBehind() {
        var saved = PodcastSavedPositions()
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        // Older by time, but this device never saw or stored that stamp: another device wrote it.
        let foreign = episode(position: 120, updatedAt: "2026-10-09T09:00:00Z")
        XCTAssertEqual(saved.applying(to: foreign).positionSeconds, 120)
        XCTAssertEqual(saved.applying(to: foreign).playbackUpdatedAt, "2026-10-09T09:00:00Z")
    }

    func testAFresherUnknownSnapshotAlsoWins() {
        var saved = PodcastSavedPositions()
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        let fresh = episode(position: 120, updatedAt: "2026-10-09T11:00:00Z")
        XCTAssertEqual(saved.applying(to: fresh).positionSeconds, 120)
    }

    func testTheSnapshotPlaybackStartedFromIsRecognisedAsOurOwnHistory() {
        var saved = PodcastSavedPositions()
        let original = episode(position: 6, updatedAt: "2026-10-09T10:00:06Z")
        saved.noteSeen(original)
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        XCTAssertEqual(saved.applying(to: original).positionSeconds, 45)
    }

    func testASnapshotWithNoRowIsReplacedByWhatWeStored() {
        var saved = PodcastSavedPositions()
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        XCTAssertEqual(saved.applying(to: episode(position: 0, updatedAt: nil)).positionSeconds, 45)
    }

    func testAnEpisodeWithNothingRecordedIsUnchanged() {
        let saved = PodcastSavedPositions()
        let e = episode(position: 6, updatedAt: nil)
        XCTAssertEqual(saved.applying(to: e), e)
    }

    func testAFinishedEpisodeResumesFromTheStart() {
        var saved = PodcastSavedPositions()
        let listed = episode(position: 200, updatedAt: "2026-10-09T10:00:00Z")
        saved.noteSeen(listed)
        saved.record(episodeID: "e1", position: 0, updatedAt: "2026-10-09T10:05:00Z")
        XCTAssertEqual(saved.applying(to: listed).positionSeconds, 0)
    }

    func testAnAccountChangeForgetsEverything() {
        var saved = PodcastSavedPositions()
        saved.record(episodeID: "e1", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        saved.reset()
        let e = episode(position: 6, updatedAt: "2026-10-09T10:00:06Z")
        XCTAssertEqual(saved.applying(to: e), e)
    }

    func testAnotherEpisodeIsUntouched() {
        var saved = PodcastSavedPositions()
        saved.record(episodeID: "other", position: 45, updatedAt: "2026-10-09T10:00:45Z")
        let e = episode(position: 6, updatedAt: "2026-10-09T10:00:06Z")
        XCTAssertEqual(saved.applying(to: e), e)
    }
}
