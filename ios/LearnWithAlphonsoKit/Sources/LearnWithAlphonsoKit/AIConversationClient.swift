import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Calls THIS repo's own already-deployed AI endpoints
/// (src/routes/api/chat.ts, api/tts.ts, api/stt.ts -- NVIDIA NIM chat +
/// Deepgram TTS/STT, direct) rather than a separate backend. Same auth as
/// every other authenticated call this app makes: the user's own Supabase
/// access token as a Bearer header -- these routes verify it via
/// ai-quota.server.ts's consumeQuota, which also enforces the same daily/
/// per-minute AI-usage caps the web app is subject to.
/// What /api/grade-translation decided about one written translation.
public struct TranslationVerdict: Sendable, Equatable {
    public let correct: Bool
    /// One short sentence for the learner, when the grader gave one.
    public let reason: String?

    public init(correct: Bool, reason: String?) {
        self.correct = correct
        self.reason = reason
    }
}

public struct ChatMessage: Sendable, Encodable, Equatable {
    public let role: String
    public let content: String

    public init(role: String, content: String) {
        self.role = role
        self.content = content
    }
}

public enum AIConversationError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
    case invalidPayload
}

/// V3 pkg 4b -- mirrors generate-practice.ts's response shape exactly.
public struct GeneratedPracticeQuestion: Sendable, Equatable {
    public let prompt: String
    public let choices: [String]
    public let answerIndex: Int
    public let explanation: String

    public init(prompt: String, choices: [String], answerIndex: Int, explanation: String) {
        self.prompt = prompt
        self.choices = choices
        self.answerIndex = answerIndex
        self.explanation = explanation
    }
}

public final class AIConversationClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.requester = requester
    }

    /// POST /api/chat -- returns the assistant's reply text. `cefrLevel`
    /// (V3 package 3a, e.g. "A1".."C1") lets the server adjust vocabulary/
    /// sentence complexity to the learner's level -- see api/chat.ts's
    /// withDifficultyHint. Not a trust boundary (worst case: a wrong level
    /// just makes the conversation too easy/hard), so no validation here.
    public func chat(messages: [ChatMessage], systemPrompt: String?, cefrLevel: String? = nil) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = ["messages": messages.map { ["role": $0.role, "content": $0.content] }]
        if let systemPrompt { payload["systemPrompt"] = systemPrompt }
        if let cefrLevel { payload["cefrLevel"] = cefrLevel }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = object["content"] as? String else {
            throw AIConversationError.invalidPayload
        }
        return content
    }

    /// POST /api/grade-translation -- a second opinion on a written translation
    /// the question's curated phrasings did not accept.
    ///
    /// Returns `nil` for EVERY failure: offline, non-2xx, a body that does not
    /// parse. `nil` means "no second opinion", and the caller keeps the local
    /// verdict it already has. It deliberately does not throw, unlike the other
    /// methods here, because there is no useful way for a player to handle a
    /// thrown error except to treat it as a wrong answer -- and being offline
    /// is not evidence about the learner's English.
    public func gradeTranslation(
        lessonId: String, questionId: String, submission: String, course: String
    ) async -> TranslationVerdict? {
        await postGradeTranslation([
            "lessonId": lessonId,
            "questionId": questionId,
            "submission": submission,
            "course": course,
        ])
    }

    /// Same endpoint and same "never throws, nil means no second opinion"
    /// contract as the lessonId/questionId overload above -- placement
    /// questions live outside the curriculum's question index (see
    /// api/grade-translation.ts's own `placementId` branch), so they're
    /// resolved by id from the placement pool instead of a lesson lookup.
    public func gradeTranslation(
        placementId: String, submission: String, course: String
    ) async -> TranslationVerdict? {
        await postGradeTranslation([
            "placementId": placementId,
            "submission": submission,
            "course": course,
        ])
    }

    private func postGradeTranslation(_ payload: [String: Any]) async -> TranslationVerdict? {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/grade-translation"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        // Destructured on its own line rather than inside the guard: optional
        // binding wants a plain identifier, not a tuple pattern.
        guard let result = try? await requester(request) else { return nil }
        let (data, response) = result
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let correct = object["correct"] as? Bool
        else { return nil }
        return TranslationVerdict(correct: correct, reason: object["reason"] as? String)
    }

    /// POST /api/analyze-weaknesses -- best-effort, fire-and-forget from
    /// the caller's perspective (see ConversationSessionView/
    /// HectorConversationView's onDisappear wiring, which swallows any
    /// error from this call). Returns how many weakness-derived
    /// review_items rows the server actually inserted (post-dedup).
    public func analyzeWeaknesses(transcript: [ChatMessage]) async throws -> Int {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/analyze-weaknesses"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["messages": transcript.map { ["role": $0.role, "content": $0.content] }]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let count = object["weaknessesDetected"] as? Int else {
            throw AIConversationError.invalidPayload
        }
        return count
    }

    /// POST /api/generate-practice -- V3 pkg 4b "generative sentence
    /// content." On-demand extra practice for a lesson the learner just
    /// finished; entirely ephemeral on the caller's side too (never
    /// persisted, never touches XP/hearts/review scheduling), same
    /// posture as generate-practice.ts's server-side design. An empty
    /// array is a valid response (the model found nothing worth writing),
    /// not an error.
    public func generatePractice(lessonID: String, course: String) async throws -> [GeneratedPracticeQuestion] {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/generate-practice"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["lessonId": lessonID, "course": course])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = object["questions"] as? [[String: Any]] else {
            throw AIConversationError.invalidPayload
        }
        return rows.compactMap { row -> GeneratedPracticeQuestion? in
            guard let prompt = row["prompt"] as? String,
                  let choices = row["choices"] as? [String],
                  let answerIndex = row["answerIndex"] as? Int,
                  let explanation = row["explanation"] as? String else { return nil }
            return GeneratedPracticeQuestion(
                prompt: prompt, choices: choices, answerIndex: answerIndex, explanation: explanation
            )
        }
    }

    /// POST /api/tts -- returns raw MP3 audio bytes for `text`.
    public func synthesizeSpeech(text: String, voice: String? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/tts"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = ["text": text]
        if let voice { payload["voice"] = voice }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return data
    }

    /// POST /api/stt -- `audio` is the raw recorded bytes (e.g. m4a/wav),
    /// sent as the request body with its real mime type, matching
    /// api/stt.ts's expectation (Deepgram detects the format from
    /// Content-Type, no multipart wrapper). `confidence` (V3 package 3a)
    /// is Deepgram's own utterance-level confidence (0-1), used as a
    /// lightweight pronunciation-clarity heuristic -- nil if Deepgram
    /// didn't report one.
    public func transcribe(audio: Data, mimeType: String) async throws -> (text: String, confidence: Double?) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/stt"))
        request.httpMethod = "POST"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = audio

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let text = object["text"] as? String else {
            throw AIConversationError.invalidPayload
        }
        return (text, object["confidence"] as? Double)
    }

    private static func requireSuccess(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIConversationError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw AIConversationError.server(status: httpResponse.statusCode, message: errorMessage(from: data))
        }
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = object["error"] as? String,
              !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return message
    }
}
