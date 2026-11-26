import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class CallRecapTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!
    private let callId = "00000000-0000-4000-8000-0000000000c1"

    private func client(status: Int = 200, body: [String: Any] = [:], capture: TestCapture<URLRequest?>? = nil) -> AIConversationClient {
        AIConversationClient(baseURL: baseURL, accessToken: { "tok" }, requester: { request in
            capture?.value = request
            let data = try! JSONSerialization.data(withJSONObject: body)
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        })
    }

    private func call(learnerTurns n: Int) -> [ChatMessage] {
        (0..<n).flatMap { [ChatMessage(role: "user", content: "u\($0)"), ChatMessage(role: "assistant", content: "ok")] }
    }

    private let recapBody: [String: Any] = [
        "recap": [
            "corrections": [["said": "Soy cansado", "fixed": "Estoy cansado", "why": "estar", "topic": "ser-estar", "label": "Ser or estar"]],
            "phrase": ["text": "¿Me trae la cuenta?", "meaning": "Could you bring me the bill?"],
            "reviewToken": "tok.sig", "saved": true, "reviewCount": 2,
        ],
    ]

    // MARK: recap

    func testShortCallsSendNothing() async {
        let captured = TestCapture<URLRequest?>(nil)
        let recap = await client(body: recapBody, capture: captured).callRecap(callId: callId, transcript: call(learnerTurns: 2))
        XCTAssertNil(recap)
        XCTAssertNil(captured.value, "a call under three learner replies must not reach the network")
        XCTAssertFalse(CallRecap.qualifies(call(learnerTurns: 2)))
        XCTAssertTrue(CallRecap.qualifies(call(learnerTurns: 3)))
    }

    func testRecapPostsTheCallAndParsesTheAnswer() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let recap = await client(body: recapBody, capture: captured).callRecap(callId: callId, transcript: call(learnerTurns: 3), cefrLevel: "A2", scene: "coffee")
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/call-recap"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["callId"] as? String, callId)
        XCTAssertEqual((payload["messages"] as? [[String: String]])?.count, 6)
        let r = try XCTUnwrap(recap)
        XCTAssertEqual(r.corrections.first?.fixed, "Estoy cansado")
        XCTAssertEqual(r.corrections.first?.label, "Ser or estar")
        XCTAssertEqual(r.phrase?.text, "¿Me trae la cuenta?")
        XCTAssertEqual(r.reviewToken, "tok.sig")
        XCTAssertTrue(r.saved)
        XCTAssertEqual(r.reviewCount, 2)
    }

    func testEveryHiddenStateIsNil() async {
        let transcript = call(learnerTurns: 3)
        let none = await client(body: ["recap": NSNull()]).callRecap(callId: callId, transcript: transcript)
        XCTAssertNil(none, "the server's own refusal (a recap already written, an AI error)")
        let empty = await client(body: ["recap": ["corrections": [], "phrase": NSNull()]]).callRecap(callId: callId, transcript: transcript)
        XCTAssertNil(empty)
        for status in [403, 429, 503, 500] {
            let r = await client(status: status, body: ["error": "x"]).callRecap(callId: callId, transcript: transcript)
            XCTAssertNil(r, "status \(status) hides the recap")
        }
        let offline = AIConversationClient(baseURL: baseURL, accessToken: { "tok" }, requester: { _ in throw URLError(.notConnectedToInternet) })
        let r = await offline.callRecap(callId: callId, transcript: transcript)
        XCTAssertNil(r)
    }

    // MARK: Review these

    func testReviewTheseSendsTheTokenBack() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let ok = await client(body: ["added": 2], capture: captured).addRecapToReview(callId: callId, reviewToken: "tok.sig")
        XCTAssertTrue(ok)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/call-recap-review"))
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["reviewToken"] as? String, "tok.sig")
        let failed = await client(status: 400, body: ["error": "invalid-token"]).addRecapToReview(callId: callId, reviewToken: "x")
        XCTAssertFalse(failed)
    }

    // MARK: memory

    private let memoryBody: [String: Any] = [
        "mistakes": [["id": "m1", "course": "es", "topic": "ser-estar", "label": "Ser or estar", "example": "x -> y", "seenCount": 4, "lastSeenAt": "2026-11-14T10:00:00.000Z"]],
        "phrases": [["id": "p1", "course": "es", "text": "¿Me trae la cuenta?", "meaning": "Could you bring me the bill?"]],
        "goals": ["goal": "travel", "dailyMinutes": 10, "interests": ["food", "music"]],
    ]

    func testMemoryIsReadyForProLockedFor403AndFailedOtherwise() async {
        let ready = await client(body: memoryBody).tutorMemory()
        guard case .ready(let memory) = ready else { return XCTFail("expected ready") }
        XCTAssertEqual(memory.mistakes.first?.label, "Ser or estar")
        XCTAssertEqual(memory.phrases.count, 1)
        XCTAssertEqual(memory.summary, "1 mistake, 1 phrase, 3 goals.")
        let locked = await client(status: 403, body: ["error": "not-entitled"]).tutorMemory()
        XCTAssertEqual(locked, .locked)
        let failed = await client(status: 500, body: [:]).tutorMemory()
        XCTAssertEqual(failed, .failed)
    }

    func testGoalLinesAreTheLearnersOwnAnswersAndNothingElse() {
        let memory = TutorMemory(mistakes: [], phrases: [], goals: .init(goal: "travel", dailyMinutes: 10, interests: ["food", "music"]))
        XCTAssertEqual(memory.goalLines.map(\.title), ["Travel", "10 minutes a day", "Food and music"])
        let odd = TutorMemory(mistakes: [], phrases: [], goals: .init(goal: "world domination", dailyMinutes: 7, interests: ["x"]))
        XCTAssertTrue(odd.goalLines.isEmpty)
        XCTAssertTrue(odd.isEmpty)
    }

    func testAgoLabels() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func ago(_ days: Double) -> String { TutorMemory.agoLabel(now.addingTimeInterval(-days * 86_400), now: now) }
        XCTAssertEqual(ago(0), "today")
        XCTAssertEqual(ago(1), "yesterday")
        XCTAssertEqual(ago(2), "2 days ago")
        XCTAssertEqual(ago(8), "last week")
        XCTAssertEqual(ago(21), "3 weeks ago")
        XCTAssertEqual(ago(75), "2 months ago")
    }

    func testDeletesUseTheRightBodiesAndMethods() async throws {
        let one = TestCapture<URLRequest?>(nil)
        let okOne = await client(body: [:], capture: one).removeMemoryLine(id: "m1")
        XCTAssertTrue(okOne)
        XCTAssertEqual(one.value?.httpMethod, "DELETE")
        let p1 = try JSONSerialization.jsonObject(with: try XCTUnwrap(one.value?.httpBody)) as! [String: Any]
        XCTAssertEqual(p1["id"] as? String, "m1")
        let all = TestCapture<URLRequest?>(nil)
        let okAll = await client(body: [:], capture: all).forgetEverything()
        XCTAssertTrue(okAll)
        let p2 = try JSONSerialization.jsonObject(with: try XCTUnwrap(all.value?.httpBody)) as! [String: Any]
        XCTAssertEqual(p2["all"] as? Bool, true)
        let bad = await client(status: 500, body: [:]).forgetEverything()
        XCTAssertFalse(bad)
    }
}

