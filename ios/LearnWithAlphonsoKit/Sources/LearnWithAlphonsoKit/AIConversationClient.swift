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
    /// Mints a new access token when the server rejects the current one --
    /// see `perform`'s doc comment. Nil (the default) means "no refresh
    /// available," which is every existing caller's exact prior behavior:
    /// one attempt, a 401 surfaces as `.server(401, _)` same as any other
    /// status.
    private let refreshAccessToken: (@Sendable () async -> String?)?
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.refreshAccessToken = refreshAccessToken
        self.requester = requester
    }

    /// Sends `request` (already carrying the current access token) and,
    /// on a 401 with a `refreshAccessToken` configured, mints one new
    /// token and retries exactly once with it.
    ///
    /// **Why this exists.** `Session` (the main app's auth state, not this
    /// package) used to refresh its access token only once, at cold
    /// launch -- nothing refreshed it again for the rest of a live
    /// session. A session left open past the token's ~1-hour lifetime
    /// 401'd on every call here with no way for the learner to know why
    /// (confirmed against production logs: real `/api/stt` 401s from a
    /// real device test, not a hypothetical). Session now refreshes
    /// proactively before most calls, so this retry is the backstop for
    /// what proactive refresh can still miss -- the token expiring in the
    /// last few seconds before the request lands, or being invalidated
    /// server-side between the check and the call.
    ///
    /// Retries **at most once**: a refreshed token that still gets 401
    /// means something other than staleness is wrong, and looping would
    /// just hide that behind repeated network calls.
    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await requester(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 401,
              let refreshAccessToken else {
            return (data, response)
        }
        guard let refreshedToken = await refreshAccessToken() else {
            return (data, response)
        }
        var retryRequest = request
        retryRequest.setValue("Bearer \(refreshedToken)", forHTTPHeaderField: "Authorization")
        return try await requester(retryRequest)
    }

    /// The four conversation calls (chat, stt, tts, analyze-weaknesses) throw
    /// `TutorError`, so every voice screen classifies failures the same way:
    /// quota with its reset time, not-entitled, consent, network. A consent
    /// refusal also announces itself so the consent store can follow. The other
    /// calls keep their existing error types.
    private func performConversationCall(_ request: URLRequest, retryEmptyReply: Bool = false) async throws -> Data {
        var data: Data
        var response: URLResponse
        do {
            (data, response) = try await perform(request)
            // The server says 502 empty-reply when the model returned nothing. One retry, never a loop.
            if retryEmptyReply, Self.isEmptyReply(data: data, response: response) {
                (data, response) = try await perform(request)
            }
        } catch {
            throw TutorError.from(error)
        }
        guard let http = response as? HTTPURLResponse else { throw TutorError.server(message: nil) }
        guard (200...299).contains(http.statusCode) else {
            AIConsentSignal.noteIfConsentRequired(status: http.statusCode, message: TutorError.errorCode(in: data))
            throw TutorError.from(status: http.statusCode, body: data)
        }
        return data
    }

    static func isEmptyReply(data: Data, response: URLResponse) -> Bool {
        guard (response as? HTTPURLResponse)?.statusCode == 502 else { return false }
        return TutorError.errorCode(in: data) == "empty-reply"
    }

    /// POST /api/chat -- returns the assistant's reply text. `cefrLevel`
    /// (V3 package 3a, e.g. "A1".."C1") lets the server adjust vocabulary/
    /// sentence complexity to the learner's level -- see api/chat.ts's
    /// withDifficultyHint. Not a trust boundary (worst case: a wrong level
    /// just makes the conversation too easy/hard), so no validation here.
    public func chat(
        messages: [ChatMessage], systemPrompt: String?, cefrLevel: String? = nil, course: String? = nil
    ) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = ["messages": messages.map { ["role": $0.role, "content": $0.content] }]
        if let systemPrompt { payload["systemPrompt"] = systemPrompt }
        if let cefrLevel { payload["cefrLevel"] = cefrLevel }
        if let course { payload["course"] = course }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let data = try await performConversationCall(request, retryEmptyReply: true)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = object["content"] as? String else {
            throw TutorError.server(message: nil)
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
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            AIConsentSignal.noteIfConsentRequired(status: http.statusCode, message: Self.errorMessage(from: data))
        }
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
    public func analyzeWeaknesses(transcript: [ChatMessage], course: String? = nil) async throws -> Int {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/analyze-weaknesses"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = ["messages": transcript.map { ["role": $0.role, "content": $0.content] }]
        if let course { payload["course"] = course }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let data = try await performConversationCall(request)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let count = object["weaknessesDetected"] as? Int else {
            throw TutorError.server(message: nil)
        }
        return count
    }

    /// POST /api/define-word -- saves a tapped word with its sentence and
    /// returns its stored explanation. The server writes the review item; the
    /// client never sends choices or an answer. HTTP failures throw a
    /// `SavedWordError` so the caller can say something specific; a transport
    /// failure (offline) propagates as the `URLError` it is.
    public func defineWord(word: String, sentence: String, course: String) async throws -> SavedWordResult {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/define-word"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "word": word, "sentence": sentence, "course": course,
        ])

        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse else { throw SavedWordError.unavailable }
        guard (200...299).contains(http.statusCode) else {
            let message = Self.errorMessage(from: data)
            AIConsentSignal.noteIfConsentRequired(status: http.statusCode, message: message)
            throw SavedWordError.from(status: http.statusCode, message: message)
        }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let alreadySaved = object["alreadySaved"] as? Bool,
              let savedWord = object["word"] as? String,
              let savedSentence = object["sentence"] as? String,
              let explanation = object["explanation"] as? String
        else { throw SavedWordError.unavailable }
        return SavedWordResult(
            alreadySaved: alreadySaved, word: savedWord, sentence: savedSentence, explanation: explanation)
    }

    /// Throws `TutorError` for HTTP failures. POST /api/generate-practice -- V3 pkg 4b "generative sentence
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
        // The server answers within about 20 s (two 8 s model attempts, then its own fallback set), so a request
        // still open after 25 s is a dead connection, not a slow model.
        request.timeoutInterval = 25

        let (data, response) = try await requester(request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            // A quota 429 carries resetsAt, so the learner sees when it resets (TutorError's copy).
            throw TutorError.from(status: http.statusCode, body: data)
        }
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
    public func synthesizeSpeech(text: String, voice: String? = nil, course: String? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/tts"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = ["text": text]
        if let voice { payload["voice"] = voice }
        if let course { payload["course"] = course }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        return try await performConversationCall(request)
    }

    /// POST /api/stt -- `audio` is the raw recorded bytes (e.g. m4a/wav).
    /// `confidence` (V3 package 3a) is Deepgram's own utterance-level
    /// confidence (0-1), used as a lightweight pronunciation-clarity
    /// heuristic -- nil if Deepgram didn't report one.
    ///
    /// **THE actual cause of every "Empty or missing audio" report this
    /// session** (found 2026-09-28, after three separate rounds of real
    /// but ultimately unrelated recording-side fixes -- minimum duration,
    /// explicit mic permission, RecordingState desync -- none of which
    /// could ever have fixed this, which is exactly why the identical
    /// error kept recurring across every one of them). This used to send
    /// `audio` as a raw binary body with `Content-Type: <mimeType>`, on
    /// the documented assumption that `api/stt.ts` read the raw body
    /// directly. It doesn't, and evidently hasn't for a while: it calls
    /// `request.formData()` and looks for a field literally named
    /// `"file"` -- exactly what the WEB app's own caller
    /// (`use-speech-capture.ts`) sends via `FormData`. A raw-body POST
    /// isn't multipart at all, so `request.formData()` finds nothing,
    /// `file` is `undefined`, and the server correctly (from its own
    /// point of view) returns "Empty or missing audio" -- on literally
    /// every call, unconditionally, regardless of what audio was
    /// actually recorded. Now builds the same multipart/form-data body
    /// the web client sends, field name `"file"`, matching exactly.
    /// `course` ("en"/"fr"/"es", matching `isCourse`'s web-side validator
    /// exactly) selects Deepgram's transcription language via
    /// `api/stt.ts`. Nil means the server's default of "en". Every caller
    /// passes its course: Practice, Hector and Campaigns pass the active
    /// course, and `SpeakQuestionCard` passes the lesson's course.
    public func transcribe(
        audio: Data,
        mimeType: String,
        course: String? = nil,
        // TEMPORARY (2026-09-28): chasing a live report of a recording
        // that "buffers for a couple seconds then goes back to mic --
        // doesn't record anything practically." The uploaded file IS
        // consistently valid (confirmed via api/stt.ts's MP4 box walker)
        // but its `mdat` (real audio) is only ~0.5s regardless of how
        // long the button seems held -- suspiciously close to the
        // client's own minimum-duration floor, suggesting either the
        // gesture's onEnded fires almost immediately, or record() itself
        // (session category switch away from Hector's own just-finished
        // TTS playback) takes near the full press duration to actually
        // start capturing. This reports both real, independently-measured
        // elapsed times so the server log settles which one it is,
        // instead of guessing a third time. Remove once the real cause
        // is confirmed.
        debugTiming: String? = nil
    ) async throws -> (text: String, confidence: Double?) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/stt"))
        request.httpMethod = "POST"
        let boundary = "LWA-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")

        let filename = "recording.\(Self.fileExtension(forMimeType: mimeType))"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n"
                .data(using: .utf8)!
        )
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(audio)
        if let course {
            body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"course\"\r\n\r\n".data(using: .utf8)!)
            body.append(course.data(using: .utf8)!)
        }
        if let debugTiming {
            body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"debugTiming\"\r\n\r\n".data(using: .utf8)!)
            body.append(debugTiming.data(using: .utf8)!)
        }
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let data = try await performConversationCall(request)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let text = object["text"] as? String else {
            throw TutorError.server(message: nil)
        }
        return (text, object["confidence"] as? Double)
    }

    /// Every current caller passes "audio/m4a" -- this covers the couple
    /// of other formats api/stt.ts's own Deepgram passthrough would
    /// otherwise see too, rather than hardcoding just the one in use today.
    private static func fileExtension(forMimeType mimeType: String) -> String {
        switch mimeType {
        case "audio/m4a", "audio/mp4", "audio/x-m4a": return "m4a"
        case "audio/wav", "audio/x-wav", "audio/wave": return "wav"
        case "audio/webm": return "webm"
        case "audio/mpeg", "audio/mp3": return "mp3"
        default: return "m4a"
        }
    }

    private static func requireSuccess(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIConversationError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let message = errorMessage(from: data)
            AIConsentSignal.noteIfConsentRequired(status: httpResponse.statusCode, message: message)
            throw AIConversationError.server(status: httpResponse.statusCode, message: message)
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
