import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The Kit half of offline download (Phase 3). Everything with a decision
/// in it lives here because `ios-swift-tests` is the only automated
/// coverage this feature can have: `ios-app-build` compiles the app target
/// and runs nothing, and swift.exe is blocked on the development machine,
/// so these were written without being run locally.
final class PodcastCacheTests: XCTestCase {
    private func entry(
        id: String = "e1",
        bytes: Int = 100,
        etag: String? = "v1",
        storedDuration: Int = 172,
        lastPlayed: Date? = nil
    ) -> PodcastCacheEntry {
        PodcastCacheEntry(
            episodeID: id,
            bytes: bytes,
            etag: etag,
            storedDurationSeconds: storedDuration,
            lastPlayed: lastPlayed
        )
    }

    // MARK: - Paths

    func testFileNameIsDerivedFromTheEpisodeID() {
        // Keyed by id, not slug or title: a republished episode keeps its
        // id, and a renamed one must not orphan its own cached file.
        let id = "11111111-1111-1111-1111-111111111111"
        let name = PodcastCache.fileName(episodeID: id)
        XCTAssertTrue(name.hasSuffix(".mp3"))
        XCTAssertTrue(name.contains(id))
    }

    func testFileNameContainsNoPathSeparators() {
        // The id comes from the server. Treating it as a path component
        // without checking is how "../" escapes the cache directory.
        let name = PodcastCache.fileName(episodeID: "../../etc/passwd")
        XCTAssertFalse(name.contains("/"))
        XCTAssertFalse(name.contains(".."))
    }

    func testFileNameRejectsBackslashesToo() {
        let name = PodcastCache.fileName(episodeID: "..\\..\\windows")
        XCTAssertFalse(name.contains("\\"))
        XCTAssertFalse(name.contains(".."))
    }

    func testTemporaryNameDiffersFromTheFinalName() {
        // A file exists at its final path only when complete, so the two
        // must never collide.
        XCTAssertNotEqual(
            PodcastCache.fileName(episodeID: "abc"),
            PodcastCache.temporaryFileName(episodeID: "abc")
        )
    }

    // MARK: - Download state

    func testDownloadStateIsEquatableForViewUpdates() {
        XCTAssertEqual(PodcastDownloadState.downloading(progress: 0.5), .downloading(progress: 0.5))
        XCTAssertNotEqual(PodcastDownloadState.notDownloaded, .downloaded(bytes: 1))
    }

    // MARK: - Budget (Review Focus #5)

    func testAllowsADownloadThatFitsTheBudget() {
        XCTAssertTrue(PodcastCacheBudget.canAdd(bytes: 50, to: [entry(bytes: 100)], budget: 200))
    }

    func testRefusesADownloadThatWouldExceedTheBudget() {
        XCTAssertFalse(PodcastCacheBudget.canAdd(bytes: 50, to: [entry(bytes: 180)], budget: 200))
    }

    // The budget is a parameter at every level precisely so this test can
    // exist. At the 500 MB default, with a 1.3 MB library, the refusal path
    // could never run -- a guard that cannot execute, which is the defect
    // the original eviction policy had.
    func testTheBudgetIsInjectableSoRefusalIsReachableAtRealisticSizes() {
        let oneEpisode = entry(bytes: 1_378_473)
        XCTAssertFalse(PodcastCacheBudget.canAdd(bytes: 1_378_473, to: [oneEpisode], budget: 2_000_000))
        XCTAssertTrue(PodcastCacheBudget.canAdd(bytes: 1_378_473, to: [oneEpisode], budget: 500_000_000))
    }

    func testSuggestsTheLeastRecentlyPlayedFirst() {
        // Least recently PLAYED, not downloaded: the episode someone keeps
        // returning to is the last thing to propose removing.
        let old = entry(id: "old", bytes: 100, lastPlayed: Date(timeIntervalSince1970: 0))
        let fresh = entry(id: "fresh", bytes: 100, lastPlayed: Date())
        let candidates = PodcastCacheBudget.deletionCandidates(
            in: [fresh, old], needing: 50, budget: 200
        )
        XCTAssertEqual(candidates.first?.episodeID, "old")
    }

    func testANeverPlayedDownloadIsOfferedBeforeAPlayedOne() {
        let neverPlayed = entry(id: "never", bytes: 100, lastPlayed: nil)
        let played = entry(id: "played", bytes: 100, lastPlayed: Date())
        let candidates = PodcastCacheBudget.deletionCandidates(
            in: [played, neverPlayed], needing: 50, budget: 150
        )
        XCTAssertEqual(candidates.first?.episodeID, "never")
    }

    func testSuggestsOnlyAsManyAsAreNeeded() {
        // A prompt offering to delete everything when one file would do
        // reads as the app losing its temper.
        //
        // The arithmetic matters and I got it wrong first time: with a 150
        // budget, removing one 100-byte entry leaves 100 used, and
        // 100 + 60 = 160 still exceeds 150 -- so two really were needed and
        // CI was right to reject the expectation. At 200 one suffices.
        let candidates = PodcastCacheBudget.deletionCandidates(
            in: [entry(id: "a", bytes: 100), entry(id: "b", bytes: 100)],
            needing: 60,
            budget: 200
        )
        XCTAssertEqual(candidates.count, 1)
    }

