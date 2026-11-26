import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

extension ProgressSyncClient {

    /// This week's quests with progress for one course, from the same durable rows `claim_weekly_quest` checks
    /// (activity_days XP, lesson_completions count) and the claim ledger. All three reads are RLS-scoped to the
    /// signed-in user. A failed read throws: it must not read as zero progress or an unclaimed quest.
    public func getWeeklyQuests(course: String, weekStart: String) async throws -> [WeeklyQuest] {
        let weekEnd = WeeklyQuests.weekEnd(weekStart: weekStart)

        let xpRows = try await getRows(path: "activity_days", query: [
            URLQueryItem(name: "select", value: "xp_earned"),
            URLQueryItem(name: "day", value: "gte.\(weekStart)"),
            URLQueryItem(name: "day", value: "lt.\(weekEnd)"),
        ])
        let lessonRows = try await getRows(path: "lesson_completions", query: [
            URLQueryItem(name: "select", value: "id"),
            URLQueryItem(name: "language", value: "eq.\(course)"),
            URLQueryItem(name: "completed_at", value: "gte.\(weekStart)"),
            URLQueryItem(name: "completed_at", value: "lt.\(weekEnd)"),
        ])
        let claimRows = try await getRows(path: "user_weekly_quest_claims", query: [
            URLQueryItem(name: "select", value: "quest_id"),
            URLQueryItem(name: "week_start", value: "eq.\(weekStart)"),
        ])

        let xp = xpRows.reduce(0) { $0 + (($1["xp_earned"] as? Int) ?? 0) }
        let claimed = Set(claimRows.compactMap { $0["quest_id"] as? String })
        return WeeklyQuests.build(xpThisWeek: xp, lessonsThisWeek: lessonRows.count, claimedIDs: claimed)
    }

    private func getRows(path: String, query: [URLQueryItem]) async throws -> [[String: Any]] {
        var request = restRequest(path: path, query: query)
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows
    }
}
