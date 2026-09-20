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

/// V3 package 3b -- one aggregated row from `weakness_events`
/// (supabase/migrations/20260921000000_v3_weakness_trend_log.sql), mirrors
/// weakness-trend.functions.ts's WeaknessTrendEntry.
public struct WeaknessTrendEntry: Sendable, Equatable {
    public let category: String
    public let detectedCount: Int
    public let resolvedCount: Int
    public let openCount: Int
    public let lastEventAt: String
}

/// V3 package 2 -- mirrors sync.functions.ts's BuyStreakFreezeResult.
public enum BuyStreakFreezeResult: Sendable, Equatable {
    case ok(streakFreezes: Int, xp: Int)
    case insufficientXp(streakFreezes: Int?)
}

/// V3 package 2 -- one row of `get_my_duels` (supabase/migrations/
/// 20260920060000_v3_engagement_mechanics.sql). `status` is "pending" |
/// "active" | "declined" | "completed".
public struct Duel: Sendable, Equatable, Identifiable {
    public var id: String { duelID }
    public let duelID: String
    public let challengerID: String
    public let opponentID: String
    public let course: String
    public let status: String
    public let challengerXPStart: Int
    public let opponentXPStart: Int
    public let challengerXPNow: Int
    public let opponentXPNow: Int
    public let winnerID: String?
    public let endsAt: String?
}

/// Matches review.functions.ts's `ReviewItem` shape exactly. `source`
/// discriminates a real lesson-question item ("lesson", the default)
/// from a synthetic weakness-detection item ("weakness") that carries
/// its own embedded gradable content instead of pointing at a real
/// lessons/questions row -- see docs/superpowers/specs/
/// 2026-09-20-hector-weakness-detection-design.md.
public struct ReviewItem: Sendable, Equatable {
    public let itemKey: String
    public let lessonId: String
    public let level: String
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let dueOn: String
    public let source: String
    public let weaknessDisplay: String?
    public let prompt: String?
    public let choices: [String]?
    public let answerIndex: Int?
    public let explanation: String?

