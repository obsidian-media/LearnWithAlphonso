import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Account-level AI consent (`profiles.ai_consent_at`), read and written only through the `get_ai_consent` /
/// `set_ai_consent` RPCs (supabase/migrations/20261011100000_ai_consent.sql). A direct profiles PATCH of the column
/// is refused by a trigger, so there is no other write path.
extension ProgressSyncClient {
    public func fetchAIConsent() async throws -> Date? {
        try await callConsentRPC("get_ai_consent", body: [:])
    }

    /// Returns the stored timestamp (nil after a withdrawal).
    public func setAIConsent(_ granted: Bool) async throws -> Date? {
        try await callConsentRPC("set_ai_consent", body: ["_granted": granted])
    }

    private func callConsentRPC(_ name: String, body: [String: Any]) async throws -> Date? {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/\(name)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
            throw ProgressSyncError.invalidPayload
        }
        if object is NSNull { return nil }
        guard let string = object as? String, let date = Self.parsePostgresTimestamp(string) else {
            throw ProgressSyncError.invalidPayload
        }
        return date
    }
}
