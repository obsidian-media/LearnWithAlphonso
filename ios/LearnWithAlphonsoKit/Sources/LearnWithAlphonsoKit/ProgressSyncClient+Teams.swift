import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// V4 candidate #7 (deeper gamification) -- teams. In its own extension
/// file, not added to ProgressSyncClient.swift directly, so this can
/// land in parallel with the Season Ladder/Challenges plans without a
/// merge conflict on a shared file -- see that file's own comment on
/// the stored properties this extension reads.
public struct TeamLeaderboardRow: Sendable, Equatable {
    public let teamID: String
    public let name: String
    public let weeklyXP: Int
}

public struct MyTeam: Sendable, Equatable {
    public let teamID: String
    public let name: String
    public let joinCode: String
    public let joinedAt: Date
    public let switchLockedUntil: Date
    public let thisWeekXP: Int
}

extension ProgressSyncClient {

    public func getTeamLeaderboard() async throws -> [TeamLeaderboardRow] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_team_leaderboard"))
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
        return rows.compactMap { row -> TeamLeaderboardRow? in
            guard let teamID = row["team_id"] as? String,
                  let name = row["name"] as? String,
                  let weeklyXP = row["weekly_xp"] as? Int else { return nil }
            return TeamLeaderboardRow(teamID: teamID, name: name, weeklyXP: weeklyXP)
        }
    }

    public func getMyTeam() async throws -> MyTeam? {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_my_team"))
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
        guard let row = rows.first,
              let teamID = row["team_id"] as? String,
              let name = row["name"] as? String,
              let joinCode = row["join_code"] as? String,
              let joinedAtStr = row["joined_at"] as? String,
              let lockedStr = row["switch_locked_until"] as? String,
              let thisWeekXP = row["this_week_xp"] as? Int,
              let joinedAt = ISO8601DateFormatter().date(from: joinedAtStr),
              let lockedUntil = ISO8601DateFormatter().date(from: lockedStr) else {
            return nil
        }
        return MyTeam(teamID: teamID, name: name, joinCode: joinCode, joinedAt: joinedAt, switchLockedUntil: lockedUntil, thisWeekXP: thisWeekXP)
    }

    private func teamJoinRequest(rpc: String, body: [String: Any]) async throws -> (ok: Bool, reason: String?, teamID: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/\(rpc)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String, row["team_id"] as? String)
    }

    public func joinTeamByCode(_ code: String) async throws -> (ok: Bool, reason: String?, teamID: String?) {
        try await teamJoinRequest(rpc: "join_team", body: ["_code": code])
    }

    public func autoJoinTeam() async throws -> (ok: Bool, reason: String?, teamID: String?) {
        try await teamJoinRequest(rpc: "auto_join_team", body: [String: String]())
    }

    public func leaveTeam() async throws -> (ok: Bool, reason: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/leave_team"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String)
    }

}
