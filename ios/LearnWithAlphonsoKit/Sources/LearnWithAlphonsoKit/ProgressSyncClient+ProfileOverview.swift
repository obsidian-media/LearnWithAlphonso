import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The Profile's one batched read (visual round 6, part 4): the same tables and filters as the web's
/// `getProfileOverview` (src/lib/profile.functions.ts), fired together. RLS returns the caller's own rows only.
extension ProgressSyncClient {
    private func profileRows(_ path: String, _ query: [URLQueryItem]) async throws -> [[String: Any]] {
        var request = restRequest(path: path, query: query)
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows
    }

    /// Saved words still in review, counted by the server (no rows downloaded).
    private func savedWordCount(userID: String, course: String) async throws -> Int {
        var request = restRequest(path: "review_items", query: [
            URLQueryItem(name: "select", value: "item_key"),
            URLQueryItem(name: "user_id", value: "eq.\(userID)"),
            URLQueryItem(name: "language", value: "eq.\(course)"),
            URLQueryItem(name: "source", value: "eq.saved_word"),
            URLQueryItem(name: "limit", value: "1"),
        ])
        request.httpMethod = "GET"
        request.setValue("count=exact", forHTTPHeaderField: "Prefer")
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        let range = (response as? HTTPURLResponse)?.allHeaderFields
            .first { ($0.key as? String)?.lowercased() == "content-range" }?.value as? String
        return range.flatMap { $0.split(separator: "/").last }.flatMap { Int($0) } ?? 0
    }

    public func fetchProfileOverview(userID: String, course: String, now: Date = Date()) async throws -> ProfileOverviewData {
        let today = ProfileMath.streakToday(now: now)
        let from = ProfileMath.weekStart(ProfileMath.threeMonthsWindow(today: today).start)
        let me = "eq.\(userID)"

        async let profile = profileRows("profiles", [
            URLQueryItem(name: "select", value: "display_name,avatar_seed,country"),
            URLQueryItem(name: "id", value: me),
        ])
        async let langs = profileRows("language_progress", [
            URLQueryItem(name: "select", value: "language,xp,cefr_level,league_tier"),
            URLQueryItem(name: "user_id", value: me),
        ])
        async let prog = profileRows("user_progress", [
            URLQueryItem(name: "select", value: "streak,longest_streak,streak_freezes"),
            URLQueryItem(name: "user_id", value: me),
        ])
        async let comps = profileRows("lesson_completions", [
            URLQueryItem(name: "select", value: "lesson_id,language,correct,total"),
            URLQueryItem(name: "user_id", value: me),
        ])
        async let acts = profileRows("activity_days", [
            URLQueryItem(name: "select", value: "day,xp_earned"),
            URLQueryItem(name: "user_id", value: me),
            URLQueryItem(name: "day", value: "gte.\(from)"),
            URLQueryItem(name: "order", value: "day.asc"),
        ])
        async let best = profileRows("activity_days", [
            URLQueryItem(name: "select", value: "xp_earned"),
            URLQueryItem(name: "user_id", value: me),
            URLQueryItem(name: "order", value: "xp_earned.desc"),
            URLQueryItem(name: "limit", value: "1"),
        ])
        async let speech = profileRows("speech_days", [
            URLQueryItem(name: "select", value: "day,speech_seconds"),
            URLQueryItem(name: "user_id", value: me),
            URLQueryItem(name: "day", value: "gte.\(ProfileMath.weekStart(today))"),
        ])
        async let weak = profileRows("review_items", [
            URLQueryItem(name: "select", value: "weakness_label,weakness_display,lapses,repetitions"),
            URLQueryItem(name: "user_id", value: me),
            URLQueryItem(name: "language", value: "eq.\(course)"),
            URLQueryItem(name: "source", value: "eq.weakness"),
        ])
        async let saved = savedWordCount(userID: userID, course: course)
        async let events = profileRows("weakness_events", [
            URLQueryItem(name: "select", value: "category,event_type,created_at"),
            URLQueryItem(name: "user_id", value: me),
            URLQueryItem(name: "order", value: "created_at.asc"),
        ])
        async let achievements = profileRows("user_achievements", [
            URLQueryItem(name: "select", value: "achievement_id,progress,unlocked_at"),
            URLQueryItem(name: "user_id", value: me),
        ])
        // The friends board is secondary: if it fails the rest of Profile still shows.
        async let friends = try? fetchFriendsProgress()

        let p = try await profile.first
        let u = try await prog.first
        return ProfileOverviewData(
            today: today, course: course,
            displayName: p?["display_name"] as? String,
            avatarSeed: p?["avatar_seed"] as? String,
            country: p?["country"] as? String,
            courses: try await langs.compactMap { r in
                guard let l = r["language"] as? String else { return nil }
                return ProfileCourseProgress(
                    course: l, xp: r["xp"] as? Int ?? 0, cefrLevel: r["cefr_level"] as? String ?? "A1",
                    leagueTier: r["league_tier"] as? String ?? "bronze")
            },
            streak: u?["streak"] as? Int ?? 0,
            longestStreak: u?["longest_streak"] as? Int ?? 0,
            streakFreezes: u?["streak_freezes"] as? Int ?? 0,
            completions: try await comps.compactMap { r in
                guard let id = r["lesson_id"] as? String, let l = r["language"] as? String else { return nil }
                return ProfileCompletion(lessonID: id, language: l, correct: r["correct"] as? Int ?? 0, total: r["total"] as? Int ?? 0)
            },
            activity: try await acts.compactMap { r in
                (r["day"] as? String).map { ProfileActivityDay(day: $0, xp: r["xp_earned"] as? Int ?? 0) }
            },
            bestDayXP: try await best.first?["xp_earned"] as? Int ?? 0,
            speech: try await speech.compactMap { r in
                (r["day"] as? String).map { ProfileSpeechDay(day: $0, seconds: r["speech_seconds"] as? Int ?? 0) }
            },
            weakItems: try await weak.compactMap { r in
                guard let label = r["weakness_label"] as? String, let display = r["weakness_display"] as? String,
                      !label.isEmpty, !display.isEmpty else { return nil }
                return ProfileWeakItem(label: label, display: display, lapses: r["lapses"] as? Int ?? 0, repetitions: r["repetitions"] as? Int ?? 0)
            },
            savedWords: try await saved,
            weaknessEvents: try await events.compactMap { r in
                guard let c = r["category"] as? String, let t = r["event_type"] as? String, let at = r["created_at"] as? String else { return nil }
                return ProfileWeaknessEvent(category: c, eventType: t, createdAt: at)
            },
            achievements: try await achievements.compactMap { r in
                (r["achievement_id"] as? String).map {
                    ProfileAchievementRow(id: $0, progress: r["progress"] as? Int ?? 0, unlockedAt: r["unlocked_at"] as? String)
                }
            },
            friends: await friends ?? [])
    }
}
