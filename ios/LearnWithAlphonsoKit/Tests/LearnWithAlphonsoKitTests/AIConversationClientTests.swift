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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi there!"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let reply = try await client.chat(
            messages: [ChatMessage(role: "user", content: "hello")],
            systemPrompt: "You are Mia, a barista."
        )

        XCTAssertEqual(reply, "Hi there!")
        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi!"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        _ = try await client.chat(
            messages: [ChatMessage(role: "user", content: "hello")],
            systemPrompt: "Be nice",
            cefrLevel: "A2"
        )

        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["weaknessesDetected": 2])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let count = try await client.analyzeWeaknesses(transcript: [
            ChatMessage(role: "assistant", content: "Hi! How was your weekend?"),
            ChatMessage(role: "user", content: "I go to the park yesterday."),
        ])

        XCTAssertEqual(count, 2)
        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
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
        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let audioBytes = Data([0x49, 0x44, 0x33])
        let client = makeClient { request in
            captured.value = request
            return (audioBytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let result = try await client.synthesizeSpeech(text: "Welcome!")

        XCTAssertEqual(result, audioBytes)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/tts"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["text"] as? String, "Welcome!")
        XCTAssertNil(payload["voice"])
    }

    // MARK: - transcribe

    /// Found live 2026-09-28: this test used to assert the WRONG wire
    /// format as if it were correct (a raw binary body, Content-Type set
    /// to the mime type) -- exactly matching what the client used to
    /// send, and exactly why a real, structural "every single call fails"
    /// bug (api/stt.ts expects multipart/form-data with a field literally
    /// named "file"; a raw-body POST isn't multipart, so the server found
    /// nothing and returned "Empty or missing audio" unconditionally) went
    /// undetected through three rounds of unrelated recording-side fixes.
    /// The mock here never exercised the real server code, so nothing
    /// ever caught the client and server disagreeing about wire format.
    /// Rewritten to assert the multipart body actually matches what the
    /// web client (`use-speech-capture.ts`) sends and `api/stt.ts` parses.
    func testTranscribeSendsMultipartFormDataWithAFileFieldAndReturnsTheText() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["text": "hello there"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let audio = Data([0x01, 0x02, 0x03])
        let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")

        XCTAssertEqual(result.text, "hello there")
        XCTAssertNil(result.confidence)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/stt"))
        let contentType = try XCTUnwrap(request.value(forHTTPHeaderField: "Content-Type"))
        XCTAssertTrue(contentType.hasPrefix("multipart/form-data; boundary="))
        let boundary = String(contentType.dropFirst("multipart/form-data; boundary=".count))
        let body = try XCTUnwrap(request.httpBody)
        let bodyString = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(bodyString.contains("--\(boundary)"))
        XCTAssertTrue(bodyString.contains("Content-Disposition: form-data; name=\"file\""))
        XCTAssertTrue(bodyString.contains("Content-Type: audio/m4a"))
        // The raw audio bytes must appear in the body verbatim, not just
        // the framing around them -- this is the actual regression check:
        // a multipart envelope with the wrong/no payload would still pass
        // every string assertion above.
        XCTAssertTrue(body.range(of: audio) != nil)
    }

    /// French/Spanish speaking questions never sent their real course to
    /// api/stt.ts before this -- found 2026-09-28 alongside the
    /// wire-format fix above.
    func testTranscribeIncludesTheCourseFieldWhenProvided() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["text": "bonjour"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        _ = try await client.transcribe(audio: Data([0x01]), mimeType: "audio/m4a", course: "fr")

        let request = try XCTUnwrap(captured.value)
        let body = try XCTUnwrap(request.httpBody)
        let bodyString = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(bodyString.contains("Content-Disposition: form-data; name=\"course\""))
        XCTAssertTrue(bodyString.contains("\r\n\r\nfr\r\n"))
    }

    func testTranscribeOmitsTheCourseFieldWhenNil() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["text": "hello"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        _ = try await client.transcribe(audio: Data([0x01]), mimeType: "audio/m4a")

        let request = try XCTUnwrap(captured.value)
        let body = try XCTUnwrap(request.httpBody)
        let bodyString = String(decoding: body, as: UTF8.self)
        XCTAssertFalse(bodyString.contains("name=\"course\""))
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

    // MARK: - 401 retry (chat/transcribe/synthesizeSpeech only -- these
    // three are the ones a Practice-tab turn actually calls; see
    // Session.freshAccessToken's own doc comment in the main repo for the
    // root cause this exists to work around: a token minted once at cold
    // launch and never refreshed again until this fix).

    func testChatRetriesOnceAfter401WithARefreshedToken() async throws {
        let capturedAuthHeaders = TestCapture<[String?]>([])
        let callCount = TestCapture(0)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                callCount.value += 1
                capturedAuthHeaders.value.append(request.value(forHTTPHeaderField: "Authorization"))
                if callCount.value == 1 {
                    return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
                }
                let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi there!"])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )

        let reply = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)

        XCTAssertEqual(reply, "Hi there!")
        XCTAssertEqual(callCount.value, 2)
        XCTAssertEqual(capturedAuthHeaders.value, ["Bearer stale-token", "Bearer fresh-token"])
    }

    func testChatDoesNotRetryWhenNoRefreshHandlerIsProvided() async {
        let callCount = TestCapture(0)
        // makeClient's default has no refreshAccessToken -- unaffected callers
        // (export/delete, and every existing test above) must see identical
        // behavior to before this fix: exactly one attempt, the 401 surfaced.
        let client = makeClient { request in
            callCount.value += 1
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AIConversationError, .server(status: 401, message: nil))
        }
        XCTAssertEqual(callCount.value, 1)
    }

    func testChatSurfacesTheOriginal401WhenRefreshFails() async {
        let callCount = TestCapture(0)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { nil },
            requester: { request in
                callCount.value += 1
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
            }
        )

        do {
            _ = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AIConversationError, .server(status: 401, message: nil))
        }
        // A refresh failure (e.g. the refresh token itself is dead) means
        // Session has already signed out -- retrying with the same stale
        // token again would just 401 a second time for no new information.
        XCTAssertEqual(callCount.value, 1)
    }

    func testChatDoesNotRetryASecondTimeIfTheRefreshedTokenAlsoGets401() async {
        let callCount = TestCapture(0)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "still-somehow-bad-token" },
            requester: { request in
                callCount.value += 1
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
            }
        )

        do {
            _ = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AIConversationError, .server(status: 401, message: nil))
        }
        XCTAssertEqual(callCount.value, 2)
    }

    func testChatDoesNotInvokeRefreshOnSuccess() async throws {
        let refreshCalled = TestCapture(false)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "user-access-token" },
            refreshAccessToken: {
                refreshCalled.value = true
                return "fresh-token"
            },
            requester: { request in
                let body = try! JSONSerialization.data(withJSONObject: ["content": "Hi there!"])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )

        _ = try await client.chat(messages: [ChatMessage(role: "user", content: "hi")], systemPrompt: nil)

        XCTAssertFalse(refreshCalled.value)
    }

    func testTranscribeRetriesOnceAfter401WithARefreshedToken() async throws {
        let callCount = TestCapture(0)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                callCount.value += 1
                if callCount.value == 1 {
                    return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
                }
                let body = try! JSONSerialization.data(withJSONObject: ["text": "good morning", "confidence": 0.93])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )

        let result = try await client.transcribe(audio: Data([0x01]), mimeType: "audio/m4a")

        XCTAssertEqual(result.text, "good morning")
        XCTAssertEqual(callCount.value, 2)
    }

    func testSynthesizeSpeechRetriesOnceAfter401WithARefreshedToken() async throws {
        let callCount = TestCapture(0)
        let client = AIConversationClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                callCount.value += 1
                if callCount.value == 1 {
                    return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
                }
                return (Data([0xFF, 0xD8]), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )

        let audio = try await client.synthesizeSpeech(text: "hello")

        XCTAssertEqual(audio, Data([0xFF, 0xD8]))
        XCTAssertEqual(callCount.value, 2)
    }

    // MARK: - gradeTranslation (no prior coverage -- added alongside the
    // new placementId overload the iOS placement exam needs)

    func testGradeTranslationWithLessonIdPostsTheExpectedBody() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["correct": true, "reason": NSNull()])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        // Hoisted out of XCTUnwrap: its argument is an autoclosure, which
        // cannot carry an `await`.
        let graded = await client.gradeTranslation(
            lessonId: "u1l1", questionId: "q1", submission: "Good morning.", course: "en"
        )
        let verdict = try XCTUnwrap(graded)

        XCTAssertTrue(verdict.correct)
        XCTAssertNil(verdict.reason)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/grade-translation"))
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["questionId"] as? String, "q1")
        XCTAssertNil(payload["placementId"])
    }

    func testGradeTranslationWithPlacementIdPostsTheExpectedBody() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["correct": false, "reason": "not quite"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let graded = await client.gradeTranslation(
            placementId: "p60", submission: "Good day.", course: "en"
        )
        let verdict = try XCTUnwrap(graded)

        XCTAssertFalse(verdict.correct)
        XCTAssertEqual(verdict.reason, "not quite")
        let request = try XCTUnwrap(captured.value)
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
