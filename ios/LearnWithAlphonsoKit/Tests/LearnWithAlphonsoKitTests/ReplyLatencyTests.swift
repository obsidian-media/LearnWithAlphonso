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
