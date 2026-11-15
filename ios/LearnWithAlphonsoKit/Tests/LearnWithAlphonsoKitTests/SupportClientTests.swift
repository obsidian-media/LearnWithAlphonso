import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class SupportClientTests: XCTestCase {
    private let baseURL = URL(string: "https://learn.example.test")!

    private func response(_ request: URLRequest, status: Int = 200) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
    }

    private func json(_ object: Any) -> Data { try! JSONSerialization.data(withJSONObject: object) }

    private func makeClient(
        refresh: (@Sendable () async -> String?)? = nil,
        requester: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> SupportClient {
        SupportClient(baseURL: baseURL, accessToken: { "access-1" }, refreshAccessToken: refresh, requester: requester)
    }

    private var conversationJSON: [String: Any] {
        [
            "status": "open", "unread": 1, "aiAvailable": false,
            "messages": [
                ["id": 1, "kind": "you", "body": "Pro is missing", "at": "2026-11-14T10:00:00.000Z"],
                ["id": 2, "kind": "ai", "body": "Tap Restore.", "at": "2026-11-14T10:00:05.000Z", "link": "subscription"],
                ["id": 3, "kind": "support", "body": "Hello, this is a person.", "at": "2026-11-14T11:00:00.000Z", "link": "league"],
            ],
        ]
    }

    // MARK: - The requests

    func testTheConversationReadIsAGetWithTheBearerTokenTheChannelAndNoBody() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return (self.json(self.conversationJSON), self.response(request))
        }
        _ = try await client.fetchConversation()
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/support/conversation"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client"), "ios")
        XCTAssertNil(request.httpBody)
    }

    func testASendCarriesOnlyTheTextAndTheClientId() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return (self.json(["status": "new", "messages": [["id": 9, "kind": "you", "body": "hi", "at": "2026-11-14T10:00:00Z"]]]), self.response(request))
        }
        let update = try await client.sendMessage(text: "hi", clientID: "3f1c2a52-7b0e-4a39-9d57-0f7bd7b9c001")
        XCTAssertEqual(update.status, .new)
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/support/message"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: Any]
        // No author, no kind, no conversation id and no user id can be forged from here: the server takes them
        // from the session.
        XCTAssertEqual(Set(payload.keys), ["text", "clientId"])
        XCTAssertEqual(payload["text"] as? String, "hi")
        XCTAssertEqual(payload["clientId"] as? String, "3f1c2a52-7b0e-4a39-9d57-0f7bd7b9c001")
    }

    func testTheHandoffPostsAnEmptyObject() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return (self.json(["status": "new", "messages": []]), self.response(request))
        }
        _ = try await client.requestHandoff()
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/support/handoff"))
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertTrue(payload.isEmpty)
    }

    // MARK: - Decoding

    func testTheConversationDecodesWithLinksOnAiRowsOnly() async throws {
        let client = makeClient { request in (self.json(self.conversationJSON), self.response(request)) }
        let conversation = try await client.fetchConversation()
        XCTAssertEqual(conversation.status, .open)
        XCTAssertEqual(conversation.unread, 1)
        XCTAssertFalse(conversation.aiAvailable)
        XCTAssertEqual(conversation.messages.map(\.kind), [.you, .ai, .support])
        XCTAssertNil(conversation.messages[0].link)
        XCTAssertEqual(conversation.messages[1].link, .subscription)
        // A `link` on a staff row is ignored: only an AI answer carries one.
        XCTAssertNil(conversation.messages[2].link)
    }

    func testOnlyAPersonsReplyCarriesAStaffFirstNameTrimmedAndAnEmptyOneIsNone() throws {
        let rows: [[String: Any]] = [
            ["id": 1, "kind": "you", "body": "a", "at": "2026-11-14T10:00:00.000Z", "staffName": "Forged"],
            ["id": 2, "kind": "ai", "body": "b", "at": "2026-11-14T10:00:00.000Z", "staffName": "Forged"],
            ["id": 3, "kind": "system", "body": "c", "at": "2026-11-14T10:00:00.000Z", "staffName": "Forged"],
            ["id": 4, "kind": "support", "body": "d", "at": "2026-11-14T10:00:00.000Z", "staffName": " Dana "],
            ["id": 5, "kind": "support", "body": "e", "at": "2026-11-14T10:00:00.000Z", "staffName": "  "],
            ["id": 6, "kind": "support", "body": "f", "at": "2026-11-14T10:00:00.000Z"],
        ]
        let data = json(["status": "open", "messages": rows])
        let update = try XCTUnwrap(SupportDecoding.update(data))
        XCTAssertEqual(update.messages.map(\.staffName), [nil, nil, nil, "Dana", nil, nil])
    }

    func testAnAiBodyThatStillHoldsTheMarkerIsCleaned() throws {
        let data = json([
            "status": "ai", "messages": [["id": 4, "kind": "ai", "body": "Open it.\n\n[[link:settings]]", "at": "2026-11-14T10:00:00Z"]],
        ])
        let update = try XCTUnwrap(SupportDecoding.update(data))
        XCTAssertEqual(update.messages[0].body, "Open it.")
        XCTAssertEqual(update.messages[0].link, .settings)
    }

    func testOneBadRowFailsTheWholeReplyInsteadOfDroppingAMessage() {
        let badKind = json(["status": "open", "messages": [["id": 1, "kind": "robot", "body": "x", "at": "t"]]])
        XCTAssertNil(SupportDecoding.update(badKind))
        let missingBody = json(["status": "open", "messages": [["id": 1, "kind": "you", "at": "t"]]])
        XCTAssertNil(SupportDecoding.update(missingBody))
        let badStatus = json(["status": "closed", "messages": []])
        XCTAssertNil(SupportDecoding.update(badStatus))
        let noUnread = json(["status": "open", "messages": [], "aiAvailable": true])
        XCTAssertNil(SupportDecoding.conversation(noUnread))
        let negativeUnread = json(["status": "open", "messages": [], "aiAvailable": true, "unread": -1])
        XCTAssertNil(SupportDecoding.conversation(negativeUnread))
    }

    func testAMalformedBodyIsAFailureNotACrash() async {
        let client = makeClient { request in (Data("not json".utf8), self.response(request)) }
        do {
            _ = try await client.fetchConversation()
            XCTFail("expected a failure")
        } catch {
            XCTAssertEqual(error as? SupportErrorKind, .failed)
        }
    }

    func testNoConversationYetIsTheNoneStatus() throws {
        let data = json(["status": "none", "unread": 0, "aiAvailable": true, "messages": []])
        let conversation = try XCTUnwrap(SupportDecoding.conversation(data))
        XCTAssertEqual(conversation.status, SupportStatus.none)
        XCTAssertTrue(conversation.messages.isEmpty)
    }

    // MARK: - Errors

    func testErrorsMapTheWayTheWebMapsThem() {
        XCTAssertEqual(SupportErrorKind.from(status: 503, error: "support-unreachable", which: nil), .unreachable)
        XCTAssertEqual(SupportErrorKind.from(status: 429, error: "support-message-limit", which: "daily"), .dailyLimit)
        XCTAssertEqual(SupportErrorKind.from(status: 429, error: "support-message-limit", which: nil), .dailyLimit)
        XCTAssertEqual(SupportErrorKind.from(status: 429, error: "support-message-limit", which: "conversation"), .conversationLimit)
        // A 429 or 503 for any other reason is a plain failure, not a limit.
        XCTAssertEqual(SupportErrorKind.from(status: 429, error: "rate-limited", which: nil), .failed)
        XCTAssertEqual(SupportErrorKind.from(status: 503, error: nil, which: nil), .failed)
        XCTAssertEqual(SupportErrorKind.from(status: 500, error: "Could not send your message.", which: nil), .failed)
        XCTAssertEqual(SupportErrorKind.from(status: 400, error: "invalid-request", which: nil), .failed)
    }

    func testTheServersErrorBodyReachesTheKind() async {
        let client = makeClient { request in
            (self.json(["error": "support-message-limit", "which": "conversation"]), self.response(request, status: 429))
        }
        do {
            _ = try await client.sendMessage(text: "x", clientID: "id")
            XCTFail("expected a failure")
        } catch {
            XCTAssertEqual(error as? SupportErrorKind, .conversationLimit)
        }
    }

    func testNoNetworkIsOfflineAndNothingElse() async {
        let client = makeClient { _ in throw URLError(.notConnectedToInternet) }
        do {
            _ = try await client.fetchConversation()
            XCTFail("expected a failure")
        } catch {
            XCTAssertEqual(error as? SupportErrorKind, .offline)
        }
    }

    func testA401RefreshesTheTokenAndRetriesOnce() async throws {
        let seen = TestCapture<[String]>([])
        let client = makeClient(refresh: { "access-2" }) { request in
            seen.value.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
            if seen.value.count == 1 { return (Data(), self.response(request, status: 401)) }
            return (self.json(self.conversationJSON), self.response(request))
        }
        _ = try await client.fetchConversation()
        XCTAssertEqual(seen.value, ["Bearer access-1", "Bearer access-2"])
    }
}
