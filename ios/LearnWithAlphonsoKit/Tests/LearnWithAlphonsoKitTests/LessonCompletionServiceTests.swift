import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// A scripted LessonCompletionAPI: each call pops the next scripted outcome for that endpoint.
final class ScriptedCompletionAPI: LessonCompletionAPI, @unchecked Sendable {
    var starts: [Result<String, Error>]
    var completes: [Result<LessonCompletionResult, Error>]
    private(set) var startCalls = 0
    private(set) var completeTokens: [String] = []
    let accessToken: String
    init(accessToken: String, starts: [Result<String, Error>] = [], completes: [Result<LessonCompletionResult, Error>] = []) {
        self.accessToken = accessToken; self.starts = starts; self.completes = completes
    }
    func startLessonSession(lessonID: String, course: String) async throws -> String {
        startCalls += 1
        return try starts.removeFirst().get()
    }
    func completeLesson(lessonID: String, total: Int, answers: [LessonAnswer], course: String, sessionToken: String) async throws -> LessonCompletionResult {
        completeTokens.append(sessionToken)
        return try completes.removeFirst().get()
    }
}

final class LessonCompletionServiceTests: XCTestCase {
    static let ok = LessonCompletionResult(xpGain: 10, newlyUnlocked: [], heartsBonus: nil,
        progress: LessonCompletionProgress(xp: 10, streak: 1, longestStreak: 1, lastActiveDate: "2026-10-08", hearts: 5, heartsRefillAt: nil, streakFreezes: 0, leagueTier: "bronze"))
    let request = LessonCompletionRequest(lessonID: "u1l1", total: 1, answers: [LessonAnswer(questionId: "q1", answer: "a")], course: "en", sessionToken: nil)

    private func service(_ apis: [String: ScriptedCompletionAPI], tokens: [AccessTokenResult]) -> (LessonCompletionService, TestCapture<[Bool]>) {
        let asked = TestCapture<[Bool]>([])
        let queue = TestCapture(tokens)
        let s = LessonCompletionService(
            token: { force in asked.value.append(force); return queue.value.removeFirst() },
            makeClient: { apis[$0]! })
        return (s, asked)
    }

    func testStartsThenCompletesWhenNoTokenIsHeld() async {
        let api = ScriptedCompletionAPI(accessToken: "a", starts: [.success("s1")], completes: [.success(Self.ok)])
        let (s, _) = service(["a": api], tokens: [.token("a")])
        let result = await s.complete(request)
        XCTAssertEqual(try? result.get(), Self.ok)
        XCTAssertEqual(api.completeTokens, ["s1"])
    }

    /// The token fetched when the lesson opened is the one used; no second start (which would hit the hearts
    /// gate if the learner lost the last heart during the lesson).
    func testAHeldSessionTokenIsUsedAndStartIsNotCalledAgain() async {
        let api = ScriptedCompletionAPI(accessToken: "a", completes: [.success(Self.ok)])
        let (s, _) = service(["a": api], tokens: [.token("a")])
        let held = LessonCompletionRequest(lessonID: "u1l1", total: 1, answers: request.answers, course: "en", sessionToken: "held")
        _ = await s.complete(held)
        XCTAssertEqual(api.startCalls, 0)
        XCTAssertEqual(api.completeTokens, ["held"])
    }

    func testA401RefreshesOnceAndRetriesWithTheNewAccessToken() async {
        let stale = ScriptedCompletionAPI(accessToken: "a", starts: [.failure(ProgressSyncError.server(status: 401, message: nil))])
        let fresh = ScriptedCompletionAPI(accessToken: "b", starts: [.success("s1")], completes: [.success(Self.ok)])
        let (s, asked) = service(["a": stale, "b": fresh], tokens: [.token("a"), .token("b")])
        let result = await s.complete(request)
        XCTAssertEqual(try? result.get(), Self.ok)
        XCTAssertEqual(asked.value, [false, true])
    }

    func testASecond401IsUnauthorizedNotALoop() async {
        let a = ScriptedCompletionAPI(accessToken: "a", starts: [.failure(ProgressSyncError.server(status: 401, message: nil))])
        let b = ScriptedCompletionAPI(accessToken: "b", starts: [.failure(ProgressSyncError.server(status: 401, message: nil))])
        let (s, asked) = service(["a": a, "b": b], tokens: [.token("a"), .token("b")])
        let result = await s.complete(request)
        XCTAssertEqual(result.failure, .unauthorized)
        XCTAssertEqual(asked.value.count, 2)
    }

    func testAnExpiredHeldTokenIsReMintedOnce() async {
        let api = ScriptedCompletionAPI(accessToken: "a", starts: [.success("fresh")],
            completes: [.failure(ProgressSyncError.server(status: 403, message: "Invalid or expired lesson session")), .success(Self.ok)])
        let (s, _) = service(["a": api], tokens: [.token("a")])
        let held = LessonCompletionRequest(lessonID: "u1l1", total: 1, answers: request.answers, course: "en", sessionToken: "old")
        let result = await s.complete(held)
        XCTAssertEqual(try? result.get(), Self.ok)
        XCTAssertEqual(api.completeTokens, ["old", "fresh"])
    }

    func testOutOfHeartsAtReMintIsRejectedWithItsCode() async {
        let api = ScriptedCompletionAPI(accessToken: "a", starts: [.failure(ProgressSyncError.outOfHearts(refillAt: nil))],
            completes: [.failure(ProgressSyncError.server(status: 403, message: "Invalid or expired lesson session"))])
        let (s, _) = service(["a": api], tokens: [.token("a")])
        let held = LessonCompletionRequest(lessonID: "u1l1", total: 1, answers: request.answers, course: "en", sessionToken: "old")
        let result = await s.complete(held)
        XCTAssertEqual(result.failure, .rejected(code: "out-of-hearts"))
    }

    func testNoTokenMapsToUnauthorizedOrOffline() async {
        let (signedOut, _) = service([:], tokens: [.signedOut])
        let first = await signedOut.complete(request)
        XCTAssertEqual(first.failure, .unauthorized)
        let (unreachable, _) = service([:], tokens: [.unreachable])
        let second = await unreachable.complete(request)
        XCTAssertEqual(second.failure, .offline)
    }

    func testVersionMismatchIsRejectedAndNotRetried() async {
        let api = ScriptedCompletionAPI(accessToken: "a", starts: [.success("s")],
            completes: [.failure(ProgressSyncError.server(status: 409, message: "lesson-version-mismatch"))])
        let (s, _) = service(["a": api], tokens: [.token("a")])
        let result = await s.complete(request)
        XCTAssertEqual(result.failure, .rejected(code: "lesson-version-mismatch"))
        XCTAssertEqual(api.completeTokens.count, 1)
    }
}

private extension Result {
    var failure: Failure? { if case let .failure(e) = self { return e }; return nil }
}
