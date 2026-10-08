import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class TutorConversationClientTests: XCTestCase {
    private let endpoint = URL(string: "https://learn.alphonsoecosystem.app/api/hector-respond")!

    private func makeClient(
        refresh: (@Sendable () async -> String?)? = nil,
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> TutorConversationClient {
        TutorConversationClient(
            endpoint: endpoint, accessToken: { "test-access-token" }, refreshAccessToken: refresh, requester: response)
    }

    private func jsonResponse(_ body: [String: Any], status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        return (data, HTTPURLResponse(url: endpoint, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private var okReply: [String: Any] {
        [
            "request_id": "r1", "session_id": "s1", "agent": "tutor", "reply": "Très bien !",
            "audio_base64": "AAAA", "tts_model": "aura-2-agathe-fr", "tts_provider": "deepgram",
            "language": "fr", "state": "ok", "timings_ms": ["llm": 100, "tts": 200, "total": 300],
        ]
    }

    private func respond(_ client: TutorConversationClient, course: String = "en") async throws -> TutorReply {
        try await client.respond(sessionID: "s1", text: "hi", course: course, cefrLevel: nil, history: [])
    }

    func testSendsCourseLevelAndHistoryAndNoDeviceIdentifier() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(self.okReply)
        }

        _ = try await client.respond(
            sessionID: "s1", text: "Je suis allé au marché", course: "fr", cefrLevel: "B1",
            history: [TutorConversationMessage(role: "assistant", content: "Salut !")]
        )

        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-access-token")
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Alphonso-Device-Id"))
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["course"] as? String, "fr")
        XCTAssertEqual(payload["language"] as? String, "fr")
        XCTAssertEqual(payload["cefr_level"] as? String, "B1")
        XCTAssertEqual(payload["text"] as? String, "Je suis allé au marché")
        XCTAssertEqual(payload["agent_id"] as? String, "tutor")
        XCTAssertEqual((payload["history"] as? [[String: String]])?.count, 1)
    }

    /// The client sends exactly the history it is given; the current utterance travels only as `text`.
    func testHistoryExcludesTheCurrentUtterance() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(self.okReply)
        }
        _ = try await client.respond(sessionID: "s1", text: "Hola", course: "es", cefrLevel: nil, history: [])
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(captured.value?.httpBody)) as! [String: Any]
        XCTAssertEqual((payload["history"] as? [[String: String]])?.count, 0)
        XCTAssertNil(payload["cefr_level"])
    }

    func testDecodesARealSuccessfulResponse() async throws {
        let client = makeClient { _ in self.jsonResponse(self.okReply) }
        let reply = try await respond(client, course: "fr")
        XCTAssertEqual(reply.reply, "Très bien !")
        XCTAssertEqual(reply.language, "fr")
        XCTAssertEqual(reply.timingsMs.total, 300)
    }

    /// hector-respond returns {error:"not-entitled"}; the old client read only `detail`, so this showed as a
    /// generic failure.
    func testNotEntitledIsTyped() async {
        let client = makeClient { _ in self.jsonResponse(["error": "not-entitled"], status: 403) }
        do {
            _ = try await respond(client)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? TutorError, .notEntitled)
        }
    }

    func testDetailIsStillRead() async {
        let client = makeClient { _ in self.jsonResponse(["detail": "Cloud voice service is not configured"], status: 503) }
        do {
            _ = try await respond(client)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? TutorError, .server(message: "Cloud voice service is not configured"))
        }
    }

    func testRetriesOnceAfter401WithARefreshedToken() async throws {
        let headers = TestCapture<[String?]>([])
        let client = TutorConversationClient(
            endpoint: endpoint,
            accessToken: { "stale" },
            refreshAccessToken: { "fresh" },
            requester: { request in
                headers.value.append(request.value(forHTTPHeaderField: "Authorization"))
                if headers.value.count == 1 { return self.jsonResponse([:], status: 401) }
                return self.jsonResponse(self.okReply)
            }
        )
        _ = try await respond(client, course: "fr")
        XCTAssertEqual(headers.value, ["Bearer stale", "Bearer fresh"])
    }

    func testA401AfterTheRefreshIsSignedOut() async {
        let client = makeClient(refresh: { "still-bad" }) { _ in self.jsonResponse([:], status: 401) }
        do {
            _ = try await respond(client, course: "fr")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? TutorError, .signedOut)
        }
    }

    func testTransportFailureIsNetwork() async {
        let client = makeClient { _ in throw URLError(.networkConnectionLost) }
        do {
            _ = try await respond(client, course: "fr")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? TutorError, .network)
        }
    }

    private func refusal(status: Int, error: String) -> TutorConversationClient {
        makeClient { _ in self.jsonResponse(["error": error], status: status) }
    }

    func testAConsentRefusalCodeIsAnnouncedButNeverShown() async {
        let announced = expectation(forNotification: AIConsentSignal.requiredNotification, object: nil)
        do {
            _ = try await respond(refusal(status: 403, error: "ai-consent-required"))
            XCTFail("Expected an error to be thrown")
        } catch {
            XCTAssertEqual(error as? TutorError, .aiConsentRequired)
            XCTAssertFalse((error as? TutorError)?.userMessage().contains("ai-consent-required") ?? true)
        }
        await fulfillment(of: [announced], timeout: 2)
    }

    /// Machine codes in "error" are never the message a learner reads.
    func testMachineCodesInTheErrorFieldAreNotThrownAsMessages() async {
        let cases: [(Int, String)] = [
            (401, "unauthorized"), (500, "Hector is not configured"),
            (400, "text required"), (502, "empty reply from model"),
        ]
        for (status, code) in cases {
            do {
                _ = try await respond(refusal(status: status, error: code))
                XCTFail("Expected an error to be thrown")
            } catch {
                let tutorError = error as? TutorError
                XCTAssertNotNil(tutorError, code)
                if case let .server(message) = tutorError { XCTAssertNil(message, code) }
            }
        }
    }

    func testAConsentCheckFailureIsNotAConsentRefusal() async {
        let notAnnounced = expectation(forNotification: AIConsentSignal.requiredNotification, object: nil)
        notAnnounced.isInverted = true
        do {
            _ = try await respond(refusal(status: 503, error: "consent-check-failed"))
            XCTFail("Expected an error to be thrown")
        } catch {
            XCTAssertEqual(error as? TutorError, .server(message: nil))
        }
        await fulfillment(of: [notAnnounced], timeout: 0.3)
    }
}
