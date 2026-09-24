import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// V4 candidate #7 (deeper gamification) -- weekly solo challenges and
/// open ("anyone") duel matchmaking. In its own extension file, not
/// added to ProgressSyncClient.swift directly, so this can land in
/// parallel with the Teams/Season Ladder plans without a merge
/// conflict on a shared file -- see that file's own comment on the
/// stored properties this extension reads.
public struct WeeklyChallenge: Sendable, Equatable, Identifiable {
    public var id: String { templateID }
    public let templateID: String
    public let title: String
    public let description: String
    public let progress: Int
    public let threshold: Int
    public let completed: Bool
}

extension ProgressSyncClient {

    /// Calls the get_weekly_challenges SECURITY DEFINER RPC -- resolves
    /// any newly-crossed threshold (and grants its XP reward) as a side
    /// effect, same lazy-resolution shape as this feature's other
    /// pieces.
    public func getWeeklyChallenges() async throws -> [WeeklyChallenge] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_weekly_challenges"))
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
        return rows.compactMap { row -> WeeklyChallenge? in
            guard let templateID = row["template_id"] as? String,
                  let title = row["title"] as? String,
                  let description = row["description"] as? String,
                  let progress = row["progress"] as? Int,
                  let threshold = row["threshold"] as? Int,
                  let completed = row["completed"] as? Bool else { return nil }
            return WeeklyChallenge(templateID: templateID, title: title, description: description, progress: progress, threshold: threshold, completed: completed)
        }
    }

    /// Joins the open-duel matchmaking queue -- matched instantly if a
    /// compatible waiting entry exists, otherwise the caller becomes
    /// the new waiting entry (same table serves both roles, per the
    /// design brainstorm). `matchByLevel: false` opts out of the
    /// course+CEFR-level compatibility filter.
    public func joinOpenDuelQueue(course: String, matchByLevel: Bool) async throws -> (matched: Bool, duelID: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/join_open_duel_queue"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_course": course, "_match_by_level": matchByLevel])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let matched = row["matched"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (matched, row["duel_id"] as? String)
    }

    /// Leaves the open-duel queue (e.g. the user cancels while waiting).
    public func leaveOpenDuelQueue() async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/leave_duel_queue"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

}
