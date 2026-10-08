import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The learner's own public name and whether they have chosen it. Read through get_my_name_status
/// (supabase/migrations/20261010160000_name_onboarding_status_and_skip.sql), a definer function, so it does not
/// depend on profiles' SELECT policy.
public struct NameStatus: Sendable, Equatable {
    public let displayName: String
    /// Parsed for display only. Whether the name is confirmed is `nameConfirmed`, decided by the column holding
    /// a value, so an unfamiliar timestamp format never sends a learner back to the prompt.
    public let nameConfirmedAt: Date?
    public let nameConfirmed: Bool
    public var needsPrompt: Bool { !nameConfirmed }

    public init(displayName: String, nameConfirmedAt: Date?, nameConfirmed: Bool? = nil) {
        self.displayName = displayName
        self.nameConfirmedAt = nameConfirmedAt
        self.nameConfirmed = nameConfirmed ?? (nameConfirmedAt != nil)
    }
}

extension ProgressSyncClient {

private func nameRPC(_ function: String, body: [String: Any]) async throws -> Data {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/\(function)"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    return data
}

/// `nil` when the profile row does not exist (no rows). Callers treat nil like a failed check: skip the prompt
/// this launch. Throws on transport or server failure, so RootView can tell "check failed" from "confirmed".
public func fetchNameStatus() async throws -> NameStatus? {
    let data = try await nameRPC("get_my_name_status", body: [:])
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        throw ProgressSyncError.invalidPayload
    }
    guard let row = rows.first, let displayName = row["display_name"] as? String else { return nil }
    let rawConfirmedAt = row["name_confirmed_at"] as? String
    return NameStatus(
        displayName: displayName,
        nameConfirmedAt: rawConfirmedAt.flatMap { Self.parsePostgresTimestamp($0) },
        nameConfirmed: rawConfirmedAt != nil
    )
}

/// The server filter's verdict without saving: nil (allowed), "invalid-name" or "blocked-content".
public func displayNameProblem(_ name: String) async throws -> String? {
    let data = try await nameRPC("display_name_problem", body: ["_name": name])
    if data.isEmpty { return nil }
    let value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    if value is NSNull { return nil }
    guard let code = value as? String else { throw ProgressSyncError.invalidPayload }
    return code
}

/// "Skip" on the prompt: keeps a clean Learner-XXXX handle or stores a new one, stamps the confirmation, and
/// returns the stored name. Never publishes a full name the learner did not choose.
public func skipDisplayNamePrompt() async throws -> String {
    let data = try await nameRPC("skip_display_name_prompt", body: [:])
    guard let stored = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? String else {
        throw ProgressSyncError.invalidPayload
    }
    return stored
}

} // extension ProgressSyncClient
