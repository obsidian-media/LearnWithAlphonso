import XCTest
@testable import LearnWithAlphonsoKit

final class PhraseSayTests: XCTestCase {
    func testResultCopyForEachOutcome() {
        XCTAssertEqual(PhraseSayCopy.resultText(PhraseCheck(result: .clear, listenAgain: [])), "Understood clearly")
        XCTAssertEqual(PhraseSayCopy.resultText(PhraseCheck(result: .mostly, listenAgain: ["table"])),
                       "Mostly understood: listen to \u{201C}table\u{201D} again")
        XCTAssertEqual(PhraseSayCopy.resultText(PhraseCheck(result: .mostly, listenAgain: ["more", "please"])),
                       "Mostly understood: listen to \u{201C}more\u{201D} and \u{201C}please\u{201D} again")
        XCTAssertEqual(PhraseSayCopy.resultText(PhraseCheck(result: .notYet, listenAgain: [])), "Not understood yet: try again")
    }

    func testCopyNeverScoresOrShouts() {
        let all = [PhraseSayCopy.checking, PhraseSayCopy.listening, PhraseSayCopy.framing,
                   PhraseSayCopy.resultText(PhraseCheck(result: .notYet, listenAgain: []))]
        for line in all {
            XCTAssertFalse(line.lowercased().contains("score"), line)
            XCTAssertFalse(line.lowercased().contains("wrong"), line)
        }
    }

    func testLabelsAndSubtitle() {
        XCTAssertEqual(PhraseSayCopy.micLabel(phrase: "Good morning"), "Say: Good morning")
        XCTAssertEqual(RehearsalPhrasebook.entrySubtitle(count: 6), "6 phrases \u{00B7} tap to hear, say them")
    }

    func testIdleEverythingEnabled() {
        let s = PhraseSayState()
        XCTAssertTrue(s.hearEnabled)
        for row in 0..<3 { XCTAssertTrue(s.micEnabled(row: row)) }
        XCTAssertNil(s.busyRow)
    }

    func testRecordingDisablesOtherRowsAndHearButKeepsOwnMic() {
        var s = PhraseSayState()
        XCTAssertEqual(s.micTapped(row: 1), .startRecording(row: 1))
        XCTAssertTrue(s.micEnabled(row: 1))
        XCTAssertFalse(s.micEnabled(row: 0))
        XCTAssertFalse(s.micEnabled(row: 2))
        XCTAssertFalse(s.hearEnabled)
        XCTAssertEqual(s.status(row: 1), "Listening\u{2026}")
        XCTAssertNil(s.status(row: 0))
        // A tap on another row does nothing.
        XCTAssertEqual(s.micTapped(row: 0), .ignore)
        XCTAssertEqual(s.busyRow, 1)
    }

    func testSecondTapSendsAndCheckingDisablesEverything() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 0)
        XCTAssertEqual(s.micTapped(row: 0), .stopRecording)
        XCTAssertTrue(s.isChecking)
        for row in 0..<3 { XCTAssertFalse(s.micEnabled(row: row)) }
        XCTAssertFalse(s.hearEnabled)
        XCTAssertEqual(s.status(row: 0), PhraseSayCopy.checking)
        XCTAssertEqual(s.micTapped(row: 0), .ignore)
    }

    func testTranscriptSettlesTheActiveRowOnly() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 2)
        s.recordingEnded()
        s.transcribed(expected: "Good morning", heard: "good morning",
                      words: [HeardWord(word: "good", confidence: 0.9), HeardWord(word: "morning", confidence: 0.4)])
        XCTAssertEqual(s.results[2]?.result, .mostly)
        XCTAssertNil(s.results[0])
        XCTAssertEqual(s.status(row: 2), "Mostly understood: listen to \u{201C}morning\u{201D} again")
        XCTAssertTrue(s.hearEnabled)
        XCTAssertTrue(s.micEnabled(row: 0))
    }

    func testSilenceReadsNotUnderstoodYet() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 0)
        _ = s.micTapped(row: 0)
        s.heardNothing()
        XCTAssertEqual(s.status(row: 0), "Not understood yet: try again")
        // An empty transcript through the checker gives the same answer.
        _ = s.micTapped(row: 0)
        _ = s.micTapped(row: 0)
        s.transcribed(expected: "Thank you very much", heard: "", words: [])
        XCTAssertEqual(s.results[0]?.result, .notYet)
    }

    func testRetryClearsTheOldResultAndAFailureLeavesNone() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 0)
        s.transcribed(expected: "Hello", heard: "hello", words: nil)
        XCTAssertEqual(s.status(row: 0), "Understood clearly")
        XCTAssertEqual(s.micTapped(row: 0), .startRecording(row: 0))
        XCTAssertNil(s.results[0])
        _ = s.micTapped(row: 0)
        s.failed()
        XCTAssertNil(s.results[0])
        XCTAssertNil(s.status(row: 0))
        XCTAssertTrue(s.hearEnabled)
    }

    func testOtherRowsKeepTheirResultsWhileOneIsBusy() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 0)
        s.transcribed(expected: "Hello", heard: "hello", words: nil)
        _ = s.micTapped(row: 1)
        XCTAssertEqual(s.status(row: 0), "Understood clearly")
        XCTAssertNil(s.resultLine(row: 1))
    }

    func testResetForgetsEverything() {
        var s = PhraseSayState()
        _ = s.micTapped(row: 0)
        s.transcribed(expected: "Hello", heard: "hello", words: nil)
        _ = s.micTapped(row: 1)
        s.reset()
        XCTAssertEqual(s, PhraseSayState())
    }
}
