import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Study buddies (`request_buddy`, `respond_buddy_request`, `cancel_buddy_request`, `end_buddy`, `get_my_buddy`,
/// `get_buddy_requests`). Every call THROWS on a server error or a malformed row, so a failed lookup is never
/// shown as "no buddy" (the Teams screens did that and it hid broken team functions, PR #237). A mutation returns the
/// server's status (see `BuddyCopy.statusMessage`), or "unknown" when the server returned no row.
extension ProgressSyncClient {
    public func getMyBuddy() async throws -> MyBuddy? {
        let rows = try await buddyRPC("get_my_buddy", [:])
        guard let row = rows.first else { return nil }
        guard let buddy = MyBuddy(row: row) else { throw ProgressSyncError.invalidPayload }
        return buddy
    }

    public func getBuddyRequests() async throws -> [BuddyRequest] {
        try await buddyRPC("get_buddy_requests", [:]).map { row in
            guard let request = BuddyRequest(row: row) else { throw ProgressSyncError.invalidPayload }
            return request
        }
    }

    public func requestBuddy(friendID: String) async throws -> String {
        try await buddyStatus("request_buddy", ["_friend": friendID])
    }

    public func respondBuddyRequest(requestID: String, accept: Bool) async throws -> String {
        try await buddyStatus("respond_buddy_request", ["_request": requestID, "_accept": accept])
    }

    public func cancelBuddyRequest(requestID: String) async throws -> String {
        try await buddyStatus("cancel_buddy_request", ["_request": requestID])
    }

    public func endBuddy() async throws -> String {
        try await buddyStatus("end_buddy", [:])
    }

    /// Sends one of `BuddyCopy.presets` by id (the server refuses anything else).
    public func sendBuddyMessage(presetID: String) async throws -> String {
        try await buddyStatus("send_buddy_message", ["_preset": presetID])
    }

    /// The active pair's newest messages, oldest first. Throws on failure, never an empty history.
    public func getBuddyMessages() async throws -> [BuddyMessage] {
        try await buddyRPC("get_buddy_messages", [:]).map { row in
            guard let message = BuddyMessage(row: row) else { throw ProgressSyncError.invalidPayload }
            return message
        }
    }

    /// Opt in to be matched with another learner of this course at a similar level (Phase 3b).
    public func joinBuddyPool(course: String) async throws -> String {
        try await buddyStatus("join_buddy_pool", ["_course": course])
    }

    public func leaveBuddyPool() async throws -> String {
        try await buddyStatus("leave_buddy_pool", [:])
    }

    /// Whether matching is on, whether the caller is waiting, and their courses. Throws on failure.
    public func getBuddyPool() async throws -> BuddyPool {
        guard let row = try await buddyRPC("get_buddy_pool", [:]).first, let pool = BuddyPool(row: row) else {
            throw ProgressSyncError.invalidPayload
        }
        return pool
    }

    private func buddyStatus(_ function: String, _ body: [String: Any]) async throws -> String {
        let rows = try await buddyRPC(function, body)
        return rows.first?["status"] as? String ?? "unknown"
    }

    private func buddyRPC(_ function: String, _ body: [String: Any]) async throws -> [[String: Any]] {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/\(function)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows
    }
}
