import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Calls this repo's own /api/account-export and /api/account-delete routes
/// (src/routes/api/account-export.ts, account-delete.ts), which are thin
/// HTTP wrappers around the same account.functions.ts server functions the
/// web app's profile page already uses (exportMyData/deleteMyAccount) --
/// same USER_ID_EXPORT_TABLES/USER_DELETE_TABLES, same
/// requireSupabaseAuth, one implementation for both clients. Same
/// Bearer-token-over-apiBaseURL shape as AIConversationClient.
///
/// Deliberately does NOT touch Hector/Cloud Voice (AppConfig.cloudVoice* --
/// a separate Supabase project this app's backend has no admin access to).
/// Deleting the main account here does not delete a Hector enrollment;
/// SettingsView's confirmation copy says so explicitly rather than
/// implying a full erasure it can't perform. See ARCHITECTURE.md's Native
/// iOS app section for why re-parenting Hector under the main account is
/// out of scope here.
public enum AccountError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
}

public final class AccountClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.requester = requester
    }

    /// POST /api/account-export -- returns the raw JSON body exactly as the
    /// server sends it (already flattened to {exported_at, user_id,
    /// ...tables} server-side), ready to hand straight to a file exporter
    /// with no further parsing needed.
    public func exportMyData() async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/account-export"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return data
    }

    /// POST /api/account-delete -- permanently deletes the account (GDPR
    /// erasure). The server independently re-validates the "DELETE"
    /// literal (account.functions.ts's zod schema is the real gate); the
    /// typed confirmation in SettingsView only gates the local button.
    public func deleteMyAccount() async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/account-delete"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["confirm": "DELETE"])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    private static func requireSuccess(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AccountError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw AccountError.server(status: httpResponse.statusCode, message: errorMessage(from: data))
        }
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = object["error"] as? String,
              !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return message
    }
}
