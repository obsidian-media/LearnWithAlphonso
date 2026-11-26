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

    func testCallEndNeedsThreeLearnerTurns() {
        var tracker = HectorCall.Tracker()
        XCTAssertFalse(tracker.claimCallEnd(turns: learnerTurns(2)))
        XCTAssertTrue(tracker.claimCallEnd(turns: learnerTurns(3)))
    }

    func testCallEndIsSentOncePerCallId() {
        let store = ConversationStore()
        var tracker = HectorCall.Tracker()
        XCTAssertTrue(tracker.claimCallEnd(turns: learnerTurns(3)))
        // Hang-up then leaving the screen: the second claim for the same call is refused.
        XCTAssertFalse(tracker.claimCallEnd(turns: learnerTurns(3)))
        tracker.startNewCall(store: store, course: .english)
        XCTAssertTrue(tracker.claimCallEnd(turns: learnerTurns(3)), "Call again is a new call with its own call-end")
    }

    func testCallEndSentMeansNoSeparateAnalysisAndShortCallsFallBack() {
        let store = ConversationStore()
        var tracker = HectorCall.Tracker()
        XCTAssertFalse(tracker.claimCallEnd(turns: learnerTurns(2)))
        XCTAssertFalse(tracker.recapAttempted, "a short call sent no call-end, so the analysis is the fallback")
        XCTAssertTrue(tracker.claimCallEnd(turns: learnerTurns(3)))
        XCTAssertTrue(tracker.recapAttempted)
        XCTAssertFalse(HectorCall.shouldAnalyse(turnCount: 7, analysedTurnCount: 0, recapAttempted: tracker.recapAttempted))
        tracker.startNewCall(store: store, course: .english)
        XCTAssertFalse(tracker.recapAttempted)
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
