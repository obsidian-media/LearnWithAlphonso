import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class AIConversationClientTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> AIConversationClient {
        AIConversationClient(baseURL: baseURL, accessToken: { "user-access-token" }, requester: response)
    }

    // MARK: - chat

    func testChatPostsMessagesAndSystemPromptAndReturnsTheContent() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi there!"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let reply = try await client.chat(
            messages: [ChatMessage(role: "user", content: "hello")],
            systemPrompt: "You are Mia, a barista."
        )

        XCTAssertEqual(reply, "Hi there!")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/chat"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["systemPrompt"] as? String, "You are Mia, a barista.")
        let messages = payload["messages"] as! [[String: String]]
        XCTAssertEqual(messages, [["role": "user", "content": "hello"]])
    }

    func testChatSurfacesAQuotaError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Daily CHAT limit reached (60/day). Try again tomorrow."])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(
                error as? AIConversationError,
                .server(status: 429, message: "Daily CHAT limit reached (60/day). Try again tomorrow.")
            )
        }
    }

    // MARK: - synthesizeSpeech

    func testSynthesizeSpeechPostsTextAndReturnsTheAudioBytes() async throws {
        var captured: URLRequest?
        let audioBytes = Data([0x49, 0x44, 0x33])
        let client = makeClient { request in
            captured = request
            return (audioBytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let result = try await client.synthesizeSpeech(text: "Welcome!")

        XCTAssertEqual(result, audioBytes)
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/tts"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["text"] as? String, "Welcome!")
        XCTAssertNil(payload["voice"])
    }

    // MARK: - transcribe

    func testTranscribeSendsRawAudioWithContentTypeAndReturnsTheText() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["text": "hello there"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let audio = Data([0x01, 0x02, 0x03])
        let text = try await client.transcribe(audio: audio, mimeType: "audio/m4a")

        XCTAssertEqual(text, "hello there")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/stt"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "audio/m4a")
        XCTAssertEqual(request.httpBody, audio)
    }

    func testTranscribeSurfacesAnEmptyAudioError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Empty or missing audio"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.transcribe(audio: Data(), mimeType: "audio/m4a")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AIConversationError, .server(status: 400, message: "Empty or missing audio"))
        }
    }
}
