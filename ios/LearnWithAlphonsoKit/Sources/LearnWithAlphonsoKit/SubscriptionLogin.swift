import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Which id this app gives RevenueCat (`Purchases.logIn`). The server (`GET /api/subscription-login`) answers with the
/// account's separate subscription identifier, which is never shown anywhere, or with the account id for an account
/// whose purchases were made on a build from before the identifier existed. The server accepts purchases under either
/// id, so any failure here falls back to the account id (what every earlier build used) and never hides Pro.
public enum SubscriptionLogin {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    /// Only the account id itself or a well-formed subscription identifier is ever used.
    public static func acceptable(_ candidate: String, accountID: String) -> Bool {
        if candidate == accountID { return true }
        guard candidate.hasPrefix("sub_") else { return false }
        let hex = candidate.dropFirst(4)
        return hex.count == 32 && hex.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) }
    }

    public static func resolve(
        baseURL: URL,
        accountID: String,
        accessToken: String?,
        timeout: TimeInterval = 8,
        requester: Requester = { try await URLSession.shared.data(for: $0) }
    ) async -> String {
        guard let accessToken else { return accountID }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/subscription-login"))
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await requester(request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = object["appUserId"] as? String,
              acceptable(id, accountID: accountID) else { return accountID }
        return id
    }
}
