import XCTest
@testable import LearnWithAlphonsoKit

final class HandsFreeLoopTests: XCTestCase {
    private let quiet = -60.0
    private let speech = -20.0

    /// A loop that is on and recording turn 1.
    private func recordingLoop() -> HandsFreeLoop {
        var loop = HandsFreeLoop()
        XCTAssertEqual(loop.handle(.enable), [.beginTurn])
        _ = loop.handle(.voicePhase(.requestingPermission(generation: 1)))
        XCTAssertEqual(loop.handle(.voicePhase(.recording(generation: 1))), [])
        XCTAssertEqual(loop.status, .listening)
        return loop
    }

    /// Feeds samples every 0.1 s from `from` (inclusive) to `to` (exclusive) and collects the effects.
    @discardableResult
    private func feed(_ loop: inout HandsFreeLoop, level: Double, from: Double, to: Double) -> [HandsFreeLoop.Effect] {
        var effects: [HandsFreeLoop.Effect] = []
        var t = from
        while t < to - 1e-9 {
            effects += loop.handle(.level(dBFS: level, at: t))
            t += 0.1
        }
        return effects
    }

    func testEnablingWhenIdleStartsListening() {
        var loop = HandsFreeLoop()
        XCTAssertEqual(loop.handle(.enable), [.beginTurn])
        XCTAssertEqual(loop.handle(.enable), [], "enabling twice does nothing")
    }

    func testEnablingWhileHectorIsReplyingWaitsForTheReplyToEnd() {
        var loop = HandsFreeLoop()
        _ = loop.handle(.voicePhase(.speaking(generation: 1)))
        XCTAssertEqual(loop.handle(.enable), [])
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [.beginTurn])
    }

    func testSpeechThenAPauseEndsTheTurnOnce() {
        var loop = recordingLoop()
        XCTAssertEqual(feed(&loop, level: quiet, from: 0, to: 0.5), [])
        XCTAssertEqual(feed(&loop, level: speech, from: 0.5, to: 2.0), [])
        XCTAssertEqual(loop.status, .hearing)
        // 1.1 s of quiet: not yet.
        XCTAssertEqual(feed(&loop, level: quiet, from: 2.0, to: 3.0), [])
        let ended = feed(&loop, level: quiet, from: 3.0, to: 4.0)
        XCTAssertEqual(ended, [.endTurn], "one end, at 1.2 s of quiet")
    }

    func testAShortClickIsNotSpeech() {
        var loop = recordingLoop()
        feed(&loop, level: quiet, from: 0, to: 0.5)
        feed(&loop, level: speech, from: 0.5, to: 0.6)
        XCTAssertEqual(loop.status, .listening)
        XCTAssertEqual(feed(&loop, level: quiet, from: 0.6, to: 3.0), [], "a click followed by quiet never ends the turn")
    }

    func testNobodySpeakingCancelsAndPausesSoTheMicNeverStaysOpen() {
        var loop = recordingLoop()
        let effects = feed(&loop, level: quiet, from: 0, to: 8.2)
        XCTAssertEqual(effects, [.cancelTurn])
        XCTAssertEqual(loop.status, .paused(.noSpeech))
        // The cancelled turn returns to idle: hands-free must not reopen the mic by itself.
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [])
    }

    func testANoisyBackgroundNeedsLouderSpeech() {
        var loop = recordingLoop()
        feed(&loop, level: -30, from: 0, to: 1.0)
        // 8 dB above a -30 background is not speech (threshold is +14).
        feed(&loop, level: -22, from: 1.0, to: 2.0)
        XCTAssertEqual(loop.status, .listening)
        feed(&loop, level: -10, from: 2.0, to: 2.5)
        XCTAssertEqual(loop.status, .hearing)
    }

    func testALongTurnIsCappedAt30Seconds() {
        var loop = recordingLoop()
        let effects = feed(&loop, level: speech, from: 0, to: 30.5)
        XCTAssertEqual(effects, [.endTurn])
    }

    func testAfterHectorRepliesTheNextTurnStarts() {
        var loop = recordingLoop()
        feed(&loop, level: speech, from: 0, to: 1.0)
        feed(&loop, level: quiet, from: 1.0, to: 2.5)
        for phase in [VoicePhase.transcribing(generation: 1), .thinking(generation: 1), .speaking(generation: 1)] {
            XCTAssertEqual(loop.handle(.voicePhase(phase)), [])
            XCTAssertEqual(loop.status, .waiting)
        }
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [.beginTurn])
    }

    func testAFailurePausesAndNeverRetriesByItself() {
        var loop = recordingLoop()
        _ = loop.handle(.voicePhase(.transcribing(generation: 1)))
        XCTAssertEqual(loop.handle(.voicePhase(.failed(.network))), [])
        XCTAssertEqual(loop.status, .paused(.failure))
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [])
        XCTAssertEqual(loop.handle(.togglePause), [.beginTurn], "the learner resumes it")
    }

    func testARefusedMicrophoneOrAFailedStartPausesInsteadOfAskingAgain() {
        var loop = HandsFreeLoop()
        XCTAssertEqual(loop.handle(.enable), [.beginTurn])
        _ = loop.handle(.voicePhase(.requestingPermission(generation: 1)))
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [], "never a second permission request by itself")
        XCTAssertEqual(loop.status, .paused(.failure))
    }

    func testPausingWhileRecordingCancelsTheTurnAndResumingStartsOne() {
        var loop = recordingLoop()
        XCTAssertEqual(loop.handle(.togglePause), [.cancelTurn])
        XCTAssertEqual(loop.status, .paused(.byLearner))
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [])
        XCTAssertEqual(loop.handle(.togglePause), [.beginTurn])
    }

    func testTurningItOffCancelsAnOpenMicAndIgnoresEverythingAfter() {
        var loop = recordingLoop()
        XCTAssertEqual(loop.handle(.disable), [.cancelTurn])
        XCTAssertEqual(loop.status, .off)
        XCTAssertEqual(loop.handle(.voicePhase(.idle)), [])
        XCTAssertEqual(feed(&loop, level: speech, from: 0, to: 2), [])
    }

    func testLevelsOutsideRecordingAreIgnored() {
        var loop = HandsFreeLoop()
        _ = loop.handle(.voicePhase(.speaking(generation: 1)))
        _ = loop.handle(.enable)
        XCTAssertEqual(feed(&loop, level: quiet, from: 0, to: 10), [], "Hector's own reply is not a turn")
    }

    func testEveryStatusHasALineExceptOff() {
        XCTAssertNil(HandsFreeCopy.statusLine(.off))
        for status: HandsFreeLoop.Status in [.waiting, .listening, .hearing, .paused(.byLearner), .paused(.noSpeech), .paused(.failure)] {
            XCTAssertNotNil(HandsFreeCopy.statusLine(status))
        }
        XCTAssertTrue(HandsFreeCopy.firstUseBody.contains("driving"))
    }
}