final class CallRecapNoteTests: XCTestCase {
    func testMistakeNoteUsesTheMockWording() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func note(_ days: Double) -> String { TutorMemory.Mistake(id: "i", topic: "t", label: "l", seenCount: 4, lastSeenAt: now.addingTimeInterval(-days * 86_400)).note(now: now) }
        XCTAssertEqual(note(2), "Seen in 4 calls, last 2 days ago")
        XCTAssertEqual(note(9), "Seen in 4 calls, last week")
        XCTAssertEqual(note(0), "Seen in 4 calls, last today")
    }
}

final class CallRecapRobustnessTests: XCTestCase {
    func testTwoCorrectionsOnTheSameTopicHaveDifferentIds() throws {
        let body: [String: Any] = ["recap": ["corrections": [
            ["said": "Soy cansado", "fixed": "Estoy cansado", "why": "estar", "topic": "ser-estar", "label": "Ser or estar"],
            ["said": "Soy en casa", "fixed": "Estoy en casa", "why": "estar", "topic": "ser-estar", "label": "Ser or estar"],
        ], "phrase": NSNull()]]
        let recap = try XCTUnwrap(CallRecap.parse(try JSONSerialization.data(withJSONObject: body)))
        XCTAssertEqual(recap.corrections.count, 2)
        XCTAssertEqual(Set(recap.corrections.map(\.id)).count, 2, "a ForEach needs unique ids")
    }

    func testAFailedAttemptIsARetryNothingToShowAndARefusalAreNot() async {
        let t = call(learnerTurns: 3)
        let flagged = await client(body: ["recap": NSNull(), "retry": true]).callRecapAttempt(callId: callId, transcript: t)
        XCTAssertEqual(flagged, .retry)
        let gateway = await client(status: 502, body: ["error": "x"]).callRecapAttempt(callId: callId, transcript: t)
        XCTAssertEqual(gateway, .retry)
        let none = await client(body: ["recap": NSNull()]).callRecapAttempt(callId: callId, transcript: t)
        XCTAssertEqual(none, .empty)
        for status in [403, 429, 503] {
            let r = await client(status: status, body: ["error": "x"]).callRecapAttempt(callId: callId, transcript: t)
            XCTAssertEqual(r, .empty, "status \(status)")
        }
        let got = await client(body: recapBody).callRecapAttempt(callId: callId, transcript: t)
        guard case .got = got else { return XCTFail("a clean recap is .got") }
        let short = await client(body: recapBody).callRecapAttempt(callId: callId, transcript: call(learnerTurns: 2))
        XCTAssertEqual(short, .empty)
    }

    func testOfflineIsARetry() async {
        let offline = AIConversationClient(baseURL: baseURL, accessToken: { "tok" }, requester: { _ in throw URLError(.notConnectedToInternet) })
        let r = await offline.callRecapAttempt(callId: callId, transcript: call(learnerTurns: 3))
        XCTAssertEqual(r, .retry)
    }

    func testASlowRecapIsGivenUpOnAtTheTotalDeadline() async {
        let client = AIConversationClient(baseURL: URL(string: "https://x.example")!, accessToken: { "tok" }, requester: { _ in
            try await Task.sleep(nanoseconds: 5_000_000_000)
            throw URLError(.timedOut)
        })
        let started = Date()
        let transcript = (0..<3).flatMap { [ChatMessage(role: "user", content: "u\($0)"), ChatMessage(role: "assistant", content: "ok")] }
        let recap = await client.callRecap(callId: "00000000-0000-4000-8000-0000000000c1", transcript: transcript, timeout: 0.3)
        XCTAssertNil(recap)
        XCTAssertLessThan(Date().timeIntervalSince(started), 3, "it must not wait for the slow request")
    }
}
