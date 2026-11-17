import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Gift a streak freeze (supabase/migrations/20261120130000_gift_streak_freeze.sql). In its own extension file, same
/// reasoning as ProgressSyncClient+SocialSafety.swift. The client only ever sends the recipient; the balance, the cap
/// and the daily limit are the database's.
extension ProgressSyncClient {

    /// Calls the `gift_streak_freeze` SECURITY DEFINER RPC. A refusal comes back as a reason the screen turns into
    /// words (`FreezeGiftCopy`); only a transport failure or an unreadable answer throws.
    public func giftStreakFreeze(recipientID: String) async throws -> GiftFreezeOutcome {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/gift_streak_freeze"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_recipient": recipientID])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let ok = row["ok"] as? Bool else {
            throw ProgressSyncError.invalidPayload
        }
        if ok { return GiftFreezeOutcome(ok: true, reason: nil, freezes: row["freezes"] as? Int) }
        return GiftFreezeOutcome(ok: false, reason: GiftFreezeReason.from(row["reason"] as? String), freezes: row["freezes"] as? Int)
    }

    /// The caller's own freeze balance and the friends already gifted today (UTC, the database's day). Both are the
    /// caller's own rows (RLS); a failed read says "unknown" so the button is offered and the database answers.
    public func fetchFreezeGiftState(userID: String, now: Date = Date()) async -> FreezeGiftState {
        var balanceRequest = restRequest(path: "user_progress", query: [
            URLQueryItem(name: "select", value: "streak_freezes"),
            URLQueryItem(name: "user_id", value: "eq.\(userID)"),
        ])
        balanceRequest.httpMethod = "GET"
        var freezes: Int?
        if let (data, response) = try? await requester(balanceRequest),
           (try? Self.requireSuccess(data: data, response: response)) != nil,
           let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            freezes = rows.first?["streak_freezes"] as? Int ?? 0
        }

        var sentRequest = restRequest(path: "streak_freeze_gifts", query: [
            URLQueryItem(name: "select", value: "recipient_id"),
            URLQueryItem(name: "sender_id", value: "eq.\(userID)"),
            URLQueryItem(name: "gift_day", value: "eq.\(HectorAllowance.utcDay(now))"),
        ])
        sentRequest.httpMethod = "GET"
        var giftedTo = Set<String>()
        if let (data, response) = try? await requester(sentRequest),
           (try? Self.requireSuccess(data: data, response: response)) != nil,
           let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            giftedTo = Set(rows.compactMap { $0["recipient_id"] as? String })
        }
        return FreezeGiftState(freezes: freezes, giftedTodayTo: giftedTo)
    }

    /// The caller's unread received gifts (RLS `streak_freeze_gifts_select_own`), newest first.
    public func fetchUnreadFreezeGifts(userID: String) async throws -> [FreezeGift] {
        var request = restRequest(path: "streak_freeze_gifts", query: [
            URLQueryItem(name: "select", value: "id,sender_id"),
            URLQueryItem(name: "recipient_id", value: "eq.\(userID)"),
            URLQueryItem(name: "read_at", value: "is.null"),
            URLQueryItem(name: "order", value: "created_at.desc"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row -> FreezeGift? in
            guard let id = row["id"] as? String, let senderID = row["sender_id"] as? String else { return nil }
            return FreezeGift(id: id, senderID: senderID)
        }
    }

    /// Marks received gifts read once shown (the recipient may update only `read_at` on their own rows).
    public func markFreezeGiftsRead(ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        var request = restRequest(path: "streak_freeze_gifts", query: [
            URLQueryItem(name: "id", value: "in.(\(ids.joined(separator: ",")))"),
            URLQueryItem(name: "read_at", value: "is.null"),
        ])
        request.httpMethod = "PATCH"
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["read_at": ISO8601DateFormatter().string(from: Date())])
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }
}
