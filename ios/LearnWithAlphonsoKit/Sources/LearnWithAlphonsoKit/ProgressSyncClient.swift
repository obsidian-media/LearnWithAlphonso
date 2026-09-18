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

/// Matches the complete-lesson Edge Function's response shape exactly
/// (supabase/functions/complete-lesson/index.ts's final jsonResponse call).
public struct LessonCompletionProgress: Sendable, Decodable, Equatable {
    public let xp: Int
    public let streak: Int
    public let longestStreak: Int
    public let lastActiveDate: String
    public let hearts: Int
    /// Epoch milliseconds a pending heart refill completes at, or nil if
    /// hearts are full / a bonus just cleared the timer.
    public let heartsRefillAt: Double?
    public let streakFreezes: Int
    public let leagueTier: String
}

public struct LessonCompletionResult: Sendable, Decodable, Equatable {
    public let xpGain: Int
    public let newlyUnlocked: [String]
    /// "streak" | "perfect" | nil -- which heart bonus (if any) this
    /// completion earned. See hearts.ts's streakHeartMilestoneReached /
    /// perfectLessonBonusEarned for the rules.
    public let heartsBonus: String?
    public let progress: LessonCompletionProgress
}

/// Direct PostgREST calls for the RLS-safe subset of src/lib/sync.functions.ts
/// -- operations where a user legitimately controls their own data with no
/// adversarial trust concern (spending their own heart, setting their own
/// declared CEFR level, recording their own placement-test result). RLS
/// policies (`auth.uid() = user_id`) enforce the "own row only" boundary
/// server-side regardless of what this client sends.
///
/// completeLesson is the one exception -- it calls the complete-lesson
/// Supabase Edge Function (supabase/functions/complete-lesson/index.ts)
/// rather than PostgREST directly, since granting XP needs a server-only
/// secret (LESSON_SESSION_SECRET) that can never ship in this binary. See
/// docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md
/// for the full design.
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

    /// Calls the complete-lesson Edge Function -- POST
    /// {supabaseURL}/functions/v1/complete-lesson with the user's own JWT
    /// (same auth pattern as the PostgREST calls above, just a different
    /// endpoint). `sessionToken` must come from a prior startLessonSession
    /// call (the TanStack Start server function -- still web-only, since
    /// it just issues a short-lived HMAC token and has no client-trust
    /// concern of its own).
    public func completeLesson(
        lessonID: String,
        total: Int,
        missedQuestionIDs: [String],
        course: String,
        sessionToken: String
    ) async throws -> LessonCompletionResult {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("functions/v1/complete-lesson"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = [
            "lessonId": lessonID,
            "total": total,
            "missedQuestionIds": missedQuestionIDs,
            "course": course,
            "sessionToken": sessionToken,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        do {
            return try JSONDecoder().decode(LessonCompletionResult.self, from: data)
        } catch {
            throw ProgressSyncError.invalidPayload
        }
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
        // "message"/"msg"/"hint" are PostgREST's error shape; "error" is the
        // complete-lesson Edge Function's ({ error: "..." }, see index.ts).
        let message = (object["message"] as? String) ?? (object["msg"] as? String)
            ?? (object["hint"] as? String) ?? (object["error"] as? String)
        guard let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return message
    }
}
