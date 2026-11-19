import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

extension ProgressSyncClient {
    /// Records the signed-in learner's IANA time zone through the `set_my_time_zone` RPC
    /// (supabase/migrations/20261126100000). The server books streaks and days from it; it refuses an unknown name
    /// and treats an unchanged zone as a no-op.
    public func setMyTimeZone(_ identifier: String) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/set_my_time_zone"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["_time_zone": identifier])
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }
}

/// Sends the device's time zone after sign-in and whenever the app comes forward, but only when it differs from the
/// last one sent for this account. The last zone sent is remembered as "userID|zone" under an AccountCacheKeys key, so a
/// sign-out clears it and a different account on the same device always sends.
public struct TimeZoneReporter {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// True when a zone was sent. A failed send is not remembered, so the next foreground retries.
    @discardableResult
    public func syncIfChanged(userID: String, zone: String, send: (String) async throws -> Void) async -> Bool {
        let stamp = "\(userID)|\(zone)"
        guard !zone.isEmpty, defaults.string(forKey: AccountCacheKeys.timeZoneSent) != stamp else { return false }
        do { try await send(zone) } catch { return false }
        defaults.set(stamp, forKey: AccountCacheKeys.timeZoneSent)
        return true
    }
}
