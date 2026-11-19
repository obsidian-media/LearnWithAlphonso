import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Pre-recorded story narration: the manifest lookup, and the rule that a fully recorded story needs no AI consent.
final class StoryRecordingsTests: XCTestCase {
    private let supabaseURL = URL(string: "https://project.supabase.co")!
    private let storyID = "22222222-2222-4222-8222-222222222222"

    private func manifest(_ entries: [(String, String)], version: Int = 1) -> Data {
        let list = entries.map { ["text": $0.0, "file": $0.1] }
        return try! JSONSerialization.data(withJSONObject: ["v": version, "voice": "x", "entries": list])
    }

    func testLooksASentenceUpByNormalisedText() {
        let parsed = StoryRecordings.parse(manifest([("Mia wakes up.", "stories/s/a.mp3")]))
        XCTAssertEqual(parsed?.path(for: "  Mia   wakes\nup. "), "stories/s/a.mp3")
        XCTAssertNil(parsed?.path(for: "Mia wakes up!"))
    }

    func testNoBreakSpacesNormaliseLikeTheWebAndTheGenerator() {
        let parsed = StoryRecordings.parse(manifest([("Tu viens\u{00A0}? Oui\u{202F}!", "stories/s/a.mp3")]))
        XCTAssertEqual(parsed?.path(for: "Tu viens ? Oui !"), "stories/s/a.mp3")
        XCTAssertEqual(parsed?.path(for: "\u{FEFF}Tu  viens\u{00A0}?\u{3000}Oui\u{202F}!"), "stories/s/a.mp3")
    }

    func testAMixedStoryWithoutConsentRefusesSoNothingIsSpent() {
        let parsed = StoryRecordings.parse(manifest([("a", "stories/s/a.mp3")]))
        XCTAssertFalse(StoryRecordings.canNarrate(segments: ["a", "b"], recordings: parsed, aiConsentGranted: false))
    }

    func testComposedAndDecomposedAccentsAreTheSameSentence() {
        let parsed = StoryRecordings.parse(manifest([("Caf\u{00E9}.", "stories/s/a.mp3")]))
        XCTAssertEqual(parsed?.path(for: "Cafe\u{0301}."), "stories/s/a.mp3")
    }

    func testRejectsAnotherVersionAndFilesOutsideStories() {
        XCTAssertNil(StoryRecordings.parse(manifest([], version: 2)))
        XCTAssertNil(StoryRecordings.parse(Data("<html>".utf8)))
        let parsed = StoryRecordings.parse(manifest([
            ("a", "podcast/x.mp3"), ("b", "stories/../x.mp3"), ("c", "stories/s/c.mp3"),
        ]))
        XCTAssertEqual(Set(parsed?.files.keys.sorted() ?? []), ["c"])
    }

    func testAllRecordedNeedsEverySentenceAndAtLeastOne() {
        let parsed = StoryRecordings.parse(manifest([("a", "stories/s/a.mp3")]))!
        XCTAssertTrue(parsed.allRecorded(["a"]))
        XCTAssertFalse(parsed.allRecorded(["a", "b"]))
        XCTAssertFalse(parsed.allRecorded([]))
    }

    func testRecordedStoryNarratesWithoutAIConsent() {
        let parsed = StoryRecordings.parse(manifest([("a", "stories/s/a.mp3"), ("b", "stories/s/b.mp3")]))
        XCTAssertTrue(StoryRecordings.canNarrate(segments: ["a", "b"], recordings: parsed, aiConsentGranted: false))
    }

    func testAnyUnrecordedSentenceNeedsAIConsentAsBefore() {
        let parsed = StoryRecordings.parse(manifest([("a", "stories/s/a.mp3")]))
        XCTAssertFalse(StoryRecordings.canNarrate(segments: ["a", "b"], recordings: parsed, aiConsentGranted: false))
        XCTAssertTrue(StoryRecordings.canNarrate(segments: ["a", "b"], recordings: parsed, aiConsentGranted: true))
        XCTAssertFalse(StoryRecordings.canNarrate(segments: ["a"], recordings: nil, aiConsentGranted: false))
        XCTAssertTrue(StoryRecordings.canNarrate(segments: ["a"], recordings: nil, aiConsentGranted: true))
    }

    func testBuildsPublicURLs() {
        XCTAssertEqual(
            StoryRecordings.manifestURL(supabaseURL: supabaseURL, storyID: storyID)?.absoluteString,
            "https://project.supabase.co/storage/v1/object/public/podcast-audio/stories/\(storyID)/manifest.json")
    }

    func testLoadReadsTheManifestAndAFailureIsNil() async {
        let body = manifest([("a", "stories/s/a.mp3")])
        let ok = await StoryRecordings.load(supabaseURL: supabaseURL, storyID: storyID) { request in
            (body,
             HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        XCTAssertEqual(ok?.path(for: "a"), "stories/s/a.mp3")
        let missing = await StoryRecordings.load(supabaseURL: supabaseURL, storyID: storyID) { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
        }
        XCTAssertNil(missing)
        let offline = await StoryRecordings.load(supabaseURL: supabaseURL, storyID: storyID) { _ in
            throw URLError(.notConnectedToInternet)
        }
        XCTAssertNil(offline)
    }
}
