import XCTest
@testable import LearnWithAlphonsoKit

final class HectorCallTests: XCTestCase {
    private func turn(_ role: String, _ text: String) -> ChatMessage { ChatMessage(role: role, content: text) }

    func testHistoryExcludesTheCurrentLearnerTurn() {
        let turns = [turn("assistant", "Hi"), turn("user", "one"), turn("assistant", "reply"), turn("user", "two")]
        let history = HectorCall.priorTurns(turns)
        XCTAssertEqual(history.map(\.content), ["Hi", "one", "reply"])
        XCTAssertFalse(history.contains { $0.content == "two" })
    }

    func testHistoryOfAFirstTurnIsEmpty() {
        XCTAssertEqual(HectorCall.priorTurns([turn("user", "hello")]), [])
    }

    func testFreshIdsDifferEveryCall() {
        let a = HectorCall.Ids.fresh(), b = HectorCall.Ids.fresh()
        XCTAssertNotEqual(a.callId, b.callId)
        XCTAssertNotEqual(a.sessionID, b.sessionID)
        XCTAssertNotEqual(a.callId, a.sessionID)
    }

    func testCallAgainClearsTheThreadAndMintsNewIds() {
        let store = ConversationStore()
        let key = ConversationKey.hector(course: .french)
        store.openWithGreeting(key, greeting: "Salut")
        store.append(ChatMessage(role: "user", content: "bonjour"), to: key)
        store.update(key) { $0.analyzedTurnCount = 2 }
        var tracker = HectorCall.Tracker()
        let old = tracker.ids

        let snapshot = tracker.startNewCall(store: store, course: .french)

        XCTAssertTrue(snapshot.turns.isEmpty)
        XCTAssertEqual(snapshot.analyzedTurnCount, 0)
        XCTAssertEqual(store.snapshot(for: key)?.turns.count, 0)
        XCTAssertNotEqual(tracker.ids.callId, old.callId)
        XCTAssertNotEqual(tracker.ids.sessionID, old.sessionID)
        // The new call gets its greeting, because the thread is empty again.
        XCTAssertEqual(store.openWithGreeting(key, greeting: "Re-salut").pendingOpener, "Re-salut")
    }

    func testCallAgainLeavesOtherCoursesAlone() {
        let store = ConversationStore()
        store.openWithGreeting(.hector(course: .spanish), greeting: "Hola")
        var tracker = HectorCall.Tracker()
        tracker.startNewCall(store: store, course: .french)
        XCTAssertEqual(store.snapshot(for: .hector(course: .spanish))?.turns.count, 1)
    }

    private func learnerTurns(_ n: Int) -> [ChatMessage] {
        var turns = [turn("assistant", "Hi")]
        for i in 0..<n { turns += [turn("user", "u\(i)"), turn("assistant", "a\(i)")] }
        return turns
    }

    private func more(_ base: [ChatMessage], _ n: Int) -> [ChatMessage] {
        var turns = base
        for i in 0..<n { turns += [turn("user", "u\(base.count + i)"), turn("assistant", "a\(base.count + i)")] }
        return turns
    }

    func testCallEndNeedsThreeLearnerTurnsAndIsClaimedOncePerCallId() {
        let store = ConversationStore()
        var tracker = HectorCall.Tracker()
        XCTAssertNil(tracker.claimCallEnd(turns: learnerTurns(2)))
        XCTAssertEqual(tracker.claimCallEnd(turns: learnerTurns(3))?.messages.count, 7)
        XCTAssertNil(tracker.claimCallEnd(turns: learnerTurns(3)), "hang-up, then leaving the screen")
        tracker.startNewCall(store: store, course: .english)
        XCTAssertNotNil(tracker.claimCallEnd(turns: learnerTurns(3)), "Call again is a new call with its own call-end")
    }

    func testTalkingAgainAfterACallEndStartsANewSegmentWithOnlyTheNewTurns() {
        var tracker = HectorCall.Tracker(ids: HectorCall.Ids(callId: "c1", sessionID: "s1"))
        let thread = learnerTurns(3)
        XCTAssertEqual(tracker.claimCallEnd(turns: thread)?.callId, "c1")
        tracker.onLearnerTurn(turnCountBefore: thread.count)
        XCTAssertNotEqual(tracker.ids.callId, "c1")
        XCTAssertEqual(tracker.ids.sessionID, "s1", "the tutor session carries on")
        let second = tracker.claimCallEnd(turns: more(thread, 3))
        XCTAssertEqual(second?.callId, tracker.ids.callId)
        XCTAssertEqual(second?.messages.count, 6, "only the turns since the leave")
        XCTAssertEqual(second?.messages.first?.content, "u7")
    }

