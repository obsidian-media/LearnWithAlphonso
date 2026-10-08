import XCTest
@testable import LearnWithAlphonsoKit

final class VoiceSessionStateTests: XCTestCase {
    private func appeared() -> VoiceSessionState {
        var state = VoiceSessionState()
        _ = state.handle(.appeared)
        return state
    }

    /// Press, permission granted, recorder started. Returns the generation used.
    @discardableResult
    private func startRecording(_ state: inout VoiceSessionState) -> Int {
        _ = state.handle(.pressBegan)
        let generation = state.generation
        _ = state.handle(.permissionResolved(generation: generation, granted: true))
        _ = state.handle(.recorderStarted(generation: generation))
        return generation
    }

    private func reachSpeaking(_ state: inout VoiceSessionState) -> Int {
        let generation = startRecording(&state)
        _ = state.handle(.pressEnded)
        _ = state.handle(.transcribed(generation: generation))
        _ = state.handle(.replyReady(generation: generation, hasAudio: true))
        return generation
    }

    func testFreshStateIsIdleAndInvisible() {
        let state = VoiceSessionState()
        XCTAssertEqual(state.phase, .idle)
        XCTAssertFalse(state.isVisible)
        XCTAssertFalse(state.canStartPress)
    }

    func testPressRequestsPermissionAndPausesOtherAudio() {
        var state = appeared()
        let effects = state.handle(.pressBegan)
        XCTAssertEqual(effects, [.pauseOtherAudio, .requestPermission(generation: state.generation)])
        XCTAssertEqual(state.phase, .requestingPermission(generation: state.generation))
    }

