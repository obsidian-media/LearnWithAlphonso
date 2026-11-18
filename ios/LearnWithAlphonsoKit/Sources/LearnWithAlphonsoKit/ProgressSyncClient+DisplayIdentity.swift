import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Display name + avatar-color editing (BACKLOG §0.0p). Own extension
/// file, same merge-conflict-avoidance reasoning as
/// ProgressSyncClient+Profile.swift (theme) and +Teams.swift. The name is
/// read with a plain PostgREST GET and saved through confirm_display_name
/// (display_name is not a client-writable column); the avatar seed is a
/// PATCH, allowed by the column-level UPDATE grant on profiles
/// (avatar_seed, theme, country) plus the own-row policy profiles_update_own.
public struct ProfileIdentity: Sendable, Equatable {
    public let displayName: String
    public let avatarSeed: String
}

extension ProgressSyncClient {

/// `nil` covers both "no row yet" and a malformed payload -- SettingsView
/// falls back to whatever it already has locally (empty on first load)
/// rather than surfacing an error for a read that isn't user-initiated.
public func fetchProfileIdentity(userID: String) async throws -> ProfileIdentity? {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "select", value: "display_name,avatar_seed"),
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "GET"
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
          let row = rows.first,
          let displayName = row["display_name"] as? String,
          let avatarSeed = row["avatar_seed"] as? String else {
        return nil
    }
    return ProfileIdentity(displayName: displayName, avatarSeed: avatarSeed)
}

/// `confirm_display_name` (supabase/migrations/20261008130100_display_name_onboarding.sql): the validated way to set
/// the public name. Stores the cleaned name (invisible characters stripped, spaces collapsed), stamps
/// name_confirmed_at, and returns what was stored. A refused name throws ProgressSyncError.server with the code
/// ("blocked-content" or "invalid-name") as the message; SocialReasonCopy.nameSaveMessage turns it into words.
public func confirmDisplayName(_ name: String) async throws -> String {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/confirm_display_name"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["_name": name])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    // A scalar-returning RPC answers with a bare JSON string.
    guard let stored = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? String else {
        throw ProgressSyncError.invalidPayload
    }
    return stored
}

public func updateProfileAvatarSeed(_ avatarSeed: String, userID: String) async throws {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "PATCH"
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["avatar_seed": avatarSeed])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
}

} // extension ProgressSyncClient
