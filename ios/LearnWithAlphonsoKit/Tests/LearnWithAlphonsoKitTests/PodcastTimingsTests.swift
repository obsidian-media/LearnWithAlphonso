import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastTimingsTests: XCTestCase {
    private let lines = [
        TimedLine(s: 0, t: "One.", p: true),
        TimedLine(s: 4, t: "Two.", p: false),
        TimedLine(s: 9.5, t: "Three.", p: true),
        TimedLine(s: 20, t: "Four.", p: false),
    ]

    func testNoLinesIsMinusOne() { XCTAssertEqual(PodcastTimings.activeIndex([], at: 5), -1) }

    func testBeforeAndAtTheFirstStartIsTheFirstLine() {
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 0), 0)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: -3), 0)
    }

    func testIsTheLastLineStartedAtOrBeforeTheTime() {
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 3.99), 0)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 4), 1)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 9.49), 1)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 9.5), 2)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 19.9), 2)
    }

    func testAtAndAfterTheEndIsTheLastLine() {
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 20), 3)
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: 9999), 3)
    }

    func testNonFiniteTimeIsTheStart() {
        XCTAssertEqual(PodcastTimings.activeIndex(lines, at: .nan), 0)
    }

    func testMatchesALinearScanOverManyLines() {
        let many = (0..<200).map { TimedLine(s: Double($0) * 1.7, t: "l\($0)", p: false) }
        var t = -1.0
        while t < 360 {
            var want = 0
            for (i, l) in many.enumerated() where l.s <= t { want = i }
            XCTAssertEqual(PodcastTimings.activeIndex(many, at: t), want, "t=\(t)")
            t += 0.37
        }
    }

    func testLinesMatchingTheTranscriptAreReturned() {
        XCTAssertEqual(PodcastTimings.lines(lines, matching: "One. Two.\n\nThree. Four."), lines)
        XCTAssertEqual(PodcastTimings.lines(lines, matching: "One.   Two.\nThree.\n\nFour."), lines)
    }

    func testAnEditedTranscriptDropsTheTimings() {
        XCTAssertNil(PodcastTimings.lines(lines, matching: "One. Two. Three. Fourth."))
    }

    func testMissingPiecesAreNil() {
        XCTAssertNil(PodcastTimings.lines(nil, matching: "x"))
        XCTAssertNil(PodcastTimings.lines(lines, matching: nil))
        XCTAssertNil(PodcastTimings.lines([], matching: "x"))
    }

    func testStartsGoingBackwardsAreRejected() {
        let bad = [TimedLine(s: 5, t: "One.", p: true), TimedLine(s: 2, t: "Two.", p: false),
                   TimedLine(s: 9, t: "Three.", p: false), TimedLine(s: 12, t: "Four.", p: false)]
        XCTAssertNil(PodcastTimings.lines(bad, matching: "One. Two. Three. Four."))
    }

    func testDecodesTheBundledShapeAndSurvivesGarbage() {
        let json = #"{"ep-1":{"slug":"x","lines":[{"s":0,"t":"Hi.","p":true},{"s":3.5,"t":"Bye.","p":false}]}}"#
        let decoded = PodcastTimings.decode(Data(json.utf8))
        XCTAssertEqual(decoded["ep-1"], [TimedLine(s: 0, t: "Hi.", p: true), TimedLine(s: 3.5, t: "Bye.", p: false)])
        XCTAssertEqual(PodcastTimings.decode(Data("nope".utf8)), [:])
    }
}

final class SleepTimerTests: XCTestCase {
    func testOffersOffFifteenThirtyFortyFiveAndEnd() {
        XCTAssertEqual(SleepChoice.allCases.map(\.label), ["Off", "15 min", "30 min", "45 min", "End of episode"])
    }

    func testOffNeverPauses() {
        let s = SleepTimerState.start(.off, now: 1000)
        XCTAssertNil(s.remaining(now: 9_999_999))
        XCTAssertFalse(s.shouldPause(now: 9_999_999, episodeEnded: false))
    }

    func testATimedChoicePausesExactlyAtItsDeadline() {
        let s = SleepTimerState.start(.fifteen, now: 1000)
        XCTAssertEqual(s.remaining(now: 1000), 900)
        XCTAssertFalse(s.shouldPause(now: 1000 + 900 - 0.001, episodeEnded: false))
        XCTAssertTrue(s.shouldPause(now: 1000 + 900, episodeEnded: false))
    }

    func testThirtyAndFortyFiveUseTheirOwnLength() {
        XCTAssertEqual(SleepTimerState.start(.thirty, now: 0).remaining(now: 0), 1800)
        XCTAssertEqual(SleepTimerState.start(.fortyFive, now: 0).remaining(now: 0), 2700)
    }

    func testRemainingNeverGoesBelowZero() {
        XCTAssertEqual(SleepTimerState.start(.fifteen, now: 0).remaining(now: 99 * 60), 0)
    }

    func testEndOfEpisodeIgnoresTheClock() {
        let s = SleepTimerState.start(.endOfEpisode, now: 0)
        XCTAssertNil(s.remaining(now: 5))
        XCTAssertFalse(s.shouldPause(now: 99 * 3600, episodeEnded: false))
        XCTAssertTrue(s.shouldPause(now: 0, episodeEnded: true))
    }
}
