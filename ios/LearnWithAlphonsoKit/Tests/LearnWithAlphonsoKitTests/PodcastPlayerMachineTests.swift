import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastPlayerMachineTests: XCTestCase {
    private func started(remote: Bool = true, online: Bool = true) -> PodcastPlayerMachine {
        var machine = PodcastPlayerMachine()
        _ = machine.send(.start(isRemote: remote, isOnline: online))
        return machine
    }

    private func playing() -> PodcastPlayerMachine {
        var machine = started()
        _ = machine.send(.timeControlPlaying)
        return machine
    }

    func testOfflineAndNotDownloadedFailsWithoutLoadingAndNeverShowsPlaying() {
        var machine = PodcastPlayerMachine()
        let effects = machine.send(.start(isRemote: true, isOnline: false))
        XCTAssertEqual(effects, [], "no AVPlayerItem for a stream that cannot load")
        XCTAssertEqual(machine.phase, .failed(.offlineNotDownloaded))
        XCTAssertEqual(machine.control, .retry)
        XCTAssertFalse(machine.isAudible)
    }

    func testOfflineWithADownloadLoadsNormally() {
        var machine = PodcastPlayerMachine()
        XCTAssertEqual(
            machine.send(.start(isRemote: false, isOnline: false)),
            [.loadItem, .play, .scheduleLoadTimeout(generation: machine.stallGeneration)]
        )
        XCTAssertEqual(machine.phase, .loading)
    }

    func testOnlyConfirmedPlaybackShowsAsPlaying() {
        var machine = started()
        XCTAssertEqual(machine.control, .spinner)
        XCTAssertEqual(machine.send(.itemReady), [])
        XCTAssertEqual(machine.phase, .loading, "ready is not playing")
        _ = machine.send(.timeControlPlaying)
        XCTAssertEqual(machine.phase, .playing)
        XCTAssertEqual(machine.control, .pause)
        XCTAssertTrue(machine.isAudible)
    }

    func testA404NeverShowsAsPlayingEvenIfTheTimeControlLaterReportsPlaying() {
        var machine = started()
        XCTAssertEqual(machine.send(.itemFailed(.notFound)), [.pause])
        _ = machine.send(.itemReady)
        _ = machine.send(.timeControlPlaying)
        XCTAssertEqual(machine.phase, .failed(.notFound))
        XCTAssertEqual(machine.control, .retry)
        XCTAssertFalse(machine.isAudible)
    }

    func testTheProbeCanRefineAFailure() {
        var machine = started()
        _ = machine.send(.itemFailed(.unplayable))
        _ = machine.send(.itemFailed(.notFound))
        XCTAssertEqual(machine.failure, .notFound)
    }

    func testFailingMidEpisodeShowsTheErrorAndRetry() {
        var machine = playing()
        _ = machine.send(.itemFailed(.network))
        XCTAssertEqual(machine.phase, .failed(.network))
        XCTAssertEqual(machine.control, .retry)
    }

    func testAFailureWhileIdleIsIgnored() {
        var machine = PodcastPlayerMachine()
        XCTAssertEqual(machine.send(.itemFailed(.network)), [])
        XCTAssertEqual(machine.phase, .idle)
    }

    func testAStallShowsBufferingAndRecovers() {
        var machine = playing()
        let effects = machine.send(.stalled)
        XCTAssertEqual(machine.phase, .buffering)
        XCTAssertEqual(machine.control, .spinner)
        XCTAssertEqual(effects, [.scheduleStallTimeout(generation: machine.stallGeneration)])
        _ = machine.send(.timeControlPlaying)
        XCTAssertEqual(machine.phase, .playing)
    }

    func testAStallThatOutlastsTheTimeoutBecomesANetworkFailure() {
        var machine = playing()
        _ = machine.send(.stalled)
        let effects = machine.send(.stallTimedOut(generation: machine.stallGeneration))
        XCTAssertEqual(machine.phase, .failed(.network))
        XCTAssertEqual(effects, [.pause, .savePosition])
    }

    func testAStaleStallTimeoutIsIgnored() {
        var machine = playing()
        _ = machine.send(.stalled)
        let old = machine.stallGeneration
        _ = machine.send(.timeControlPlaying)
        _ = machine.send(.stalled)
        XCTAssertEqual(machine.send(.stallTimedOut(generation: old)), [])
        XCTAssertEqual(machine.phase, .buffering)
    }

    func testFinishingMarksCompleteSeeksToStartAndShowsPlay() {
        var machine = playing()
        let effects = machine.send(.didPlayToEnd)
        XCTAssertEqual(effects, [.seekToStart, .saveCompletion, .flushPlayEvent])
        XCTAssertEqual(machine.phase, .finished)
        XCTAssertEqual(machine.control, .play)
        XCTAssertFalse(machine.isAudible)
    }

    func testPlayAfterFinishingStartsAgainFromTheTop() {
        var machine = playing()
        _ = machine.send(.didPlayToEnd)
        XCTAssertEqual(machine.send(.togglePressed), [.play, .scheduleLoadTimeout(generation: machine.stallGeneration)])
        XCTAssertEqual(machine.phase, .loading)
    }

    func testPausingSavesThePosition() {
        var machine = playing()
        XCTAssertEqual(machine.send(.togglePressed), [.pause, .savePosition])
        XCTAssertEqual(machine.phase, .paused)
        XCTAssertEqual(machine.control, .play)
    }

    func testTapWhileLoadingCancelsToPaused() {
        var machine = started()
        XCTAssertEqual(machine.send(.togglePressed), [.pause, .savePosition])
        _ = machine.send(.timeControlPlaying)
        XCTAssertEqual(machine.phase, .paused, "a late confirmation must not override the learner's pause")
    }

    func testInterruptionResumesOnlyWhatItPaused() {
        var interrupted = playing()
        _ = interrupted.send(.pausedExternally(resumable: true))
        XCTAssertEqual(
            interrupted.send(.interruptionEnded(shouldResume: true)),
            [.play, .scheduleLoadTimeout(generation: interrupted.stallGeneration)]
        )

        var pausedFirst = playing()
        _ = pausedFirst.send(.togglePressed)
        _ = pausedFirst.send(.pausedExternally(resumable: true))
        XCTAssertEqual(pausedFirst.send(.interruptionEnded(shouldResume: true)), [], "the learner had paused")
        XCTAssertEqual(pausedFirst.phase, .paused)
    }

    func testAVoicePauseNeverResumes() {
        var machine = playing()
        XCTAssertEqual(machine.send(.pausedExternally(resumable: false)), [.pause, .savePosition])
        XCTAssertEqual(machine.send(.interruptionEnded(shouldResume: true)), [])
        XCTAssertEqual(machine.phase, .paused)
    }

    func testTheSystemDeclinesToResume() {
        var machine = playing()
        _ = machine.send(.pausedExternally(resumable: true))
        XCTAssertEqual(machine.send(.interruptionEnded(shouldResume: false)), [])
        XCTAssertEqual(machine.send(.interruptionEnded(shouldResume: true)), [], "the resume window is one interruption long")
    }

    func testRetryAfterAFailureIsAFreshStart() {
        var machine = started()
        _ = machine.send(.itemFailed(.network))
        XCTAssertEqual(machine.send(.togglePressed), [], "the bar shows Retry, not Play")
        XCTAssertEqual(
            machine.send(.start(isRemote: true, isOnline: true)),
            [.loadItem, .play, .scheduleLoadTimeout(generation: machine.stallGeneration)]
        )
        XCTAssertEqual(machine.phase, .loading)
    }

    func testCloseReturnsToIdleAndInvalidatesTimers() {
        var machine = playing()
        _ = machine.send(.stalled)
        let generation = machine.stallGeneration
        _ = machine.send(.closed)
        XCTAssertEqual(machine.phase, .idle)
        XCTAssertEqual(machine.control, .none)
        XCTAssertEqual(machine.send(.stallTimedOut(generation: generation)), [])
    }

    // MARK: Loading timeout

    func testAStartSchedulesALoadTimeoutThatIsLongerThanZero() {
        var machine = PodcastPlayerMachine()
        let effects = machine.send(.start(isRemote: true, isOnline: true))
        XCTAssertTrue(effects.contains(.scheduleLoadTimeout(generation: machine.stallGeneration)))
        XCTAssertEqual(PodcastPlayerMachine.loadTimeoutSeconds, 20)
    }

    func testLoadingThatNeverProducesAFrameBecomesANetworkFailureWithRetry() {
        var machine = started()
        let effects = machine.send(.loadTimedOut(generation: machine.stallGeneration))
        XCTAssertEqual(machine.phase, .failed(.network))
        XCTAssertEqual(machine.control, .retry)
        XCTAssertEqual(effects, [.pause])
        XCTAssertFalse(machine.isAudible)
    }

    func testALoadTimeoutAfterPlaybackStartedDoesNothing() {
        var machine = started()
        let generation = machine.stallGeneration
        _ = machine.send(.timeControlPlaying)
        XCTAssertEqual(machine.send(.loadTimedOut(generation: generation)), [])
        XCTAssertEqual(machine.phase, .playing)
    }

    func testALoadTimeoutFromAnEarlierStartIsIgnored() {
        var machine = started()
        let old = machine.stallGeneration
        _ = machine.send(.start(isRemote: true, isOnline: true))
        XCTAssertEqual(machine.send(.loadTimedOut(generation: old)), [])
        XCTAssertEqual(machine.phase, .loading)
    }

    func testALoadTimeoutAfterThePauseTapDoesNotOverrideIt() {
        var machine = started()
        let generation = machine.stallGeneration
        _ = machine.send(.togglePressed)
        XCTAssertEqual(machine.send(.loadTimedOut(generation: generation)), [])
        XCTAssertEqual(machine.phase, .paused)
    }

    func testResumingFromPauseGetsItsOwnLoadTimeout() {
        var machine = playing()
        _ = machine.send(.togglePressed)
        let effects = machine.send(.togglePressed)
        XCTAssertEqual(effects, [.play, .scheduleLoadTimeout(generation: machine.stallGeneration)])
        XCTAssertEqual(machine.send(.loadTimedOut(generation: machine.stallGeneration)), [.pause])
    }

    func testCloseInvalidatesALoadTimeout() {
        var machine = started()
        let generation = machine.stallGeneration
        _ = machine.send(.closed)
        XCTAssertEqual(machine.send(.loadTimedOut(generation: generation)), [])
        XCTAssertEqual(machine.phase, .idle)
    }
}
