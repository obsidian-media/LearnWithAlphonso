import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// What the learner gets back: the text, the language it is in and which way it reads.
public struct ExplainResult: Sendable, Equatable {
    public let explanation: String
    /// The language the text is in (an ISO 639-1 code from the learner's profile).
    public let language: String
    public let direction: ExplainDirection
    public let cached: Bool

    public init(explanation: String, language: String, direction: ExplainDirection, cached: Bool) {
        self.explanation = explanation
        self.language = language
        self.direction = direction
        self.cached = cached
    }

    /// The 200 body, or nil when any part is missing or empty (the caller shows "Couldn't explain that").
    public static func decode(_ data: Data) -> ExplainResult? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let text = ExplainRules.parseExplanation(object["explanation"]),
              let language = object["language"] as? String, !language.isEmpty,
              let directionRaw = object["direction"] as? String,
              let direction = ExplainDirection(rawValue: directionRaw),
              let cached = object["cached"] as? Bool
        else { return nil }
        return ExplainResult(explanation: text, language: language, direction: direction, cached: cached)
    }
}

public enum ExplainErrorKind: String, Error, Equatable, Sendable, CaseIterable {
    case offline, quotaExceeded, aiConsentRequired, notSignedIn, notEntitled, unsupported, unavailable

    /// The server's status (and its `error` field, which only the 403 needs) mapped to a kind, like the web's
    /// kindForFailure: 400 and 422 are "no explanation in your language for this one", a 403 is the AI consent or a
    /// missing Pro entitlement and only the body tells them apart, everything else (502, 503, 500) is "unavailable".
    public static func from(status: Int, error: String?) -> ExplainErrorKind {
        switch status {
        case 400, 422: return .unsupported
        case 401: return .notSignedIn
        case 403: return error == "ai-consent-required" ? .aiConsentRequired : .notEntitled
        case 429: return .quotaExceeded
        default: return .unavailable
        }
    }

    /// What the learner is told for each failure; same wording as the web (explainErrorCopy) and Android.
    public var copy: String {
        switch self {
        case .offline: return "Explaining needs a connection. Try again when you are back online."
        case .quotaExceeded: return "You have used today's explanations. They come back tomorrow."
        case .aiConsentRequired: return "AI features are turned off. Allow them to get explanations."
        case .notSignedIn: return "Sign in again to get explanations."
        case .notEntitled: return "Explanations in Hector need Hector Pro."
        case .unsupported: return "There is no explanation in your language for this one."
        case .unavailable: return "Couldn't explain that. Try again."
        }
    }
}

/// POST /api/explain (src/routes/api/explain.ts). Bearer access token like every other call here, with one
/// refresh-and-retry on a 401. The route reads the learner's language from the account, so a request carries only the
/// item.
public final class ExplainClient: Sendable {
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

    /// Throws `ExplainErrorKind` for every failure. A cancelled task rethrows its `CancellationError`.
    public func explain(_ request: ExplainRequest, surface: ExplainSurface = .app) async throws -> ExplainResult {
        var urlRequest = URLRequest(url: baseURL.appendingPathComponent("api/explain"))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        urlRequest.timeoutInterval = 30
        do {
            urlRequest.httpBody = try JSONSerialization.data(withJSONObject: request.jsonObject(surface: surface))
        } catch {
            throw ExplainErrorKind.unavailable
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(urlRequest)
        } catch is CancellationError {
            throw CancellationError()
        } catch is URLError {
            throw ExplainErrorKind.offline
        } catch {
            throw ExplainErrorKind.unavailable
        }
        guard let http = response as? HTTPURLResponse else { throw ExplainErrorKind.unavailable }
        guard (200...299).contains(http.statusCode) else {
            let field = Self.errorField(data)
            AIConsentSignal.noteIfConsentRequired(status: http.statusCode, message: field)
            throw ExplainErrorKind.from(status: http.statusCode, error: field)
        }
        guard let explanation = ExplainResult.decode(data) else { throw ExplainErrorKind.unavailable }
        return explanation
    }

    static func errorField(_ data: Data) -> String? {
        ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String
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