    func testTalkingAgainWithoutASentCallEndKeepsTheCallId() {
        var tracker = HectorCall.Tracker(ids: HectorCall.Ids(callId: "c1", sessionID: "s1"))
        tracker.onLearnerTurn(turnCountBefore: 1)
        XCTAssertNil(tracker.claimCallEnd(turns: learnerTurns(2)))
        tracker.onLearnerTurn(turnCountBefore: 5)
        XCTAssertEqual(tracker.ids.callId, "c1")
    }

    func testNoSeparateAnalysisOnceCallEndSucceededButErrorsAndUnsavedCallsFallBack() {
        var kept = HectorCall.Tracker()
        _ = kept.claimCallEnd(turns: learnerTurns(3))
        kept.callEndSucceeded(callId: kept.ids.callId)
        XCTAssertFalse(kept.claimAnalysis(turns: learnerTurns(3)))

        var failed = HectorCall.Tracker()
        _ = failed.claimCallEnd(turns: learnerTurns(3))
        XCTAssertTrue(failed.claimAnalysis(turns: learnerTurns(3)), "an error, a 429 or saved:false leaves the fallback on")
        XCTAssertFalse(failed.claimAnalysis(turns: learnerTurns(3)), "and only once")

        var short = HectorCall.Tracker()
        XCTAssertNil(short.claimCallEnd(turns: learnerTurns(2)))
        XCTAssertTrue(short.claimAnalysis(turns: learnerTurns(2)))
    }

    func testAStaleSuccessNeverCoversANewerSegment() {
        var tracker = HectorCall.Tracker(ids: HectorCall.Ids(callId: "c1", sessionID: "s1"))
        let thread = learnerTurns(3)
        _ = tracker.claimCallEnd(turns: thread)
        tracker.onLearnerTurn(turnCountBefore: thread.count)
        tracker.callEndSucceeded(callId: "c1")
        XCTAssertTrue(tracker.claimAnalysis(turns: more(thread, 2)))
    }

    func testOnlySavedAndAlreadySavedCountAsKept() {
        XCTAssertTrue(HectorCallEndResult(saved: true, lines: 1).kept)
        XCTAssertTrue(HectorCallEndResult(saved: false, reason: "already_saved").kept)
        for reason in ["no_recap", "write_failed", "not_configured", "short_call", "not_pro", "entitlement_unavailable", "nothing_to_keep"] {
            XCTAssertFalse(HectorCallEndResult(saved: false, reason: reason).kept, reason)
        }
    }

    func testCallEndResultParses() {
        XCTAssertEqual(HectorCallEndResult.parse(Data(#"{"saved":true,"lines":2}"#.utf8)), HectorCallEndResult(saved: true, lines: 2))
        XCTAssertEqual(
            HectorCallEndResult.parse(Data(#"{"saved":false,"reason":"not_pro"}"#.utf8)),
            HectorCallEndResult(saved: false, reason: "not_pro"))
        XCTAssertNil(HectorCallEndResult.parse(Data("{}".utf8)))
    }

    func testAnalysisRunsOncePerStretch() {
        XCTAssertTrue(HectorCall.shouldAnalyse(turnCount: 4, analysedTurnCount: 0, recapAttempted: false))
        XCTAssertFalse(HectorCall.shouldAnalyse(turnCount: 4, analysedTurnCount: 4, recapAttempted: false))
        XCTAssertTrue(HectorCall.shouldAnalyse(turnCount: 6, analysedTurnCount: 4, recapAttempted: false))
    }

    func testAShortCallIsNeverAnalysed() {
        XCTAssertFalse(HectorCall.shouldAnalyse(turnCount: 3, analysedTurnCount: 0, recapAttempted: false))
    }

    func testARecapAlreadyAnalysedTheCall() {
        XCTAssertFalse(HectorCall.shouldAnalyse(turnCount: 8, analysedTurnCount: 0, recapAttempted: true))
    }

    func testFailureReasonsAreNamed() {
        XCTAssertEqual(HectorCall.failureReason(TutorError.aiConsentRequired), "consent")
        XCTAssertEqual(HectorCall.failureReason(TutorError.quotaExceeded(resetsAt: nil)), "quota")
        XCTAssertEqual(HectorCall.failureReason(TutorError.signedOut), "auth")
        XCTAssertEqual(HectorCall.failureReason(TutorError.notEntitled), "auth")
        XCTAssertEqual(HectorCall.failureReason(TutorError.network), "network")
        XCTAssertEqual(HectorCall.failureReason(URLError(.notConnectedToInternet)), "network")
        XCTAssertEqual(HectorCall.failureReason(TutorError.server(message: nil)), "server")
    }
}
