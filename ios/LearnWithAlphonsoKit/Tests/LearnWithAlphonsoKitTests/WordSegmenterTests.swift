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

    // MARK: server length limit is UTF-16 code units, not Characters
    //
    // The server checks `sentence.length > 300` in JavaScript, which counts
    // UTF-16 code units. Swift's `String.count` counts grapheme clusters, so an
    // emoji is 1 Character but 2 units (a family emoji, 8). A sentence that is
    // "short" by Characters can still be rejected with a 400 (CodeRabbit review
    // on PR #212).

    private let emoji = "\u{1F600}"  // 1 Character, 2 UTF-16 units
    private let family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"  // 1 Character, 8 units

    func testASentenceUnder300CharactersButOver300UTF16UnitsIsStillClamped() {
        // 160 Characters + " target" = 167 Characters, but 160*2 + 7 = 327 UTF-16 units.
        let text = String(repeating: emoji, count: 160) + " target"
        XCTAssertLessThanOrEqual(text.count, 300)
        XCTAssertGreaterThan(text.utf16.count, 300)
        let out = WordSegmenter.sentence(containing: "target", in: text)
        XCTAssertLessThanOrEqual(out.utf16.count, 300)
        XCTAssertTrue(out.hasSuffix("target"))
    }

    func testAnEmojiHeavyLongSentenceIsClampedInUTF16UnitsAroundTheWord() {
        let text = String(repeating: emoji, count: 150) + " target " + String(repeating: emoji, count: 150)
        let out = WordSegmenter.sentence(containing: "target", in: text)
        XCTAssertLessThanOrEqual(out.utf16.count, 300)
        XCTAssertTrue(out.contains("target"))
    }

    func testMultiUnitGraphemesNeverPushASentenceOverTheLimit() {
        let text = String(repeating: family, count: 60) + " target " + String(repeating: family, count: 60)
        let out = WordSegmenter.sentence(containing: "target", in: text)
        XCTAssertLessThanOrEqual(out.utf16.count, 300)
        XCTAssertTrue(out.contains("target"))
    }

    func testAnAlreadyShortSentenceWithEmojiIsLeftAlone() {
        XCTAssertEqual(
            WordSegmenter.sentence(containing: "target", in: "A \u{1F600} target here."),
            "A \u{1F600} target here.")
    }

    // MARK: the sentence the learner actually TAPPED, not the first one

    /// The character offset (in Characters, as `segments(in:)` counts them) of
    /// the n-th whole-word segment equal to `word`.
    private func offset(of word: String, occurrence: Int, in text: String) -> Int {
        var seen = 0
        var position = 0
        for segment in WordSegmenter.segments(in: text) {
            if segment.isWord && segment.text.lowercased() == word.lowercased() {
                if seen == occurrence { return position }
                seen += 1
            }
            position += segment.text.count
        }
        XCTFail("occurrence \(occurrence) of \(word) not found")
        return 0
    }

    func testAWordInTwoSentencesSavesTheSentenceThatWasTapped() {
        let text = "Cats purr softly. I really like cats."
        let first = offset(of: "cats", occurrence: 0, in: text)
        let second = offset(of: "cats", occurrence: 1, in: text)
        XCTAssertEqual(WordSegmenter.sentence(containing: "cats", in: text, atOffset: first), "Cats purr softly.")
        XCTAssertEqual(WordSegmenter.sentence(containing: "cats", in: text, atOffset: second), "I really like cats.")
    }

    func testAnOffsetThatMissesTheWordFallsBackToTheFirstSentenceWithIt() {
        let text = "Cats purr softly. Dogs bark loudly."
        XCTAssertEqual(WordSegmenter.sentence(containing: "dogs", in: text, atOffset: 0), "Dogs bark loudly.")
        XCTAssertEqual(WordSegmenter.sentence(containing: "dogs", in: text, atOffset: 9_999), "Dogs bark loudly.")
        XCTAssertEqual(WordSegmenter.sentence(containing: "dogs", in: text, atOffset: -3), "Dogs bark loudly.")
    }

    func testTheOffsetVersionStillRequiresAWholeWord() {
        let text = "The end came. Then he left."
        let offset = offset(of: "he", occurrence: 0, in: text)
        XCTAssertEqual(WordSegmenter.sentence(containing: "he", in: text, atOffset: offset), "Then he left.")
    }

    func testTheOffsetVersionStillClampsToTheServerLimit() {
        let text = String(repeating: emoji, count: 150) + " target " + String(repeating: emoji, count: 150)
        let out = WordSegmenter.sentence(
            containing: "target", in: text, atOffset: offset(of: "target", occurrence: 0, in: text))
        XCTAssertLessThanOrEqual(out.utf16.count, 300)
        XCTAssertTrue(out.contains("target"))
    }

    // MARK: only words the server will accept are tappable

    func testWordsOverTheServersFortyUnitLimitAreNotSavable() {
        XCTAssertTrue(WordSegmenter.isSavable("serendipity"))
        XCTAssertTrue(WordSegmenter.isSavable(String(repeating: "a", count: 40)))
        XCTAssertFalse(WordSegmenter.isSavable(String(repeating: "a", count: 41)))
        XCTAssertFalse(WordSegmenter.isSavable(""))
    }

    func testTheLimitIsMeasuredAfterNormalisationLikeTheServer() {
        // 40 decomposed e-acute is 80 scalars/UTF-16 units but 40 once composed
        // (the server normalises to NFC before checking), so it is savable.
        let decomposed = String(repeating: "e\u{0301}", count: 40)
        XCTAssertTrue(WordSegmenter.isSavable(decomposed))
        XCTAssertFalse(WordSegmenter.isSavable(String(repeating: "e\u{0301}", count: 41)))
    }

    // MARK: a Character is a letter only if EVERY scalar of it is
    //
    // A Character can hold several scalars (a letter plus combining marks). The
    // first scalar being a letter is not enough: after NFC, a mark that does not
    // compose into a precomposed letter stays a separate non-letter scalar, and
    // the server's `^\p{L}[\p{L}'-]*$` then rejects the whole word. Found by the
    // phase 2 reviewer and by CodeRabbit independently.

    func testALetterFollowedByANonComposingMarkIsNotAWord() {
        let cases: [(String, String)] = [
            ("a + ogonek + acute (no precomposed form)", "a\u{0328}\u{0301}"),
            ("Arabic beh + fatha (vowel mark)", "\u{0628}\u{064E}"),
            ("a + variation selector 16", "a\u{FE0F}"),
            ("a + zero-width joiner", "a\u{200D}"),
            ("Devanagari ka + vowel sign", "\u{0915}\u{093E}"),
        ]
        for (name, text) in cases {
            XCTAssertTrue(
                WordSegmenter.segments(in: text).allSatisfy { !$0.isWord },
                "\(name) must not be linked: the server rejects it")
        }
    }

    func testAComposingAccentThatNormalisesToOneLetterIsStillAWord() {
        // e + acute composes to U+00E9 under NFC, which the server accepts.
        XCTAssertEqual(WordSegmenter.segments(in: "e\u{0301}").map(\.isWord), [true])
        XCTAssertEqual(WordSegmenter.segments(in: "caf\u{0065}\u{0301}").map(\.isWord), [true])
    }

    func testEveryLatinGreekAndCyrillicScalarAgreesWithTheServerPattern() throws {
        // The corpus test below proves 10 strings; this proves the RULE across the
        // scripts the courses actually use, scalar by scalar.
        let server = try NSRegularExpression(pattern: "^\\p{L}[\\p{L}'\u{2019}-]*$")
        let ranges: [ClosedRange<UInt32>] = [0x41...0x24F, 0x370...0x3FF, 0x400...0x4FF]
        for range in ranges {
            for value in range {
                guard let scalar = Unicode.Scalar(value) else { continue }
                let text = String(Character(scalar))
                let linked = WordSegmenter.segments(in: text).contains { $0.isWord }
                let normalised = text.precomposedStringWithCanonicalMapping
                let accepted =
                    server.firstMatch(in: normalised, range: NSRange(normalised.startIndex..., in: normalised)) != nil
                XCTAssertEqual(linked, accepted, "U+\(String(value, radix: 16, uppercase: true)): linked=\(linked) server=\(accepted)")
            }
        }
    }

    // MARK: "letter" means exactly what the server's \p{L} means

    func testEveryWordSegmentIsAcceptedByTheServersWordPattern() throws {
        // Swift's Character.isLetter is Unicode Alphabetic, a SUPERSET of \p{L}
        // (Roman-numeral and circled letters are Alphabetic but not letters), so a
        // run could be linked here and then rejected by the server.
        let server = try NSRegularExpression(pattern: "^\\p{L}[\\p{L}'\u{2019}-]*$")
        let corpus = [
            "Hello, world! It's a well-known fact.", "l'\u{00e9}t\u{00e9} est chaud", "don\u{2019}t stop",
            "e\u{0301}te\u{0301} chaud", "\u{2160}\u{216B} chapters and \u{24B6}\u{24B7}\u{24B8} circles",
            "room 42 has x2 and a1b2", "\u{4f60}\u{597d} world", "na\u{00ef}ve caf\u{00e9} r\u{00e9}sum\u{00e9}",
            "rock - roll and a--b", "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629} text",
        ]
        for text in corpus {
            for segment in WordSegmenter.segments(in: text) where segment.isWord {
                // The server NFC-normalises first.
                let normalised = segment.text.precomposedStringWithCanonicalMapping
                let range = NSRange(normalised.startIndex..., in: normalised)
                XCTAssertNotNil(
                    server.firstMatch(in: normalised, range: range),
                    "\"\(segment.text)\" in \"\(text)\" is linked as a word but the server would reject it")
            }
        }
    }

    func testRomanNumeralAndCircledLettersAreNotWords() {
        XCTAssertTrue(WordSegmenter.segments(in: "\u{2160}\u{216B}").allSatisfy { !$0.isWord })
        XCTAssertTrue(WordSegmenter.segments(in: "\u{24B6}").allSatisfy { !$0.isWord })
    }
}

final class WordLinkTests: XCTestCase {
    func testCarriesTheTappedOffsetThroughTheLink() throws {
        let url = try XCTUnwrap(WordLink.url(for: "cats", offset: 23))
        XCTAssertEqual(WordLink.word(from: url), "cats")
        XCTAssertEqual(WordLink.offset(from: url), 23)
    }

    func testALinkWithoutAnOffsetStillParsesAndHasNoOffset() throws {
        let url = try XCTUnwrap(WordLink.url(for: "cats"))
        XCTAssertEqual(WordLink.word(from: url), "cats")
        XCTAssertNil(WordLink.offset(from: url))
    }

    func testAMalformedOffsetIsIgnoredNotACrash() {
        XCTAssertNil(WordLink.offset(from: URL(string: "lwa-word://save?w=cats&o=notanumber")!))
        XCTAssertNil(WordLink.offset(from: URL(string: "https://example.com/?o=5")!))
    }

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
