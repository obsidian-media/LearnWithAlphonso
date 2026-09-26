import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Block and report (App Store Guideline 1.2 -- friends, nudges, duels,
/// open matchmaking, leaderboards and display names all need a way to
/// block an abusive user and report content). In its own extension file,
/// same reasoning as ProgressSyncClient+Challenges.swift's own header
/// comment: lands without touching the large shared file directly.
extension ProgressSyncClient {

    /// Calls the `block_user` SECURITY DEFINER RPC (supabase/migrations/
    /// 20260928020000_block_and_report.sql) -- inserts the block row AND
    /// deletes any existing friendship in both directions in one atomic
    /// call. A plain client insert can't do the second half (the reverse-
    /// direction friendship row is owned by the other user), same reason
    /// `remove_friend` needs SECURITY DEFINER.
    public func blockUser(_ userID: String) async throws -> (ok: Bool, message: String) {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/block_user"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_target": userID])

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

    /// Unblocking is a plain delete of the caller's own row -- RLS
    /// (`blocked_users_delete_own`) already scopes this to `blocker =
    /// auth.uid()`, so unlike `blockUser` this never touches a row owned
    /// by anyone else and needs no RPC.
    public func unblockUser(_ userID: String) async throws {
        var request = restRequest(path: "blocked_users", query: [
            URLQueryItem(name: "blocked", value: "eq.\(userID)"),
        ])
        request.httpMethod = "DELETE"
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    /// Plain insert into `content_reports` -- same direct-table-insert
    /// shape as `sendNudge`: the RLS policy (`content_reports_insert_own`)
    /// is the whole trust boundary here, no RPC needed. `reporter` is left
    /// out of the body (the column defaults to `auth.uid()`, and the RLS
    /// WITH CHECK is what actually enforces it, same as nudges.sender_id).
    public func reportUser(_ userID: String, reason: String) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/content_reports"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["reported": userID, "reason": reason])
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }
}