    /// Replaces isRequestingMic: a DragGesture fires .onChanged repeatedly
    /// during one hold.
    func testRepeatedPressDuringOneHoldIsIgnored() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        XCTAssertEqual(state.handle(.pressBegan), [])
        startRecording(&state)
        XCTAssertEqual(state.handle(.pressBegan), [])
    }

    func testAPressWhileInvisibleDoesNothing() {
        var state = VoiceSessionState()
        XCTAssertEqual(state.handle(.pressBegan), [])
        XCTAssertEqual(state.phase, .idle)
    }

    func testFullTurnEndsIdleWithTheSessionDeactivated() {
        var state = appeared()
        let generation = startRecording(&state)
        XCTAssertEqual(state.phase, .recording(generation: generation))
        XCTAssertEqual(state.handle(.pressEnded), [.stopRecorderAndSubmit(generation: generation)])
        XCTAssertEqual(state.phase, .transcribing(generation: generation))
        XCTAssertTrue(state.isBusy)
        _ = state.handle(.transcribed(generation: generation))
        XCTAssertEqual(state.phase, .thinking(generation: generation))
        _ = state.handle(.replyReady(generation: generation, hasAudio: true))
        XCTAssertEqual(state.phase, .speaking(generation: generation))
        XCTAssertFalse(state.isBusy)
        XCTAssertEqual(state.handle(.playbackFinished(generation: generation)), [.deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
    }

    func testAReplyWithoutAudioEndsTheTurn() {
        var state = appeared()
        let generation = startRecording(&state)
        _ = state.handle(.pressEnded)
        _ = state.handle(.transcribed(generation: generation))
        _ = state.handle(.replyReady(generation: generation, hasAudio: false))
        XCTAssertEqual(state.phase, .idle)
    }

    // MARK: - Tab switches never kill the microphone

    /// The bug: one tab switch set isTornDown = true forever, so every later
    /// permission callback returned early and the mic never started again.
    func testTabSwitchThenRecordWorks() {
        var state = appeared()
        _ = state.handle(.disappeared)
        _ = state.handle(.appeared)
        let generation = startRecording(&state)
        XCTAssertEqual(state.phase, .recording(generation: generation))
    }

    func testManyTabSwitchesThenRecordWorks() {
        var state = appeared()
        for _ in 0..<25 {
            _ = state.handle(.disappeared)
            _ = state.handle(.appeared)
        }
        let generation = startRecording(&state)
        XCTAssertEqual(state.phase, .recording(generation: generation))
    }

    func testTabSwitchMidRecordingCancelsTheRecorderAndTheNextPressWorks() {
        var state = appeared()
        startRecording(&state)
        XCTAssertEqual(state.handle(.disappeared), [.cancelRecorder, .deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
        _ = state.handle(.appeared)
        let generation = startRecording(&state)
        XCTAssertEqual(state.phase, .recording(generation: generation))
    }

    func testPermissionCallbackFromAStaleGenerationIsIgnored() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        let stale = state.generation
        _ = state.handle(.disappeared)
        _ = state.handle(.appeared)
        XCTAssertEqual(state.handle(.permissionResolved(generation: stale, granted: true)), [])
        XCTAssertEqual(state.phase, .idle)
        let fresh = startRecording(&state)
        XCTAssertNotEqual(fresh, stale)
        XCTAssertEqual(state.phase, .recording(generation: fresh))
    }

    func testPermissionCallbackAfterDisappearDoesNotStartTheRecorder() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        let generation = state.generation
        _ = state.handle(.disappeared)
        XCTAssertEqual(state.handle(.permissionResolved(generation: generation, granted: true)), [])
    }

    func testARecorderThatStartsForAStaleGenerationIsCancelled() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        let generation = state.generation
        XCTAssertEqual(
            state.handle(.permissionResolved(generation: generation, granted: true)),
            [.startRecorder(generation: generation)]
        )
        _ = state.handle(.disappeared)
        XCTAssertEqual(state.handle(.recorderStarted(generation: generation)), [.cancelRecorder])
        XCTAssertEqual(state.phase, .idle)
    }

    /// Replaces wantsToStop: a tap shorter than the permission hop.
    func testReleaseBeforePermissionResolvesStopsAsSoonAsRecordingStarts() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        let generation = state.generation
        XCTAssertEqual(state.handle(.pressEnded), [])
        _ = state.handle(.permissionResolved(generation: generation, granted: true))
        XCTAssertEqual(state.handle(.recorderStarted(generation: generation)), [.stopRecorderAndSubmit(generation: generation)])
        XCTAssertEqual(state.phase, .transcribing(generation: generation))
    }

    func testDeniedPermissionMarksTheMicrophoneUnavailable() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        XCTAssertEqual(state.handle(.permissionResolved(generation: state.generation, granted: false)), [])
        XCTAssertEqual(state.phase, .idle)
        XCTAssertTrue(state.microphoneUnavailable)
    }

    func testRecorderFailureMarksTheMicrophoneUnavailable() {
        var state = appeared()
        _ = state.handle(.pressBegan)
        let generation = state.generation
        _ = state.handle(.permissionResolved(generation: generation, granted: true))
        XCTAssertEqual(state.handle(.recorderFailed(generation: generation)), [.deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
        XCTAssertTrue(state.microphoneUnavailable)
    }

    // MARK: - Interruptions and route changes

    func testInterruptionWhileRecordingCancelsAndTheNextPressWorks() {
        var state = appeared()
        startRecording(&state)
        XCTAssertEqual(state.handle(.interrupted), [.cancelRecorder, .deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
        let generation = startRecording(&state)
        XCTAssertEqual(state.phase, .recording(generation: generation))
    }

    func testInterruptionWhileSpeakingStopsPlayback() {
        var state = appeared()
        _ = reachSpeaking(&state)
        XCTAssertEqual(state.handle(.interrupted), [.stopPlayback, .deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
    }

    func testInterruptionWhileThinkingLeavesTheTurnRunning() {
        var state = appeared()
        let generation = startRecording(&state)
        _ = state.handle(.pressEnded)
        _ = state.handle(.transcribed(generation: generation))
        XCTAssertEqual(state.handle(.interrupted), [])
        XCTAssertEqual(state.phase, .thinking(generation: generation))
    }

    func testHeadphonesUnpluggedWhileSpeakingStopsPlayback() {
        var state = appeared()
        _ = reachSpeaking(&state)
        XCTAssertEqual(state.handle(.outputRouteLost), [.stopPlayback, .deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
    }

    func testPressWhileSpeakingInterruptsPlayback() {
        var state = appeared()
        _ = reachSpeaking(&state)
        XCTAssertEqual(
            state.handle(.pressBegan),
            [.stopPlayback, .pauseOtherAudio, .requestPermission(generation: state.generation)]
        )
    }

    // MARK: - Failures and spinners

    func testFailureMovesToFailedAndAPressRecovers() {
        var state = appeared()
        let generation = startRecording(&state)
        _ = state.handle(.pressEnded)
        _ = state.handle(.transcribed(generation: generation))
        XCTAssertEqual(state.handle(.failed(generation: generation, .quotaExceeded(resetsAt: nil))), [.deactivateAudioSession])
        XCTAssertEqual(state.phase, .failed(.quotaExceeded(resetsAt: nil)))
        XCTAssertFalse(state.isBusy)
        XCTAssertTrue(state.canStartPress)
        XCTAssertEqual(state.handle(.pressBegan).last, .requestPermission(generation: state.generation))
    }

    /// The controller sends turnFinished from a defer after every capture, so
    /// whatever the view's turn did, nothing stays busy.
    func testTurnFinishedAlwaysClearsABusyPhase() {
        for stopAt in ["transcribing", "thinking"] {
            var state = appeared()
            let generation = startRecording(&state)
            _ = state.handle(.pressEnded)
            if stopAt == "thinking" { _ = state.handle(.transcribed(generation: generation)) }
            XCTAssertTrue(state.isBusy, stopAt)
            XCTAssertEqual(state.handle(.turnFinished(generation: generation)), [.deactivateAudioSession], stopAt)
            XCTAssertFalse(state.isBusy, stopAt)
            XCTAssertEqual(state.phase, .idle, stopAt)
        }
    }

    func testTurnFinishedLeavesPlaybackAndFailuresAlone() {
        var state = appeared()
        let generation = reachSpeaking(&state)
        XCTAssertEqual(state.handle(.turnFinished(generation: generation)), [])
        XCTAssertEqual(state.phase, .speaking(generation: generation))

        var failed = appeared()
        let g2 = startRecording(&failed)
        _ = failed.handle(.pressEnded)
        _ = failed.handle(.failed(generation: g2, .network))
        XCTAssertEqual(failed.handle(.turnFinished(generation: g2)), [])
        XCTAssertEqual(failed.phase, .failed(.network))
    }

    func testResultsFromBeforeATabSwitchAreIgnored() {
        var state = appeared()
        let generation = startRecording(&state)
        _ = state.handle(.pressEnded)
        _ = state.handle(.disappeared)
        _ = state.handle(.appeared)
        XCTAssertEqual(state.handle(.transcribed(generation: generation)), [])
        XCTAssertEqual(state.handle(.replyReady(generation: generation, hasAudio: true)), [])
        XCTAssertEqual(state.handle(.failed(generation: generation, .network)), [])
        XCTAssertEqual(state.phase, .idle)
        XCTAssertFalse(state.accepts(generation: generation))
    }
}
