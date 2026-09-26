import Foundation

/// Display name + avatar-color editing (BACKLOG §0.0p). Own extension
/// file, same merge-conflict-avoidance reasoning as
/// ProgressSyncClient+Profile.swift (theme) and +Teams.swift. Plain
/// PostgREST GET/PATCH against `profiles` -- profiles_update_own already
/// lets a user write their own row (see +Profile.swift's own comment),
/// this just adds the two columns web's updateProfile already writes.
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

public func updateProfileDisplayName(_ displayName: String, userID: String) async throws {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "PATCH"
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["display_name": displayName])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
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
