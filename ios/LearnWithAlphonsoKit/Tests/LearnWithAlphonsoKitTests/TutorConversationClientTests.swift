import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class TutorConversationClientTests: XCTestCase {
    private let endpoint = URL(string: "https://voice.obsidianmedia.online/v1/voice/respond")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> TutorConversationClient {
        TutorConversationClient(
            endpoint: endpoint,
            accessToken: { "test-access-token" },
            deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8",
            requester: response
        )
    }

    private func jsonResponse(_ body: [String: Any], status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let response = HTTPURLResponse(url: endpoint, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }

    func testSendsATutorRequestWithTheCorrectPayloadAndHeaders() async throws {
        var capturedRequest: URLRequest?
        let client = makeClient { request in
            capturedRequest = request
            return self.jsonResponse([
                "request_id": "r1", "session_id": "s1", "agent": "tutor", "reply": "Great job!",
                "audio_base64": "AAAA", "tts_model": "magpie", "tts_provider": "nvidia",
                "language": "en-US", "state": "idle",
                "timings_ms": ["llm": 100, "tts": 200, "total": 300],
            ])
        }

        _ = try await client.respond(sessionID: "s1", text: "I go to store yesterday", language: "en-US", history: [])

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Alphonso-Device-Id"), "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8")

        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["agent_id"] as? String, "tutor")
        XCTAssertEqual(payload["text"] as? String, "I go to store yesterday")
        XCTAssertEqual(payload["language"] as? String, "en-US")
        XCTAssertEqual(payload["session_id"] as? String, "s1")
    }

    func testDecodesARealSuccessfulResponse() async throws {
        let client = makeClient { _ in
            self.jsonResponse([
                "request_id": "r1", "session_id": "s1", "agent": "tutor", "reply": "Great job!",
                "audio_base64": "AAAA", "tts_model": "magpie", "tts_provider": "nvidia",
                "language": "en-US", "state": "idle",
                "timings_ms": ["llm": 100, "tts": 200, "total": 300],
            ])
        }

        let reply = try await client.respond(sessionID: "s1", text: "hi", language: "en-US", history: [])

        XCTAssertEqual(reply.reply, "Great job!")
        XCTAssertEqual(reply.audioBase64, "AAAA")
        XCTAssertEqual(reply.timingsMs.total, 300)
    }

    func testIncludesConversationHistoryInThePayload() async throws {
        var capturedRequest: URLRequest?
        let client = makeClient { request in
            capturedRequest = request
            return self.jsonResponse([
                "request_id": "r1", "session_id": "s1", "agent": "tutor", "reply": "ok",
                "audio_base64": "", "tts_model": "magpie", "tts_provider": "nvidia",
                "language": "en-US", "state": "idle",
                "timings_ms": ["llm": 0, "tts": 0, "total": 0],
            ])
        }

        let history = [
            TutorConversationMessage(role: "user", content: "I go to store yesterday"),
            TutorConversationMessage(role: "assistant", content: "Try: I went to the store yesterday."),
        ]
        _ = try await client.respond(sessionID: "s1", text: "Ok, I went to the store.", language: "en-US", history: history)

        let request = try XCTUnwrap(capturedRequest)
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        let sentHistory = try XCTUnwrap(payload["history"] as? [[String: String]])
        XCTAssertEqual(sentHistory.count, 2)
        XCTAssertEqual(sentHistory[0]["role"], "user")
        XCTAssertEqual(sentHistory[1]["content"], "Try: I went to the store yesterday.")
    }

    func testThrowsAReadableErrorOn503WithADetailMessage() async {
        let client = makeClient { _ in
            let body = try! JSONSerialization.data(withJSONObject: ["detail": "Cloud voice service is not configured"])
            let response = HTTPURLResponse(url: self.endpoint, statusCode: 503, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.respond(sessionID: "s1", text: "hi", language: "en-US", history: [])
            XCTFail("Expected an error to be thrown")
        } catch {
            XCTAssertEqual(error as? TutorConversationError, .server(status: 503, message: "Cloud voice service is not configured"))
        }
    }

    func testThrowsAReadableErrorOn401WhenTheDeviceIsNotEnrolled() async {
        let client = makeClient { _ in
            let response = HTTPURLResponse(url: self.endpoint, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (Data(), response)
        }

        do {
            _ = try await client.respond(sessionID: "s1", text: "hi", language: "en-US", history: [])
            XCTFail("Expected an error to be thrown")
        } catch {
            XCTAssertEqual(error as? TutorConversationError, .server(status: 401, message: nil))
        }
    }
}
