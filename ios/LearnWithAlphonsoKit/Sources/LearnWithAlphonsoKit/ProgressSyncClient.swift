import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum ProgressSyncError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
    case invalidPayload
}

public struct HeartsResult: Sendable, Equatable {
    public let hearts: Int
}

/// Direct PostgREST calls for the RLS-safe subset of src/lib/sync.functions.ts
/// -- operations where a user legitimately controls their own data with no
/// adversarial trust concern (spending their own heart, setting their own
/// declared CEFR level, recording their own placement-test result). RLS
/// policies (`auth.uid() = user_id`) enforce the "own row only" boundary
/// server-side regardless of what this client sends.
///
/// completeLessonRemote is deliberately NOT here -- see this file's test
/// file for why, and the follow-up plan doc
/// (docs/superpowers/plans/2026-09-17-native-ios-progress-sync-edge-function.md)
/// for the real design of what that needs instead.
public final class ProgressSyncClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let supabaseURL: URL
    private let anonKey: String
    private let accessToken: String
    private let requester: Requester

    public init(
        supabaseURL: URL,
        anonKey: String,
        accessToken: String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.accessToken = accessToken
        self.requester = requester
    }

    public func loseHeart(userID: String) async throws -> HeartsResult {
        let current = try await currentHearts(userID: userID)
        let next = max(0, current - 1)
        let refillAt: String? = next == 0 ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(30 * 60)) : nil

        var request = restRequest(path: "user_progress", query: [URLQueryItem(name: "user_id", value: "eq.\(userID)")])
        request.httpMethod = "PATCH"
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        var body: [String: Any] = ["hearts": next]
        body["hearts_refill_at"] = refillAt ?? NSNull()
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return HeartsResult(hearts: next)
    }

    public func setCefrLevel(userID: String, course: String, level: String) async throws {
        try await upsertLanguageProgress(userID: userID, course: course, fields: ["cefr_level": level])
    }

    public func savePlacementResult(userID: String, course: String, level: String, score: Int) async throws {
        try await upsertLanguageProgress(userID: userID, course: course, fields: [
            "cefr_level": level,
            "placement_level": level,
            "placement_score": score,
            "placement_taken_at": ISO8601DateFormatter().string(from: Date()),
        ])
    }

    private func currentHearts(userID: String) async throws -> Int {
        var request = restRequest(path: "user_progress", query: [
            URLQueryItem(name: "select", value: "hearts"),
            URLQueryItem(name: "user_id", value: "eq.\(userID)"),
        ])
        request.httpMethod = "GET"

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return (rows.first?["hearts"] as? Int) ?? 5
    }

    private func upsertLanguageProgress(userID: String, course: String, fields: [String: Any]) async throws {
        var request = restRequest(path: "language_progress", query: [URLQueryItem(name: "on_conflict", value: "user_id,language")])
        request.httpMethod = "POST"
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        var body: [String: Any] = ["user_id": userID, "language": course]
        for (key, value) in fields { body[key] = value }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    private func restRequest(path: String, query: [URLQueryItem]) -> URLRequest {
        var components = URLComponents(url: supabaseURL.appendingPathComponent("rest/v1/\(path)"), resolvingAgainstBaseURL: false)!
        components.queryItems = query
        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func requireSuccess(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ProgressSyncError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw ProgressSyncError.server(status: httpResponse.statusCode, message: errorMessage(from: data))
        }
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        let message = (object["message"] as? String) ?? (object["msg"] as? String) ?? (object["hint"] as? String)
        guard let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return message
    }
}