    func testOffersNothingWhenTheDownloadAlreadyFits() {
        XCTAssertTrue(
            PodcastCacheBudget.deletionCandidates(
                in: [entry(bytes: 10)], needing: 10, budget: 1000
            ).isEmpty
        )
    }

    func testOffersEverythingWhenEvenThatWouldNotBeEnough() {
        // Honest rather than tidy: if the download cannot fit even with the
        // cache emptied, the caller needs to know that, not a short list
        // that implies it would help.
        let candidates = PodcastCacheBudget.deletionCandidates(
            in: [entry(id: "a", bytes: 10), entry(id: "b", bytes: 10)],
            needing: 5_000,
            budget: 100
        )
        XCTAssertEqual(candidates.count, 2)
    }

    // MARK: - Staleness (Review Focus #1)

    // Probed 2026-09-25: Supabase serves an ETag that IS the MD5 of the
    // object's content, stable across requests. Content-derived means it
    // changes when the content changes, so this guard can actually fire.
    func testDetectsAReplacedObjectByETag() {
        XCTAssertTrue(PodcastCache.isStale(entry: entry(etag: "v1"), servedETag: "v2", servedBytes: nil))
    }

    func testIsNotStaleWhenTheETagMatches() {
        XCTAssertFalse(PodcastCache.isStale(entry: entry(etag: "v1"), servedETag: "v1", servedBytes: nil))
    }

    func testDetectsAReplacedObjectByByteCountWhenNoETagIsServed() {
        XCTAssertTrue(
            PodcastCache.isStale(entry: entry(bytes: 100, etag: nil), servedETag: nil, servedBytes: 200)
        )
    }

    func testIsNotStaleWhenNothingIsKnown() {
        // Offline there is nothing to compare against, and a slightly old
        // episode beats no episode. Never evict on ignorance.
        XCTAssertFalse(PodcastCache.isStale(entry: entry(etag: "v1"), servedETag: nil, servedBytes: nil))
    }

    func testIgnoresWeakETagSyntaxWhenComparing() {
        // A CDN may serve W/"abc" for the same object it stored as "abc".
        XCTAssertFalse(
            PodcastCache.isStale(entry: entry(etag: "\"abc\""), servedETag: "W/\"abc\"", servedBytes: nil)
        )
    }

    // MARK: - Duration reconciliation

    // The signature of BOTH a truncated download and a republished episode.
    func testFlagsADurationThatDisagreesWithTheCatalogue() {
        XCTAssertTrue(PodcastCache.durationDisagrees(cachedSeconds: 40, storedSeconds: 172))
    }

    func testToleratesSubSecondRoundingBetweenFileAndRow() {
        XCTAssertFalse(PodcastCache.durationDisagrees(cachedSeconds: 171.6, storedSeconds: 172))
    }

    func testTreatsAnUnreadableDurationAsNoDisagreement() {
        // AVFoundation reports NaN for an asset it has not loaded yet.
        // Re-downloading on that would mean re-downloading at random.
        XCTAssertFalse(PodcastCache.durationDisagrees(cachedSeconds: .nan, storedSeconds: 172))
        XCTAssertFalse(PodcastCache.durationDisagrees(cachedSeconds: 0, storedSeconds: 172))
    }

    // MARK: - Offline listing (Review Focus #4)

    private func episode(id: String, title: String) -> PodcastEpisode {
        PodcastEpisode(
            id: id,
            folderID: "f1",
            slug: title.lowercased(),
            title: title,
            description: nil,
            audioURL: URL(string: "https://example.test/\(id).mp3")!,
            durationSeconds: 172,
            positionSeconds: 0,
            playbackUpdatedAt: nil
        )
    }

    func testOfflineListingKeepsOnlyDownloadedEpisodes() {
        let listing = PodcastCache.offlineListing(
            entries: [entry(id: "b")],
            episodes: [episode(id: "a", title: "Alpha"), episode(id: "b", title: "Bravo")]
        )
        XCTAssertEqual(listing.map(\.id), ["b"])
    }

    func testOfflineListingIsOrderedByTitle() {
        // Flat and title-ordered on purpose: folders are a browsing aid for
        // a library you can see all of, and offline you can only see what
        // you downloaded.
        let listing = PodcastCache.offlineListing(
            entries: [entry(id: "a"), entry(id: "b")],
            episodes: [episode(id: "b", title: "Bravo"), episode(id: "a", title: "Alpha")]
        )
        XCTAssertEqual(listing.map(\.title), ["Alpha", "Bravo"])
    }

    func testOfflineListingIsEmptyWhenNothingIsDownloaded() {
        // Distinct from "offline with downloads": telling someone who
        // downloaded three episodes that there are none would be a lie
        // about their own device.
        XCTAssertTrue(
            PodcastCache.offlineListing(entries: [], episodes: [episode(id: "a", title: "Alpha")]).isEmpty
        )
    }

    func testOfflineListingIgnoresAnEntryWithNoMatchingEpisode() {
        // A cache entry can outlive its episode row -- unpublished,
        // deleted, or simply not in the page we hold.
        XCTAssertTrue(
            PodcastCache.offlineListing(entries: [entry(id: "ghost")], episodes: []).isEmpty
        )
    }
}
