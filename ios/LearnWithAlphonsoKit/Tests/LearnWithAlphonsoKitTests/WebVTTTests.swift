import XCTest
@testable import LearnWithAlphonsoKit

/// The captions parser for the Watch shelf's player. The sample is the shape of the owner's real caption files.
final class WebVTTTests: XCTestCase {
    private let sample = """
    WEBVTT

    1
    00:00:00.400 --> 00:00:04.942
    Saying "I want a coffee" isn't wrong... but it can sound a little blunt.

    2
    00:00:04.942 --> 00:00:07.024
    Here's how to order like a local.

    3
    00:00:08.024 --> 00:00:15.872
    Just swap "I want" for "I'd like."
    "I'd like a coffee, please."
    """

    func testParsesEveryCueWithItsTimes() {
        let cues = WebVTT.parse(sample)
        XCTAssertEqual(cues.count, 3)
        XCTAssertEqual(cues[0].start, 0.4, accuracy: 0.0001)
        XCTAssertEqual(cues[0].end, 4.942, accuracy: 0.0001)
        XCTAssertEqual(cues[2].start, 8.024, accuracy: 0.0001)
        XCTAssertEqual(cues[1].text, "Here's how to order like a local.")
    }

    func testAMultiLineCueKeepsItsLines() {
        XCTAssertEqual(WebVTT.parse(sample)[2].text, "Just swap \"I want\" for \"I'd like.\"\n\"I'd like a coffee, please.\"")
    }

    func testCueLookupAtATime() {
        let cues = WebVTT.parse(sample)
        XCTAssertNil(WebVTT.cue(at: 0.1, in: cues), "before the first cue")
        XCTAssertEqual(WebVTT.cue(at: 0.4, in: cues)?.text.hasPrefix("Saying"), true, "a cue starts at its start time")
        XCTAssertEqual(WebVTT.cue(at: 4.941, in: cues)?.text.hasPrefix("Saying"), true)
        XCTAssertEqual(WebVTT.cue(at: 4.942, in: cues)?.text.hasPrefix("Here's"), true, "the end is exclusive: the next cue takes over")
        XCTAssertNil(WebVTT.cue(at: 7.5, in: cues), "a gap between cues shows nothing")
        XCTAssertNotNil(WebVTT.cue(at: 15.871, in: cues))
        XCTAssertNil(WebVTT.cue(at: 15.872, in: cues), "after the last cue")
        XCTAssertNil(WebVTT.cue(at: .nan, in: cues))
    }

    func testOverlappingCuesShowTheOneThatStartedLast() {
        let cues = WebVTT.parse("WEBVTT\n\n00:00.000 --> 00:10.000\nlong\n\n00:02.000 --> 00:04.000\nshort\n")
        XCTAssertEqual(WebVTT.cue(at: 1, in: cues)?.text, "long")
        XCTAssertEqual(WebVTT.cue(at: 3, in: cues)?.text, "short")
        XCTAssertEqual(WebVTT.cue(at: 5, in: cues)?.text, "long")
    }

    func testTimestampsWithAndWithoutHours() {
        XCTAssertEqual(WebVTT.timestamp("01:02:03.500") ?? -1, 3723.5, accuracy: 0.0001)
        XCTAssertEqual(WebVTT.timestamp("02:03.500") ?? -1, 123.5, accuracy: 0.0001)
        XCTAssertEqual(WebVTT.timestamp("7.25") ?? -1, 7.25, accuracy: 0.0001)
        XCTAssertNil(WebVTT.timestamp("abc"))
        XCTAssertNil(WebVTT.timestamp("1:2:3:4"))
        XCTAssertNil(WebVTT.timestamp(""))
    }

    func testCrLfBomCueSettingsAndTagsAreHandled() {
        let text = "\u{FEFF}WEBVTT - title\r\n\r\nintro\r\n00:01.000 --> 00:02.000 align:start position:10%\r\n<c.yellow>Hello</c> <b>there</b> &amp; welcome\r\n"
        let cues = WebVTT.parse(text)
        XCTAssertEqual(cues.count, 1)
        XCTAssertEqual(cues[0].text, "Hello there & welcome")
        XCTAssertEqual(cues[0].end, 2, accuracy: 0.0001)
    }

    func testNoteStyleAndRegionBlocksAreSkippedAndBadCuesDropped() {
        let text = """
        WEBVTT

        NOTE this is a comment
        00:00.000 --> 00:01.000
        not a cue

        STYLE
        ::cue { color: red }

        00:03.000 --> 00:02.000
        ends before it starts

        00:04.000 --> 00:05.000

        00:06.000 --> 00:07.000
        kept
        """
        let cues = WebVTT.parse(text)
        XCTAssertEqual(cues.map(\.text), ["kept"])
    }

    func testCuesOutOfOrderAreSortedByStart() {
        let cues = WebVTT.parse("WEBVTT\n\n00:05.000 --> 00:06.000\nsecond\n\n00:01.000 --> 00:02.000\nfirst\n")
        XCTAssertEqual(cues.map(\.text), ["first", "second"])
    }

    func testAFileThatIsNotWebVTTGivesNoCues() {
        XCTAssertEqual(WebVTT.parse("1\n00:00:01,000 --> 00:00:02,000\nHi\n"), [])
        XCTAssertEqual(WebVTT.parse(""), [])
        XCTAssertEqual(WebVTT.parse("WEBVTTX\n\n00:01.000 --> 00:02.000\nHi"), [])
    }
}
