import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// `none` is "no conversation yet"; the rest are the server's words.
public enum SupportStatus: String, Sendable, Equatable {
    case none, ai, new, open
    case waitingLearner = "waiting_learner"
    case solved
}

public enum SupportMessageKind: String, Sendable, Equatable {
    case you, ai, support, system
}

public struct SupportMessage: Sendable, Equatable, Identifiable {
    public let id: Int
    public let kind: SupportMessageKind
    public let body: String
    /// The server's ISO 8601 timestamp, as sent.
    public let at: String
    /// Only an `ai` message carries one, and only an allowed id counts.
    public let link: SupportLinkID?
    /// A person's reply only: the staff member's first name (never a surname, email or id), or nil when none is set.
    public let staffName: String?

    public init(id: Int, kind: SupportMessageKind, body: String, at: String, link: SupportLinkID? = nil, staffName: String? = nil) {
        self.id = id
        self.kind = kind
        self.body = body
        self.at = at
        self.link = link
        self.staffName = staffName
    }
}

public struct SupportConversation: Sendable, Equatable {
    public let status: SupportStatus
    public let unread: Int
    public let messages: [SupportMessage]
    public let aiAvailable: Bool

    public init(status: SupportStatus, unread: Int, messages: [SupportMessage], aiAvailable: Bool) {
        self.status = status
        self.unread = unread
        self.messages = messages
        self.aiAvailable = aiAvailable
    }
}

/// What a send or a hand-off returns: the status now, and the messages (new ones for a send, all for a hand-off).
public struct SupportUpdate: Sendable, Equatable {
    public let status: SupportStatus
    public let messages: [SupportMessage]

    public init(status: SupportStatus, messages: [SupportMessage]) {
        self.status = status
        self.messages = messages
    }
}

public enum SupportErrorKind: String, Error, Sendable, Equatable, CaseIterable {
    case offline
    /// 503 `support-unreachable`: the learner's message IS saved on the server.
    case unreachable
    /// 429 `support-message-limit`, 50 learner messages a day.
    case dailyLimit
    /// 429 `support-message-limit`, 100 messages in one conversation.
    case conversationLimit
    case failed

    /// The server's status, its `error` code and its `which` field mapped to a kind (the web's `failure`).
    public static func from(status: Int, error: String?, which: String?) -> SupportErrorKind {
        if status == 503, error == "support-unreachable" { return .unreachable }
        if status == 429, error == "support-message-limit" { return which == "conversation" ? .conversationLimit : .dailyLimit }
        return .failed
    }
}

/// Decoding of the three responses. Strict like the web's zod schemas: one bad row makes the whole reply `failed`
/// rather than silently dropping a message.
public enum SupportDecoding {
    public static func message(_ raw: Any) -> SupportMessage? {
        guard let object = raw as? [String: Any],
              let id = object["id"] as? Int,
              let kindRaw = object["kind"] as? String, let kind = SupportMessageKind(rawValue: kindRaw),
              let body = object["body"] as? String,
              let at = object["at"] as? String
        else { return nil }
        let shown = SupportLinks.present(kind: kind, body: body, linkField: object["link"])
        // Only a person's reply carries a name; the label never shows it on any other row.
        let staffName: String? = kind == .support
            ? (object["staffName"] as? String).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : $0 }
            : nil
        return SupportMessage(id: id, kind: kind, body: shown.body, at: at, link: shown.link, staffName: staffName)
    }

    static func messages(_ raw: Any?) -> [SupportMessage]? {
        guard let rows = raw as? [Any] else { return nil }
        var out: [SupportMessage] = []
        for row in rows {
            guard let message = message(row) else { return nil }
            out.append(message)
        }
        return out
    }

    public static func update(_ data: Data) -> SupportUpdate? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let statusRaw = object["status"] as? String, let status = SupportStatus(rawValue: statusRaw),
              let messages = messages(object["messages"])
        else { return nil }
        return SupportUpdate(status: status, messages: messages)
    }

    public static func conversation(_ data: Data) -> SupportConversation? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let update = update(data),
              let unread = object["unread"] as? Int, unread >= 0,
              let aiAvailable = object["aiAvailable"] as? Bool
        else { return nil }
        return SupportConversation(status: update.status, unread: unread, messages: update.messages, aiAvailable: aiAvailable)
    }
}

/// The Help chat routes (`/api/support/conversation`, `/message`, `/handoff`). Bearer access token like every other
/// call, one refresh-and-retry on a 401, and an `X-Client: ios` header so the server records the channel. The learner id
/// is the session's: a request carries only the text and a client id, never a conversation id or an author.
public final class SupportClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
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

    /// The request for one route. `body` is JSON for a POST, nil for the GET.
    func request(path: String, method: String, body: [String: Any]?) -> URLRequest? {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "X-Client")
        // The AI answer is part of the send, which the server caps at 20 s.
        request.timeoutInterval = 45
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            guard let data = try? JSONSerialization.data(withJSONObject: body) else { return nil }
            request.httpBody = data
        }
        return request
    }

    public func fetchConversation() async throws -> SupportConversation {
        let data = try await send(path: "api/support/conversation", method: "GET", body: nil)
        guard let conversation = SupportDecoding.conversation(data) else { throw SupportErrorKind.failed }
        return conversation
    }

    /// `clientID` makes a retry safe: the server returns the stored message instead of posting twice.
    public func sendMessage(text: String, clientID: String) async throws -> SupportUpdate {
        let data = try await send(path: "api/support/message", method: "POST", body: ["text": text, "clientId": clientID])
        guard let update = SupportDecoding.update(data) else { throw SupportErrorKind.failed }
        return update
    }

    public func requestHandoff() async throws -> SupportUpdate {
        let data = try await send(path: "api/support/handoff", method: "POST", body: [:])
        guard let update = SupportDecoding.update(data) else { throw SupportErrorKind.failed }
        return update
    }

    /// Throws `SupportErrorKind` for every failure. A cancelled task rethrows its `CancellationError`.
    private func send(path: String, method: String, body: [String: Any]?) async throws -> Data {
        guard let urlRequest = request(path: path, method: method, body: body) else { throw SupportErrorKind.failed }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(urlRequest)
        } catch is CancellationError {
            throw CancellationError()
        } catch is URLError {
            throw SupportErrorKind.offline
        } catch {
            throw SupportErrorKind.failed
        }
        guard let http = response as? HTTPURLResponse else { throw SupportErrorKind.failed }
        guard (200...299).contains(http.statusCode) else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw SupportErrorKind.from(status: http.statusCode, error: object?["error"] as? String, which: object?["which"] as? String)
        }
        return data
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await requester(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 401, let refreshAccessToken else {
            return (data, response)
        }
        guard let token = await refreshAccessToken() else { return (data, response) }
        var retry = request
        retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await requester(retry)
    }
}
