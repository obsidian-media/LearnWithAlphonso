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

/// Matches review.functions.ts's `ReviewItem` shape exactly.
public struct ReviewItem: Sendable, Equatable {
    public let itemKey: String
    public let lessonId: String
    public let level: String
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let dueOn: String

    public init(itemKey: String, lessonId: String, level: String, ease: Double, intervalDays: Int, repetitions: Int, dueOn: String) {
        self.itemKey = itemKey
        self.lessonId = lessonId
        self.level = level
        self.ease = ease
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.dueOn = dueOn
    }
}

public struct DueReviews: Sendable, Equatable {
    public let due: [ReviewItem]
    public let total: Int
}

public struct ReviewGradeOutcome: Sendable, Equatable {
    public let retired: Bool
    public let dueOn: String
}

public struct ReviewClearBonus: Sendable, Equatable {
    public let granted: Bool
    public let hearts: Int?
}

/// Matches `get_leaderboard`'s row shape exactly (supabase/migrations/
/// 20260822065513_*.sql) -- no `isYou` flag from the server, same as the
/// web app: the caller compares `userID` against `Session.userID` itself.
public struct LeaderboardRow: Sendable, Equatable {
    public let userID: String
    public let displayName: String
    public let country: String?
    public let avatarSeed: String
    public let xp: Int
}

/// Matches `get_friends_progress`'s row shape exactly (supabase/migrations/
/// 20260912041500_accept_friend_invite.sql).
public struct FriendProgress: Sendable, Equatable {
    public let userID: String
    public let displayName: String
    public let avatarSeed: String
    public let streak: Int
    public let weekXP: Int
}

/// One row of `user_achievements` -- an achievement this user has actually
/// unlocked (or made progress toward), matched against the bundled
/// `Achievement` catalog (`ContentStore.achievements`) by `achievementID`.
public struct UnlockedAchievement: Sendable, Equatable {
    public let achievementID: String
    public let progress: Int
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

    public init(xp: Int, streak: Int, longestStreak: Int, lastActiveDate: String, hearts: Int, heartsRefillAt: Double?, streakFreezes: Int, leagueTier: String) {
        self.xp = xp
        self.streak = streak
        self.longestStreak = longestStreak
        self.lastActiveDate = lastActiveDate
        self.hearts = hearts
        self.heartsRefillAt = heartsRefillAt
        self.streakFreezes = streakFreezes
        self.leagueTier = leagueTier
    }
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

    /// Calls the start-lesson-session Edge Function -- POST
    /// {supabaseURL}/functions/v1/start-lesson-session with the user's own
    /// JWT. Returns the HMAC session token `completeLesson` requires as
    /// proof this lesson was actually opened. The web app gets this token
    /// from startLessonSession, a TanStack Start server function reachable
    /// only via the web app's own RPC layer -- start-lesson-session is the
    /// same issuance exposed over plain HTTP so this native client can
    /// call it too (see supabase/functions/start-lesson-session/index.ts).
    public func startLessonSession(lessonID: String, course: String) async throws -> String {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("functions/v1/start-lesson-session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["lessonId": lessonID, "course": course]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = object["token"] as? String else {
            throw ProgressSyncError.invalidPayload
        }
        return token
    }

    /// Calls the complete-lesson Edge Function -- POST
    /// {supabaseURL}/functions/v1/complete-lesson with the user's own JWT
    /// (same auth pattern as the PostgREST calls above, just a different
    /// endpoint). `sessionToken` must come from a prior startLessonSession
    /// call above.
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

    /// Items due today (plus overdue), oldest first -- direct PostgREST
    /// reads under RLS (`ri_own_all`: auth.uid() = user_id), same as
    /// loseHeart/setCefrLevel above. No trust-sensitive derivation here
    /// (unlike gradeReview), so no Edge Function needed.
    public func fetchDueReviews(course: String) async throws -> DueReviews {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        var dueRequest = restRequest(path: "review_items", query: [
            URLQueryItem(name: "select", value: "item_key,lesson_id,level,ease,interval_days,repetitions,due_on"),
            URLQueryItem(name: "language", value: "eq.\(course)"),
            URLQueryItem(name: "due_on", value: "lte.\(today)"),
            URLQueryItem(name: "order", value: "due_on.asc"),
            URLQueryItem(name: "limit", value: "20"),
        ])
        dueRequest.httpMethod = "GET"
        let (dueData, dueResponse) = try await requester(dueRequest)
        try Self.requireSuccess(data: dueData, response: dueResponse)
        guard let rows = try? JSONSerialization.jsonObject(with: dueData) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        let due = rows.compactMap { row -> ReviewItem? in
            guard let itemKey = row["item_key"] as? String,
                  let lessonId = row["lesson_id"] as? String,
                  let level = row["level"] as? String,
                  let ease = row["ease"] as? Double,
                  let intervalDays = row["interval_days"] as? Int,
                  let repetitions = row["repetitions"] as? Int,
                  let dueOn = row["due_on"] as? String else { return nil }
            return ReviewItem(itemKey: itemKey, lessonId: lessonId, level: level, ease: ease, intervalDays: intervalDays, repetitions: repetitions, dueOn: dueOn)
        }

        var countRequest = restRequest(path: "review_items", query: [
            URLQueryItem(name: "select", value: "item_key"),
            URLQueryItem(name: "language", value: "eq.\(course)"),
        ])
        countRequest.httpMethod = "HEAD"
        countRequest.setValue("count=exact", forHTTPHeaderField: "Prefer")
        let (_, countResponse) = try await requester(countRequest)
        let total: Int
        if let httpResponse = countResponse as? HTTPURLResponse,
           let contentRange = httpResponse.value(forHTTPHeaderField: "Content-Range"),
           let countStr = contentRange.split(separator: "/").last,
           let parsed = Int(countStr) {
            total = parsed
        } else {
            total = due.count
        }
        return DueReviews(due: due, total: total)
    }