    public init(
        itemKey: String, lessonId: String, level: String, ease: Double,
        intervalDays: Int, repetitions: Int, dueOn: String,
        source: String = "lesson", weaknessDisplay: String? = nil,
        prompt: String? = nil, choices: [String]? = nil,
        answerIndex: Int? = nil, explanation: String? = nil
    ) {
        self.itemKey = itemKey
        self.lessonId = lessonId
        self.level = level
        self.ease = ease
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.dueOn = dueOn
        self.source = source
        self.weaknessDisplay = weaknessDisplay
        self.prompt = prompt
        self.choices = choices
        self.answerIndex = answerIndex
        self.explanation = explanation
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

/// One row of `friend_activity_events` (supabase/migrations/
/// 20260920010000_friend_activity_events.sql), readable for the caller's
/// own events and their accepted friends' (RLS-enforced server-side, not
/// filtered client-side). `eventType` is "lesson_completed" |
/// "streak_milestone" | "league_promotion" -- the payload fields below are
/// a flattened union of every event type's shape (only the ones relevant
/// to `eventType` are non-nil) rather than a nested `[String: Any]`, so
/// this stays a plain Equatable value type.
public struct FriendActivityEvent: Sendable, Equatable, Identifiable {
    public let id: String
    public let userID: String
    public let eventType: String
    public let createdAt: Date
    /// "lesson_completed" only -- resolve to a title via
    /// ContentStore.findLesson(id:course:), same bundled-content pattern
    /// used everywhere else in this app, rather than the Edge Function
    /// looking up and shipping a title itself.
    public let lessonID: String?
    /// "lesson_completed" only.
    public let xpGain: Int?
    /// "streak_milestone" only.
    public let streak: Int?
    /// "league_promotion" only.
    public let newTier: String?
}

/// One row of `nudges` (supabase/migrations/20260920020000_nudges.sql) --
/// a lightweight "hey, come back" ping between accepted friends. See
/// FriendsView.swift's doc comment for why this is deliberately the
/// weaker, polling-based V2 approach (no real push), and
/// ARCHITECTURE.md's note on what a real V3 version needs.
public struct Nudge: Sendable, Equatable, Identifiable {
    public let id: String
    public let senderID: String
    public let createdAt: Date
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

/// Calls for the RLS-safe subset of src/lib/sync.functions.ts -- operations
/// where a user legitimately controls their own data with no adversarial
/// trust concern (spending their own heart, setting their own declared CEFR
/// level, recording their own placement-test result). Reads use direct
/// PostgREST (`auth.uid() = user_id` RLS policies enforce "own row only"
/// server-side); writes to user_progress/language_progress go through the
/// lose_heart/set_cefr_level/save_placement_result SECURITY DEFINER RPCs
/// instead (supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql)
/// -- those tables no longer grant direct INSERT/UPDATE to `authenticated`.
///
/// completeLesson is the other exception -- it calls the complete-lesson
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

    /// Calls the `lose_heart` SECURITY DEFINER RPC (supabase/migrations/
    /// 20260920050000_revoke_direct_gamification_writes.sql) rather than a
    /// direct user_progress read+PATCH -- that table no longer grants
    /// direct INSERT/UPDATE to `authenticated`. The RPC resolves auth.uid()
    /// server-side, so no userID parameter is needed any more.
    public func loseHeart() async throws -> HeartsResult {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/lose_heart"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let hearts = rows.first?["hearts"] as? Int else {
            throw ProgressSyncError.invalidPayload
        }
        return HeartsResult(hearts: hearts)
    }

    /// Calls the `set_cefr_level` SECURITY DEFINER RPC (same migration as
    /// loseHeart above) rather than a direct language_progress upsert.
    public func setCefrLevel(course: String, level: String) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/set_cefr_level"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_language": course, "_level": level])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    /// Calls the `save_placement_result` SECURITY DEFINER RPC (same
    /// migration as loseHeart above) rather than a direct upsert.
    public func savePlacementResult(course: String, level: String, score: Int) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/save_placement_result"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "_language": course, "_level": level, "_score": score,
        ])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
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
            URLQueryItem(name: "select", value: "item_key,lesson_id,level,ease,interval_days,repetitions,due_on,source,weakness_display,prompt,choices,answer_index,explanation"),
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
            return ReviewItem(
                itemKey: itemKey, lessonId: lessonId, level: level, ease: ease,
                intervalDays: intervalDays, repetitions: repetitions, dueOn: dueOn,
                source: row["source"] as? String ?? "lesson",
                weaknessDisplay: row["weakness_display"] as? String,
                prompt: row["prompt"] as? String,
                choices: row["choices"] as? [String],
                answerIndex: row["answer_index"] as? Int,
                explanation: row["explanation"] as? String
            )
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

    /// Direct PostgREST `GET` on `friend_activity_events`, RLS-scoped to
    /// the caller's own events + their accepted friends' -- no Edge
    /// Function needed for this read side (only the write side, in
    /// complete-lesson, needed touching).
    public func fetchFriendActivity() async throws -> [FriendActivityEvent] {
        var request = restRequest(path: "friend_activity_events", query: [
            URLQueryItem(name: "select", value: "id,user_id,event_type,payload,created_at"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "50"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> FriendActivityEvent? in
            guard let id = row["id"] as? String,
                  let userID = row["user_id"] as? String,
                  let eventType = row["event_type"] as? String,
                  let createdAtString = row["created_at"] as? String,
                  let createdAt = Self.parsePostgresTimestamp(createdAtString) else { return nil }
            let payload = row["payload"] as? [String: Any] ?? [:]
            return FriendActivityEvent(
                id: id, userID: userID, eventType: eventType, createdAt: createdAt,
                lessonID: payload["lessonId"] as? String,
                xpGain: payload["xpGain"] as? Int,
                streak: payload["streak"] as? Int,
                newTier: payload["newTier"] as? String
            )
        }
    }

    /// Sender is implicit server-side (`sender_id DEFAULT auth.uid()`, see
    /// the migration) -- this body only ever needs the recipient. RLS's
    /// `WITH CHECK` additionally requires the recipient be an accepted
    /// friend, so this throws (a 403) for anyone else.
    public func sendNudge(recipientID: String) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/nudges"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["recipient_id": recipientID])
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    public func fetchUnreadNudges() async throws -> [Nudge] {
        var request = restRequest(path: "nudges", query: [
            URLQueryItem(name: "select", value: "id,sender_id,created_at"),
            URLQueryItem(name: "read_at", value: "is.null"),
            URLQueryItem(name: "order", value: "created_at.desc"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> Nudge? in
            guard let id = row["id"] as? String,
                  let senderID = row["sender_id"] as? String,
                  let createdAtString = row["created_at"] as? String,
                  let createdAt = Self.parsePostgresTimestamp(createdAtString) else { return nil }
            return Nudge(id: id, senderID: senderID, createdAt: createdAt)
        }
    }

    public func markNudgesRead(ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        var request = restRequest(path: "nudges", query: [
            URLQueryItem(name: "id", value: "in.(\(ids.joined(separator: ",")))"),
        ])
        request.httpMethod = "PATCH"
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["read_at": ISO8601DateFormatter().string(from: Date())])
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    /// Calls the `buy_streak_freeze_with_xp` SECURITY DEFINER RPC (V3
    /// package 2, supabase/migrations/20260920060000_v3_engagement_mechanics.sql)
    /// -- same direct-RPC pattern as claimReviewClearBonus above. No
    /// "streak-freezes-full" case (unlike hearts, there's no cap).
    public func buyStreakFreezeWithXp(course: String) async throws -> BuyStreakFreezeResult {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/buy_streak_freeze_with_xp"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_course": course])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        if !ok {
            return .insufficientXp(streakFreezes: row["streak_freezes"] as? Int)
        }
        return .ok(streakFreezes: row["streak_freezes"] as? Int ?? 0, xp: row["xp"] as? Int ?? 0)
    }

    /// Calls the `create_duel` SECURITY DEFINER RPC (V3 package 2) --
    /// friendship/self-challenge/duplicate-duel validation all happen
    /// server-side, see that RPC's own comment.
    public func createDuel(opponentID: String, course: String) async throws -> (ok: Bool, reason: String?, duelID: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/create_duel"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_opponent_id": opponentID, "_course": course])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String, row["duel_id"] as? String)
    }

    /// Calls the `respond_to_duel` SECURITY DEFINER RPC (V3 package 2).
    public func respondToDuel(duelID: String, accept: Bool) async throws -> (ok: Bool, reason: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/respond_to_duel"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_duel_id": duelID, "_accept": accept])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String)
    }

    /// Calls the `get_my_duels` SECURITY DEFINER RPC (V3 package 2) --
    /// also lazily resolves any of the caller's active duels whose window
    /// has closed, as a side effect server-side (see that RPC's comment).
    public func fetchMyDuels() async throws -> [Duel] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_my_duels"))
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
        return rows.compactMap { row -> Duel? in
            guard let duelID = row["duel_id"] as? String,
                  let challengerID = row["challenger_id"] as? String,
                  let opponentID = row["opponent_id"] as? String,
                  let course = row["course"] as? String,
                  let status = row["status"] as? String else { return nil }
            return Duel(
                duelID: duelID, challengerID: challengerID, opponentID: opponentID, course: course,
                status: status,
                challengerXPStart: row["challenger_xp_start"] as? Int ?? 0,
                opponentXPStart: row["opponent_xp_start"] as? Int ?? 0,
                challengerXPNow: row["challenger_xp_now"] as? Int ?? 0,
                opponentXPNow: row["opponent_xp_now"] as? Int ?? 0,
                winnerID: row["winner_id"] as? String,
                endsAt: row["ends_at"] as? String
            )
        }
    }

    /// Calls the `claim_weekly_quest` SECURITY DEFINER RPC (V3 package 2)
    /// -- re-verifies the quest was actually completed server-side before
    /// paying out its reward, see that RPC's own comment for why it
    /// doesn't take metric/target/reward as caller-supplied parameters.
    public func claimWeeklyQuest(questID: String, course: String, weekStart: String) async throws -> (ok: Bool, reason: String?, xp: Int?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/claim_weekly_quest"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "_quest_id": questID, "_course": course, "_week_start": weekStart,
        ])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String, row["xp"] as? Int)
    }

    /// Sums `activity_days.xp_earned` over `[from, to)` -- used by the
    /// weekly recap (docs/v2-kickoffs/03-leaderboards.md's "Deepened
    /// feature 2") to show a past week's total without a new RPC;
    /// `get_leaderboard`'s own weekly-XP subquery reads the same table,
    /// just for the *current* week's date range instead of an arbitrary
    /// past one.
    public func fetchActivityXP(userID: String, from: String, to: String) async throws -> Int {
        var request = restRequest(path: "activity_days", query: [
            URLQueryItem(name: "select", value: "xp_earned"),
            URLQueryItem(name: "user_id", value: "eq.\(userID)"),
            URLQueryItem(name: "day", value: "gte.\(from)"),
            URLQueryItem(name: "day", value: "lt.\(to)"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.reduce(0) { $0 + (($1["xp_earned"] as? Int) ?? 0) }
    }

    /// V3 package 3a: direct PostgREST `GET` on `language_progress`,
    /// RLS-scoped to `auth.uid() = user_id` -- a read, so the
    /// 20260920050000 grant revocation (INSERT/UPDATE only) doesn't apply.
    /// Used by ConversationSessionView to adapt AI conversation difficulty
    /// to the learner's real level. Returns nil if the row doesn't exist
    /// yet (e.g. this course was never opened) rather than throwing --
    /// callers should treat that the same as "no adaptation available."
    public func fetchCefrLevel(course: String) async throws -> String? {
        var request = restRequest(path: "language_progress", query: [
            URLQueryItem(name: "select", value: "cefr_level"),
            URLQueryItem(name: "language", value: "eq.\(course)"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.first?["cefr_level"] as? String
    }

    /// Mirrors weakness-trend.functions.ts's getWeaknessTrend exactly: reads
    /// the full `weakness_events` history for this user and aggregates it
    /// into per-category detected/resolved counts client-side (a few
    /// hundred rows at most, no need for a DB view). See that file's doc
    /// comment for why `openCount` is `max(0, detected - resolved)` rather
    /// than a simple "not yet resolved" flag.
    public func fetchWeaknessTrend() async throws -> [WeaknessTrendEntry] {
        var request = restRequest(path: "weakness_events", query: [
            URLQueryItem(name: "select", value: "category,event_type,created_at"),
            URLQueryItem(name: "order", value: "created_at.asc"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }

        var order: [String] = []
        var byCategory: [String: (detected: Int, resolved: Int, lastEventAt: String)] = [:]
        for row in rows {
            guard let category = row["category"] as? String,
                  let eventType = row["event_type"] as? String,
                  let createdAt = row["created_at"] as? String else { continue }
            var entry = byCategory[category] ?? (detected: 0, resolved: 0, lastEventAt: createdAt)
            if eventType == "detected" { entry.detected += 1 } else { entry.resolved += 1 }
            entry.lastEventAt = createdAt
            if byCategory[category] == nil { order.append(category) }
            byCategory[category] = entry
        }

        return order
            .map { category -> WeaknessTrendEntry in
                let v = byCategory[category]!
                return WeaknessTrendEntry(
                    category: category,
                    detectedCount: v.detected,
                    resolvedCount: v.resolved,
                    openCount: max(0, v.detected - v.resolved),
                    lastEventAt: v.lastEventAt
                )
            }
            .sorted { a, b in
                if a.openCount != b.openCount { return a.openCount > b.openCount }
                return a.lastEventAt > b.lastEventAt
            }
    }

    /// PostgREST returns `timestamptz` columns with fractional-second
    /// precision (e.g. "2026-09-20T01:23:45.678901+00:00"), which the
    /// default `ISO8601DateFormatter()` fails to parse -- try with
    /// fractional seconds first, fall back to without.
    private static func parsePostgresTimestamp(_ string: String) -> Date? {
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractionalSeconds.date(from: string) {
            return date
        }
        return ISO8601DateFormatter().date(from: string)
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
