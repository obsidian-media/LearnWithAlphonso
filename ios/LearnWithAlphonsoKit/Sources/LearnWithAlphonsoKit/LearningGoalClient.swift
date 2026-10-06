import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Calls this repo's own `/api/learning-goal` (src/routes/api/learning-goal.ts), the same route the
/// web card uses. The server computes the plan; this only asks for it and tells the learner how
/// it went. Same auth as every other call here (the user's Supabase access token as a Bearer
/// header), including one refresh-and-retry on a 401 so a token that expired mid-session does not
/// strand the card.
public final class LearningGoalClient: Sendable {
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

    /// The stored goal and its plan for `course` ("en", "fr", "es"), or an empty state.
    public func fetch(course: String) async throws -> LearningGoalState {
        let data = try await send(request(method: "GET", query: [("course", course)]))
        return try LearningGoalDecoding.state(from: data)
    }

    /// The plan for a candidate goal. Writes nothing on the server.
    public func preview(course: String, targetLevel: String, targetDate: String) async throws -> GoalPlan {
        let data = try await send(
            request(method: "GET", query: [("course", course), ("targetLevel", targetLevel), ("targetDate", targetDate)]))
        return try LearningGoalDecoding.plan(fromPreview: data)
    }

    public func save(course: String, targetLevel: String, targetDate: String) async throws -> LearningGoalState {
        let body = try JSONSerialization.data(
            withJSONObject: ["course": course, "targetLevel": targetLevel, "targetDate": targetDate])
        let data = try await send(request(method: "PUT", query: [], body: body))
        return try LearningGoalDecoding.state(from: data)
    }

    public func remove(course: String) async throws {
        _ = try await send(request(method: "DELETE", query: [("course", course)]))
    }

    private func request(method: String, query: [(String, String)], body: Data? = nil) -> URLRequest {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/learning-goal"), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        return request
    }

    /// Sends, maps the failure modes to `LearningGoalError`, and returns the body of a 2xx.
    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(request)
        } catch is URLError {
            throw LearningGoalError.offline
        } catch {
            throw LearningGoalError.unavailable
        }
        guard let http = response as? HTTPURLResponse else { throw LearningGoalError.unavailable }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 400: throw LearningGoalError.invalid(Self.reason(in: data))
            case 401, 403: throw LearningGoalError.notSignedIn
            default: throw LearningGoalError.unavailable
            }
        }
        return data
    }

    private static func reason(in data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
    }

    /// One attempt, and on a 401 with a refresh configured, exactly one retry with a new token.
    /// A refreshed token that is still rejected means something other than staleness is wrong.
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
