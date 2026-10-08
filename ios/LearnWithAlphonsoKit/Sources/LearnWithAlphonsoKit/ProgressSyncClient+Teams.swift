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
    /// TestFlight feedback (2026-09-29): "Does the team owner have any
    /// authority?" -- lets the client show owner-only controls (kick a
    /// member) without a separate round trip to work out who created it.
    public let isOwner: Bool
}

/// One row of `get_team_members` -- every member of the caller's own team.
public struct TeamMember: Sendable, Equatable, Identifiable {
    public var id: String { userID }
    public let userID: String
    public let displayName: String
    public let avatarSeed: String
    public let joinedAt: Date
    public let isOwner: Bool
    /// Only the owner's list contains members they blocked (so they can remove them); false from an older server.
    public var isBlocked: Bool = false
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
              let joinedAt = Self.parsePostgresTimestamp(joinedAtStr),
              let lockedUntil = Self.parsePostgresTimestamp(lockedStr) else {
            return nil
        }
        let isOwner = row["is_owner"] as? Bool ?? false
        return MyTeam(teamID: teamID, name: name, joinCode: joinCode, joinedAt: joinedAt, switchLockedUntil: lockedUntil, thisWeekXP: thisWeekXP, isOwner: isOwner)
    }

    /// Calls the `get_team_members` RPC -- every member of the caller's
    /// own team, owner flagged. See its own doc comment for why this is a
    /// dedicated RPC rather than a raw PostgREST embed.
    public func getTeamMembers() async throws -> [TeamMember] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_team_members"))
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
        return rows.compactMap { row -> TeamMember? in
            guard let userID = row["user_id"] as? String,
                  let displayName = row["display_name"] as? String,
                  let avatarSeed = row["avatar_seed"] as? String,
                  let joinedAtStr = row["joined_at"] as? String,
                  let joinedAt = Self.parsePostgresTimestamp(joinedAtStr) else { return nil }
            return TeamMember(
                userID: userID, displayName: displayName, avatarSeed: avatarSeed,
                joinedAt: joinedAt, isOwner: row["is_owner"] as? Bool ?? false,
                isBlocked: row["blocked"] as? Bool ?? false
            )
        }
    }

    /// Calls the owner-only `kick_team_member` RPC.
    public func kickTeamMember(userID: String) async throws -> (ok: Bool, reason: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/kick_team_member"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_user_id": userID])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String)
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

    /// Separate from `teamJoinRequest` -- that helper's return shape has no
    /// room for `join_code`, which the creator needs back immediately (it's
    /// the only way to invite anyone to a private team; a re-fetch via
    /// `getMyTeam` would work too, but this avoids the extra round trip).
    public func createTeam(name: String, visibility: String = "public") async throws -> (ok: Bool, reason: String?, teamID: String?, joinCode: String?) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/create_team"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_name": name, "_visibility": visibility])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        return (ok, row["reason"] as? String, row["team_id"] as? String, row["join_code"] as? String)
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
