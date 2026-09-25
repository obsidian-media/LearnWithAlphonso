import XCTest
@testable import LearnWithAlphonsoKit

/// clampPosition cases are ported from src/lib/podcast.functions.test.ts --
/// same values, so drift between the two is visible in review.
final class PodcastPlaybackTests: XCTestCase {
    func testKeepsAPositionInsideTheEpisode() {
        XCTAssertEqual(PodcastPlayback.clampPosition(42, durationSeconds: 300), 42)
    }

    func testRestartsWhenThePositionIsPastTheEnd() {
        XCTAssertEqual(PodcastPlayback.clampPosition(400, durationSeconds: 300), 0)
    }

    func testRestartsWhenThePositionIsInTheFinalSecond() {
        // Resuming at 299.6/300 replays a fraction of a second and
        // instantly ends -- indistinguishable from a broken player.
        XCTAssertEqual(PodcastPlayback.clampPosition(299.6, durationSeconds: 300), 0)
    }

    func testTreatsNegativeAsTheStart() {
        XCTAssertEqual(PodcastPlayback.clampPosition(-5, durationSeconds: 300), 0)
    }

    func testTreatsNonFiniteAsTheStart() {
        XCTAssertEqual(PodcastPlayback.clampPosition(.nan, durationSeconds: 300), 0)
        XCTAssertEqual(PodcastPlayback.clampPosition(.infinity, durationSeconds: 300), 0)
    }

    func testBuildsThePublicBucketURL() {
        let base = URL(string: "https://project.supabase.co")!
        XCTAssertEqual(
            PodcastPlayback.audioURL(supabaseURL: base, audioPath: "en/a1/ordering-coffee.mp3")?
                .absoluteString,
            "https://project.supabase.co/storage/v1/object/public/podcast-audio/en/a1/ordering-coffee.mp3"
        )
    }

    func testPercentEncodesAPathSegmentThatNeedsIt() {
        let base = URL(string: "https://project.supabase.co")!
        let url = PodcastPlayback.audioURL(supabaseURL: base, audioPath: "en/a1/cafe au lait.mp3")
        XCTAssertNotNil(url)
        XCTAssertFalse(url!.absoluteString.contains(" "))
        // The separators must survive encoding as separators.
        XCTAssertTrue(url!.absoluteString.contains("/en/a1/"))
    }

    func testReturnsNilForAnEmptyAudioPath() {
        let base = URL(string: "https://project.supabase.co")!
        XCTAssertNil(PodcastPlayback.audioURL(supabaseURL: base, audioPath: ""))
    }
}
