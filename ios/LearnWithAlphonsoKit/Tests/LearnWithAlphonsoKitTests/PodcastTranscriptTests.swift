import XCTest
@testable import LearnWithAlphonsoKit

/// Ported from `src/lib/podcast-transcript.test.ts`'s `transcriptParagraphs`
/// cases -- same values, so drift between the two is visible in review.
///
/// Only the render-side port lives here. Markup rejection stays on the
/// authoring side (`normalizeTranscript`, called by
/// scripts/podcast-tool.ts): the app reads transcripts that were already
/// validated on the way in, and duplicating the rule would mean two places
/// to keep in step for no benefit.
final class PodcastTranscriptTests: XCTestCase {
    func testSplitsOnBlankLines() {
        XCTAssertEqual(
            PodcastTranscript.paragraphs("One.\n\nTwo.\n\nThree."),
            ["One.", "Two.", "Three."]
        )
    }

    func testKeepsASingleLineAsOneParagraph() {
        XCTAssertEqual(PodcastTranscript.paragraphs("Just one line."), ["Just one line."])
    }

    func testReturnsNoParagraphsForEmptyText() {
        XCTAssertEqual(PodcastTranscript.paragraphs(""), [])
    }

    func testKeepsASingleNewlineInsideAParagraphAsASpace() {
        // A hard-wrapped source file must not render one paragraph per line.
        XCTAssertEqual(
            PodcastTranscript.paragraphs("A line\nwrapped here.\n\nNext."),
            ["A line wrapped here.", "Next."]
        )
    }

    func testCollapsesRunsOfBlankLines() {
        XCTAssertEqual(PodcastTranscript.paragraphs("One.\n\n\n\nTwo."), ["One.", "Two."])
    }
}
