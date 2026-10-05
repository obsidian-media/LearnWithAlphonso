import XCTest
@testable import LearnWithAlphonsoKit

final class WordSegmenterTests: XCTestCase {
    private func pairs(_ text: String) -> [String] {
        WordSegmenter.segments(in: text).map { "\($0.isWord ? "W" : "-"):\($0.text)" }
    }

    func testSplitsWordsFromPunctuationAndSpaces() {
        XCTAssertEqual(pairs("Hello, world!"), ["W:Hello", "-:, ", "W:world", "-:!"])
    }

    func testKeepsInnerApostrophesInOneWord() {
        XCTAssertEqual(pairs("don't stop"), ["W:don't", "-: ", "W:stop"])
        XCTAssertEqual(pairs("don\u{2019}t stop"), ["W:don\u{2019}t", "-: ", "W:stop"])
    }

    func testKeepsInnerHyphensInOneWord() {
        XCTAssertEqual(pairs("a well-known fact"), ["W:a", "-: ", "W:well-known", "-: ", "W:fact"])
    }

    func testAccentedAndElidedWordsStayWhole() {
        XCTAssertEqual(
            pairs("l'\u{00e9}t\u{00e9} est chaud"),
            ["W:l'\u{00e9}t\u{00e9}", "-: ", "W:est", "-: ", "W:chaud"])
    }

    func testALoneHyphenOrTrailingApostropheIsNotPartOfAWord() {
        XCTAssertEqual(pairs("rock - roll"), ["W:rock", "-: - ", "W:roll"])
        XCTAssertEqual(pairs("dogs' bowl"), ["W:dogs", "-:' ", "W:bowl"])
    }

    func testDigitsAreNotWords() {
        XCTAssertEqual(pairs("room 42"), ["W:room", "-: 42"])
    }

    func testEmptyTextHasNoSegments() {
        XCTAssertEqual(WordSegmenter.segments(in: ""), [])
    }

    func testSegmentsAlwaysRebuildTheOriginalText() {
        for text in [
            "Hello, world!", "don't stop", "l'\u{00e9}t\u{00e9}", "  leading and trailing  ",
            "a--b", "\n\nline\nbreaks\n", "\u{4f60}\u{597d} world",
        ] {
            XCTAssertEqual(WordSegmenter.segments(in: text).map(\.text).joined(), text)
        }
    }

    // MARK: sentence(containing:in:)

    func testPicksTheSentenceThatContainsTheWord() {
        let text = "I like tea. Cats are lovely! Do you agree?"
        XCTAssertEqual(WordSegmenter.sentence(containing: "lovely", in: text), "Cats are lovely!")
    }

    func testMatchesCaseInsensitively() {
        XCTAssertEqual(
            WordSegmenter.sentence(containing: "cats", in: "I like tea. Cats are lovely!"),
            "Cats are lovely!")
    }

    func testFallsBackToTheWholeTrimmedTextWhenTheWordIsNotFound() {
        XCTAssertEqual(
            WordSegmenter.sentence(containing: "zebra", in: "  Just one sentence.  "),
            "Just one sentence.")
    }

    func testALongSentenceIsClampedToThreeHundredCharactersAndStillContainsTheWord() {
        let text = String(repeating: "word ", count: 100) + "target" + String(repeating: " word", count: 100)
        let out = WordSegmenter.sentence(containing: "target", in: text)
        XCTAssertLessThanOrEqual(out.count, 300)
        XCTAssertTrue(out.contains("target"))
    }

    func testAWordAtTheVeryEndOfALongSentenceIsStillKept() {
        let text = String(repeating: "word ", count: 120) + "target"
        let out = WordSegmenter.sentence(containing: "target", in: text)
        XCTAssertLessThanOrEqual(out.count, 300)
        XCTAssertTrue(out.hasSuffix("target"))
    }

    /// The server now requires the word as a WHOLE word in the sentence
    /// (CodeRabbit review on PR #211: "he" must not match inside "the"), so the
    /// sentence the client sends must be picked by whole word too, or a tap on
    /// "he" in "Then he left. The end." would send the wrong sentence.
    func testPicksTheSentenceWhereTheWordIsAWholeWordNotASubstring() {
        let text = "The end came. Then he left."
        XCTAssertEqual(WordSegmenter.sentence(containing: "he", in: text), "Then he left.")
    }
}

final class WordLinkTests: XCTestCase {
    func testRoundTripsWordsWithApostrophesHyphensAndAccents() throws {
        for word in ["don't", "don\u{2019}t", "well-known", "l'\u{00e9}t\u{00e9}", "serendipity"] {
            let url = try XCTUnwrap(WordLink.url(for: word))
            XCTAssertEqual(WordLink.word(from: url), word)
        }
    }

    func testIgnoresOtherSchemesAndMissingParameters() {
        XCTAssertNil(WordLink.word(from: URL(string: "https://example.com/?w=hello")!))
        XCTAssertNil(WordLink.word(from: URL(string: "lwa-word://save")!))
    }
}
