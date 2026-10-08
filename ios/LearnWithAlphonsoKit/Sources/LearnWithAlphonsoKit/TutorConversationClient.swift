import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A conversation turn sent as history context. Matches the shape of
/// AlphonsoEcosystem's voice/cloud-backend `ChatMessage`
/// (app/contracts.py) -- role is "user" or "assistant".
public struct TutorConversationMessage: Sendable, Encodable, Equatable {
    public let role: String
    public let content: String

    public init(role: String, content: String) {
        self.role = role
        self.content = content
    }
}

public struct TutorTimings: Sendable, Decodable, Equatable {
    public let llm: Int
    public let tts: Int
    public let total: Int
}

/// Matches AlphonsoEcosystem's `VoiceResponse` (app/contracts.py) exactly.
public struct TutorReply: Sendable, Decodable {
    public let requestID: String
    public let sessionID: String
    public let agent: String
    public let reply: String
    public let audioBase64: String
    public let ttsModel: String
    public let ttsProvider: String
    public let language: String
    public let state: String
    public let timingsMs: TutorTimings

    enum CodingKeys: String, CodingKey {
        case requestID = "request_id"
        case sessionID = "session_id"
        case agent, reply
        case audioBase64 = "audio_base64"
        case ttsModel = "tts_model"
        case ttsProvider = "tts_provider"
        case language, state
        case timingsMs = "timings_ms"
    }
}

/// Calls this app's own `/api/hector-respond` (the response still matches
/// Cloud Voice's `VoiceResponse`). It:
/// - sends the learner's course and CEFR level, so Hector's prompt and voice
///   follow the active course (`language` is repeated for servers that predate
///   the `course` field);
/// - sends no device identifier;
/// - retries once on 401 with a refreshed token, like AIConversationClient, so
///   `.signedOut` really means the refresh failed;
/// - throws `TutorError` for every failure. A 403 `ai-consent-required` also
///   announces itself so the consent store can follow; the code is never shown.
///
/// The `requester` closure is injected (default: a real URLSession call) so
/// tests can substitute canned responses without a network.
public final class TutorConversationClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let endpoint: URL
    private let accessToken: @Sendable () -> String
    private let refreshAccessToken: (@Sendable () async -> String?)?
    private let requester: Requester

    public init(
        endpoint: URL,
        accessToken: @escaping @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.endpoint = endpoint
        self.accessToken = accessToken
        self.refreshAccessToken = refreshAccessToken
        self.requester = requester
    }

    public func respond(
        sessionID: String,
        text: String,
        course: String,
        cefrLevel: String?,
        history: [TutorConversationMessage],
        agentID: String = "tutor"
    ) async throws -> TutorReply {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")

        var payload: [String: Any] = [
            "session_id": sessionID,
            "text": text,
            "course": course,
            "language": course,
            "agent_id": agentID,
            "history": history.map { ["role": $0.role, "content": $0.content] },
        ]
        if let cefrLevel, !cefrLevel.isEmpty { payload["cefr_level"] = cefrLevel }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(request)
        } catch {
            throw TutorError.from(error)
        }
        guard let http = response as? HTTPURLResponse else { throw TutorError.server(message: nil) }
        guard (200...299).contains(http.statusCode) else {
            // The "error" field is a machine code: it only drives the consent signal and the classification, and
            // is never shown.
            AIConsentSignal.noteIfConsentRequired(status: http.statusCode, message: TutorError.errorCode(in: data))
            throw TutorError.from(status: http.statusCode, body: data)
        }
        do {
            return try JSONDecoder().decode(TutorReply.self, from: data)
        } catch {
            throw TutorError.server(message: nil)
        }
    }

    /// Same one-retry-on-401 contract as AIConversationClient.perform.
    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await requester(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 401,
              let refreshAccessToken,
              let refreshed = await refreshAccessToken() else {
            return (data, response)
        }
        var retry = request
        retry.setValue("Bearer \(refreshed)", forHTTPHeaderField: "Authorization")
        return try await requester(retry)
    }
}
