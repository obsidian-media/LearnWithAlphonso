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
        XCTAssertNil(payload["cefrLevel"])
        let messages = payload["messages"] as! [[String: String]]
        XCTAssertEqual(messages, [["role": "user", "content": "hello"]])
    }

    func testChatIncludesCefrLevelWhenProvided() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi!"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        _ = try await client.chat(
            messages: [ChatMessage(role: "user", content: "hello")],
            systemPrompt: "Be nice",
            cefrLevel: "A2"
        )

        let request = try XCTUnwrap(captured)
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["cefrLevel"] as? String, "A2")
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

    // MARK: - analyzeWeaknesses

    func testAnalyzeWeaknessesPostsTheTranscriptAndReturnsTheCount() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["weaknessesDetected": 2])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let count = try await client.analyzeWeaknesses(transcript: [
            ChatMessage(role: "assistant", content: "Hi! How was your weekend?"),
            ChatMessage(role: "user", content: "I go to the park yesterday."),
        ])

        XCTAssertEqual(count, 2)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/analyze-weaknesses"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        let messages = payload["messages"] as! [[String: String]]
        XCTAssertEqual(messages, [
            ["role": "assistant", "content": "Hi! How was your weekend?"],
            ["role": "user", "content": "I go to the park yesterday."],
        ])
    }

    func testAnalyzeWeaknessesSurfacesAQuotaError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Daily CHAT limit reached (60/day). Try again tomorrow."])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.analyzeWeaknesses(transcript: [ChatMessage(role: "user", content: "hi")])
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(
                error as? AIConversationError,
                .server(status: 429, message: "Daily CHAT limit reached (60/day). Try again tomorrow.")
            )
        }
    }

    // MARK: - generatePractice (V3 pkg 4b)

    func testGeneratePracticePostsTheLessonAndReturnsParsedQuestions() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: [
                "questions": [
                    ["prompt": "He ___ to work.", "choices": ["drive", "drives", "drove", "driven"], "answerIndex": 1, "explanation": "why"],
                ],
            ])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let questions = try await client.generatePractice(lessonID: "u1l1", course: "en")

        XCTAssertEqual(questions, [
            GeneratedPracticeQuestion(prompt: "He ___ to work.", choices: ["drive", "drives", "drove", "driven"], answerIndex: 1, explanation: "why"),
        ])
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/generate-practice"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["course"] as? String, "en")
    }

    func testGeneratePracticeReturnsAnEmptyArrayWhenNoneWereGenerated() async throws {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["questions": [] as [Any]])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let questions = try await client.generatePractice(lessonID: "u1l1", course: "en")
        XCTAssertEqual(questions, [])
    }

    func testGeneratePracticeSurfacesAQuotaError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "slow down"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!)
        }
        do {
            _ = try await client.generatePractice(lessonID: "u1l1", course: "en")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AIConversationError, .server(status: 429, message: "slow down"))
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
        let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")

        XCTAssertEqual(result.text, "hello there")
        XCTAssertNil(result.confidence)
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/stt"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "audio/m4a")
        XCTAssertEqual(request.httpBody, audio)
    }

    func testTranscribeReturnsTheConfidenceWhenDeepgramReportsOne() async throws {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["text": "good morning", "confidence": 0.93])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let result = try await client.transcribe(audio: Data([0x01]), mimeType: "audio/m4a")

        XCTAssertEqual(result.text, "good morning")
        XCTAssertEqual(result.confidence, 0.93)
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

    // MARK: - gradeTranslation (no prior coverage -- added alongside the
    // new placementId overload the iOS placement exam needs)

    func testGradeTranslationWithLessonIdPostsTheExpectedBody() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["correct": true, "reason": NSNull()])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let verdict = try XCTUnwrap(await client.gradeTranslation(
            lessonId: "u1l1", questionId: "q1", submission: "Good morning.", course: "en"
        ))

        XCTAssertTrue(verdict.correct)
        XCTAssertNil(verdict.reason)
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/grade-translation"))
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["questionId"] as? String, "q1")
        XCTAssertNil(payload["placementId"])
    }

    func testGradeTranslationWithPlacementIdPostsTheExpectedBody() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["correct": false, "reason": "not quite"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let verdict = try XCTUnwrap(await client.gradeTranslation(
            placementId: "p60", submission: "Good day.", course: "en"
        ))

        XCTAssertFalse(verdict.correct)
        XCTAssertEqual(verdict.reason, "not quite")
        let request = try XCTUnwrap(captured)
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["placementId"] as? String, "p60")
        XCTAssertNil(payload["lessonId"])
        XCTAssertNil(payload["questionId"])
    }

    func testGradeTranslationReturnsNilOnAnyFailureRatherThanThrowing() async {
        let client = makeClient { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
        }
        let verdict = await client.gradeTranslation(placementId: "p60", submission: "x", course: "en")
        XCTAssertNil(verdict)
    }
}
