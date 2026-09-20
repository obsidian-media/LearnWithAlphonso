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

public enum TutorConversationError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
    case invalidPayload
}

/// Calls AlphonsoEcosystem's already-built voice/cloud-backend
/// (`POST /v1/voice/respond`) rather than reimplementing a third AI-
/// conversation pipeline -- see
/// docs/superpowers/specs/2026-09-17-native-ios-app-design.md's
/// architecture section for why. Defaults `agentID` to "tutor" (the Hector
/// persona from AlphonsoEcosystem PR #254) since that's this app's only
/// use of this client for V1; a future Translator-mode use, if ever added
/// here, would pass a different `agentID` explicitly.
///
/// The `requester` closure is injected (default: a real URLSession call)
/// so tests can substitute canned responses without a network -- same
/// dependency-injection pattern as the SRS/ProgressMath ports' injected
/// date functions, just for I/O instead of dates.
public final class TutorConversationClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let endpoint: URL
    private let accessToken: @Sendable () -> String
    private let deviceID: String
    private let requester: Requester

    public init(
        endpoint: URL,
        accessToken: @escaping @Sendable () -> String,
        deviceID: String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.endpoint = endpoint
        self.accessToken = accessToken
        self.deviceID = deviceID
        self.requester = requester
    }

    public func respond(
        sessionID: String,
        text: String,
        language: String,
        history: [TutorConversationMessage],
        agentID: String = "tutor",
        ttsModel: String = "magpie",
        piperVoice: String = "mana"
    ) async throws -> TutorReply {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(deviceID, forHTTPHeaderField: "X-Alphonso-Device-Id")

        let payload: [String: Any] = [
            "session_id": sessionID,
            "text": text,
            "language": language,
            "agent_id": agentID,
            "tts_model": ttsModel,
            "piper_voice": piperVoice,
            "history": history.map { ["role": $0.role, "content": $0.content] },
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TutorConversationError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw TutorConversationError.server(status: httpResponse.statusCode, message: Self.errorMessage(from: data))
        }
        do {
            return try JSONDecoder().decode(TutorReply.self, from: data)
        } catch {
            throw TutorConversationError.invalidPayload
        }
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let detail = object["detail"] as? String,
              !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return detail
    }
}