    /// Direct PostgREST `GET` on `user_achievements`, RLS-scoped to
    /// `auth.uid() = user_id` server-side -- no Edge Function needed, same
    /// reasoning as fetchDueReviews' review_items read above.
    public func fetchUnlockedAchievements() async throws -> [UnlockedAchievement] {
        var request = restRequest(path: "user_achievements", query: [
            URLQueryItem(name: "select", value: "achievement_id,progress"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> UnlockedAchievement? in
            guard let achievementID = row["achievement_id"] as? String,
                  let progress = row["progress"] as? Int else { return nil }
            return UnlockedAchievement(achievementID: achievementID, progress: progress)
        }
    }

    /// Calls the grade-review Edge Function -- re-derives correctness
    /// server-side against the real question, same trust-boundary
    /// reasoning as completeLesson. See
    /// supabase/functions/grade-review/index.ts.
    public func gradeReview(itemKey: String, answer: String, course: String) async throws -> ReviewGradeOutcome {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("functions/v1/grade-review"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["itemKey": itemKey, "answer": answer, "course": course]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let retired = object["retired"] as? Bool,
              let dueOn = object["dueOn"] as? String else {
            throw ProgressSyncError.invalidPayload
        }
        return ReviewGradeOutcome(retired: retired, dueOn: dueOn)
    }

    /// Calls the `claim_review_clear_bonus` SECURITY DEFINER RPC directly
    /// -- safe for a client to call as-is (it re-checks the due count and
    /// the once-per-day guard atomically under a row lock server-side,
    /// using auth.uid() internally; see
    /// supabase/migrations/20260918141500_hearts_economy_rpcs.sql).
    public func claimReviewClearBonus(course: String) async throws -> ReviewClearBonus {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/claim_review_clear_bonus"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_course": course])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let granted = row["granted"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return ReviewClearBonus(granted: granted, hearts: row["hearts"] as? Int)
    }

    /// Calls the `get_leaderboard` SECURITY DEFINER RPC directly -- same
    /// direct-RPC-via-PostgREST pattern as claimReviewClearBonus above.
    /// `scope` is "global" | "friends" | "country", `period` is "weekly" |
    /// "all-time"; the RPC itself fails closed to an empty result for an
    /// unauthenticated caller rather than throwing.
    public func fetchLeaderboard(scope: String, period: String) async throws -> [LeaderboardRow] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_leaderboard"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_scope": scope, "_period": period])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> LeaderboardRow? in
            guard let userID = row["user_id"] as? String,
                  let displayName = row["display_name"] as? String,
                  let avatarSeed = row["avatar_seed"] as? String,
                  let xp = row["xp"] as? Int else { return nil }
            return LeaderboardRow(userID: userID, displayName: displayName, country: row["country"] as? String, avatarSeed: avatarSeed, xp: xp)
        }
    }

    /// Calls the `accept_friend_invite` SECURITY DEFINER RPC -- self-invite
    /// and unknown-inviter are handled server-side (`ok: false` + a
    /// message), not client-side validation. Not currently wired into any
    /// UI in this slice (invite acceptance happens via the existing web
    /// route -- see FriendsView.swift's doc comment); provided so a future
    /// in-app accept flow (Universal Links, or a manual id-entry fallback)
    /// doesn't need to add this call from scratch.
    public func acceptFriendInvite(inviterID: String) async throws -> (ok: Bool, message: String) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/accept_friend_invite"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_inviter_id": inviterID])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool,
              let message = row["message"] as? String else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, message)
    }

    /// Calls the `get_friends_progress` SECURITY DEFINER RPC -- the
    /// logged-in user's own friends list with stats, ordered by `week_xp
    /// DESC` server-side.
    public func fetchFriendsProgress() async throws -> [FriendProgress] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_friends_progress"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> FriendProgress? in
            guard let userID = row["user_id"] as? String,
                  let displayName = row["display_name"] as? String,
                  let avatarSeed = row["avatar_seed"] as? String,
                  let streak = row["streak"] as? Int,
                  let weekXP = row["week_xp"] as? Int else { return nil }
            return FriendProgress(userID: userID, displayName: displayName, avatarSeed: avatarSeed, streak: streak, weekXP: weekXP)
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
