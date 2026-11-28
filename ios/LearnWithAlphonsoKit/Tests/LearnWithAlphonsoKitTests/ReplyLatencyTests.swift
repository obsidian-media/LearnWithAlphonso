import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Slice B2: how long the learner takes to start each reply of a rehearsal call, and how it goes to the recap.
final class ReplyLatencyTests: XCTestCase {
    // MARK: the measurement

    func testEachSentReplyKeepsTheGapSinceThePartnerFinishedInOrder() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 1_000); t.learnerStarted(atMs: 1_800); t.replySent()
        t.partnerFinished(atMs: 10_000); t.learnerStarted(atMs: 15_500); t.replySent()
        t.partnerFinished(atMs: 20_000); t.learnerStarted(atMs: 20_000); t.replySent()
        XCTAssertEqual(t.values, [800, 5_500, 0])
    }

    func testAGapIsOnlyKeptOnceTheReplyIsSent() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 500)
        XCTAssertEqual(t.values, [], "a started recording is not yet a reply")
        t.replySent()
        XCTAssertEqual(t.values, [500])
    }

    func testASecondStartInTheSameAttemptIsIgnored() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 500); t.learnerStarted(atMs: 9_000); t.replySent()
        XCTAssertEqual(t.values, [500])
    }

    func testAStartWithNoPartnerVoiceBeforeItRecordsNothing() {
        var t = ReplyLatencyTracker()
        t.learnerStarted(atMs: 500); t.replySent()
        XCTAssertEqual(t.values, [])
    }

    func testAFailedAttemptDoesNotConsumeTheClockAndTheRetryGetsItsOwnStart() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 1_000)
        t.learnerStarted(atMs: 2_000)   // too short, an empty transcript, or a failed request
        t.attemptFailed()
        XCTAssertEqual(t.values, [])
        t.learnerStarted(atMs: 9_000)   // the retry
        t.replySent()
        XCTAssertEqual(t.values, [8_000], "measured from the partner finishing to the retry's own start, once")
    }

    func testAFailedAttemptThatIsNeverRetriedRecordsNothing() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 700); t.attemptFailed()
        t.replySent()
        XCTAssertEqual(t.values, [])
    }

    func testATypedReplyClearsThePendingStartSoALaterVoicePressRecordsNoBogusGap() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0)
        t.clearPartnerClock()            // the learner typed instead
        t.learnerStarted(atMs: 60_000)   // a later voice press, a minute on
        t.replySent()
        XCTAssertEqual(t.values, [])
    }

    func testAPartnerReplyWithNoAudioLeavesNoClockForTheNextPress() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 400); t.replySent()
        t.clearPartnerClock()            // the reply's audio failed
        t.learnerStarted(atMs: 50_000); t.replySent()
        XCTAssertEqual(t.values, [400])
    }

    func testAReplySentClosesTheClockUntilThePartnerSpeaksAgain() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 100); t.replySent()
        t.learnerStarted(atMs: 30_000); t.replySent()
        XCTAssertEqual(t.values, [100])
    }

    func testValuesAreClampedToZeroToSixtyThousand() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 10_000); t.learnerStarted(atMs: 5_000); t.replySent()     // a clock that went backwards
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 95_000); t.replySent()          // a very long wait
        XCTAssertEqual(t.values, [0, 60_000])
    }

    func testAtMostSixtyEntriesAreKeptTheFirstOnes() {
        var t = ReplyLatencyTracker()
        for i in 0..<75 { t.partnerFinished(atMs: 0); t.learnerStarted(atMs: i); t.replySent() }
        XCTAssertEqual(t.values.count, 60)
        XCTAssertEqual(t.values, Array(0..<60))
    }

    func testResetForgetsEverything() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 100); t.replySent(); t.partnerFinished(atMs: 0)
        t.reset()
        t.learnerStarted(atMs: 900); t.replySent()
        XCTAssertEqual(t.values, [])
    }

    // MARK: from the call screen

    func testBargeInThenAFailedRecordingThenARetryRecordsNothingSpurious() {
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0)                                     // the opener ended
        t.learnerStarted(atMs: 1_000); t.replySent()                   // a normal first reply: 1000
        t.partnerFinished(atMs: 5_000)                                 // Alphonso answered; the learner thinks
        // The next partner reply starts playing and the learner presses over it.
        t.pressBegan(atMs: 9_000, partnerWasSpeaking: true, handsFree: false)
        // The press stops the playback: speaking -> requestingPermission. That is not a natural end.
        t.phaseChanged(from: .speaking(generation: 2), to: .requestingPermission(generation: 3), atMs: 9_001)
        // The recording fails to start, and the learner presses again.
        t.phaseChanged(from: .requestingPermission(generation: 3), to: .failed(.network), atMs: 9_100)
        t.pressBegan(atMs: 40_000, partnerWasSpeaking: false, handsFree: false)
        t.replySent()
        XCTAssertEqual(t.values, [1_000], "no gap for the barge-in reply, and none invented for the retry")
    }

    func testAPlaybackEndingOnItsOwnStartsTheClockAndAPressMeasuresIt() {
        var t = ReplyLatencyTracker()
        t.phaseChanged(from: .speaking(generation: 1), to: .idle, atMs: 2_000)
        t.pressBegan(atMs: 3_500, partnerWasSpeaking: false, handsFree: false)
        t.replySent()
        XCTAssertEqual(t.values, [1_500])
    }

    func testInHandsFreeTheFirstVoiceActivityIsTheStartNotThePress() {
        var t = ReplyLatencyTracker()
        t.phaseChanged(from: .speaking(generation: 1), to: .idle, atMs: 1_000)
        t.pressBegan(atMs: 1_010, partnerWasSpeaking: false, handsFree: true)   // the loop opens the mic
        t.voiceHeard(atMs: 4_000)
        t.voiceHeard(atMs: 4_500)
        t.replySent()
        XCTAssertEqual(t.values, [3_000])
    }

    func testAPressThatNeverProducesACaptureThrowsItsStartAway() {
        // The microphone was refused, the recorder failed, or a turn was cancelled: the next attempt has its own start.
        let endings: [VoicePhase] = [.failed(.network), .idle]
        for ending in endings {
            var t = ReplyLatencyTracker()
            t.phaseChanged(from: .speaking(generation: 1), to: .idle, atMs: 0)
            t.pressBegan(atMs: 500, partnerWasSpeaking: false, handsFree: false)
            t.phaseChanged(from: .requestingPermission(generation: 2), to: ending, atMs: 600)
            t.pressBegan(atMs: 7_000, partnerWasSpeaking: false, handsFree: false)
            t.replySent()
            XCTAssertEqual(t.values, [7_000], "measured from the retry's own press, not the stale one")
        }
    }

    func testACancelledHandsFreeTurnOrAPauseThrowsTheHeardStartAway() {
        var t = ReplyLatencyTracker()
        t.phaseChanged(from: .speaking(generation: 1), to: .idle, atMs: 0)
        t.voiceHeard(atMs: 800)
        t.phaseChanged(from: .recording(generation: 2), to: .idle, atMs: 900)   // the turn was cancelled
        t.voiceHeard(atMs: 6_000)
        t.listeningStopped()                                                    // then paused
        t.replySent()
        XCTAssertEqual(t.values, [])
    }

    func testARecordingThatIsSubmittedKeepsItsStart() {
        var t = ReplyLatencyTracker()
        t.phaseChanged(from: .speaking(generation: 1), to: .idle, atMs: 0)
        t.pressBegan(atMs: 700, partnerWasSpeaking: false, handsFree: false)
        t.phaseChanged(from: .recording(generation: 2), to: .transcribing(generation: 2), atMs: 2_000)
        t.replySent()
        XCTAssertEqual(t.values, [700])
    }

    func testAFailedChatDropsTheEntry() {
        // The call screen commits (replySent) only after the chat answered; on a failure it clears the clock instead.
        var t = ReplyLatencyTracker()
        t.partnerFinished(atMs: 0); t.learnerStarted(atMs: 900)
        t.clearPartnerClock()
        t.learnerStarted(atMs: 50_000); t.replySent()
        XCTAssertEqual(t.values, [])
    }

    func testTheMonotonicClockNeverGoesBackwards() {
        let a = MonotonicClock.nowMs()
        let b = MonotonicClock.nowMs()
        XCTAssertGreaterThanOrEqual(b, a)
    }

    // MARK: the recap request

    private func sentBody(_ latencies: [Int]) async throws -> [String: Any] {
        let captured = TestCapture<URLRequest?>(nil)
        let client = AIConversationClient(baseURL: URL(string: "https://english-buddy-app-33.vercel.app")!, accessToken: { "tok" }, requester: { request in
            captured.value = request
            let data = try! JSONSerialization.data(withJSONObject: ["recap": NSNull()])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let transcript = (0..<3).flatMap { [ChatMessage(role: "user", content: "u\($0)"), ChatMessage(role: "assistant", content: "ok")] }
        _ = await client.callRecapAttempt(callId: "c1", transcript: transcript, scene: nil, replyLatenciesMs: latencies)
        let request = try XCTUnwrap(captured.value)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
    }

    func testTheRecapBodyCarriesTheLatenciesInOrder() async throws {
        let body = try await sentBody([800, 5_500, 0])
        XCTAssertEqual(body["replyLatenciesMs"] as? [Int], [800, 5_500, 0])
    }

    func testTheFieldIsOmittedWhenThereAreNone() async throws {
        let body = try await sentBody([])
        XCTAssertNil(body["replyLatenciesMs"])
        XCTAssertEqual(Set(body.keys), ["callId", "messages"], "a plain call's body is exactly the old one")
    }

    func testTheRequestClampsAndCapsEvenIfACallerDidNot() async throws {
        let body = try await sentBody((0..<70).map { $0 == 0 ? 99_999 : -5 })
        let sent = try XCTUnwrap(body["replyLatenciesMs"] as? [Int])
        XCTAssertEqual(sent.count, 60)
        XCTAssertEqual(sent[0], 60_000)
        XCTAssertEqual(sent[1], 0)
    }
}
