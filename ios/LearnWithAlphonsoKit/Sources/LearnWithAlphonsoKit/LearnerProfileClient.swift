import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum LearnerProfileError: Error, Equatable {
    case offline
    case notSignedIn
    /// The server refused the answers (a value off its lists); nothing was written.
    case invalid
    /// The server's own message, e.g. "Your answers were saved, but your flag setting wasn't. Try again."
    case failed(String?)
}

/// Calls this repo's `/api/learner-profile` (src/routes/api/learner-profile.ts): the same checked save the web's
/// saveLearnerProfile makes. The app never writes `user_metadata.learner_profile` itself. Bearer token, with one
/// refresh-and-retry on a 401 like the other clients here.
public final class LearnerProfileClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    public enum Mark: String, Sendable { case completed, dismissed }

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

    public func fetch() async throws -> LearnerProfile {
        let data = try await send(request(method: "GET", body: nil))
        return LearnerProfile.parse(Self.object(data)?["profile"])
    }

    /// Saves `answers` (only the keys that are set) and, optionally, Finish or Not now. Returns the merged profile.
    @discardableResult
    public func save(_ answers: LearnerAnswers, mark: Mark? = nil) async throws -> LearnerProfile {
        var body: [String: Any] = ["patch": answers.jsonPatch]
        if let mark { body["mark"] = mark.rawValue }
        let data = try await send(request(method: "PUT", body: try JSONSerialization.data(withJSONObject: body)))
        return LearnerProfile.parse(Self.object(data)?["profile"])
    }

    private func request(method: String, body: Data?) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/learner-profile"))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        return request
    }

    private static func object(_ data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(request)
        } catch is URLError {
            throw LearnerProfileError.offline
        } catch {
            throw LearnerProfileError.failed(nil)
        }
        guard let http = response as? HTTPURLResponse else { throw LearnerProfileError.failed(nil) }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 400: throw LearnerProfileError.invalid
            case 401, 403: throw LearnerProfileError.notSignedIn
            default: throw LearnerProfileError.failed(Self.object(data)?["error"] as? String)
            }
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
