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
/// Hector runs in-account now (the 2026-09-27 decouple, see
/// docs/superpowers/specs/2026-09-27-hector-decoupling-design.md), so
/// deleteMyAccount removes Hector data along with the rest -- there is no
/// separate account to reach.
public enum AccountError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
}

public final class AccountClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
    /// Mints a new access token when the server rejects the current one --
    /// see `perform`'s doc comment (AIConversationClient carries the same
    /// mechanism, same reasoning, for its own three AI endpoints). Nil
    /// (the default) means "no refresh available" -- every caller that
    /// doesn't pass this keeps its exact prior behavior: one attempt, a
    /// 401 surfaces as `.server(401, _)` same as any other status.
    private let refreshAccessToken: (@Sendable () async -> String?)?
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.refreshAccessToken = refreshAccessToken
        self.requester = requester
    }

    /// Sends `request` (already carrying the current access token) and,
    /// on a 401 with a `refreshAccessToken` configured, mints one new
    /// token and retries exactly once with it. See
    /// `AIConversationClient.perform`'s doc comment for the full story:
    /// `Session` used to refresh its token only once, at cold launch, so
    /// any call made after the token's ~1-hour lifetime elapsed 401'd
    /// with no visible reason. `linkAppleAuthorization` wires this up;
    /// `exportMyData` and `deleteMyAccount` don't -- unaffected on
    /// purpose, not an oversight.
    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await requester(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 401,
              let refreshAccessToken else {
            return (data, response)
        }
        guard let refreshedToken = await refreshAccessToken() else {
            return (data, response)
        }
        var retryRequest = request
        retryRequest.setValue("Bearer \(refreshedToken)", forHTTPHeaderField: "Authorization")
        return try await requester(retryRequest)
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

        // The body's own appleRevocationStatus was computed server-side
        // but never read by any caller until now (found in a 2026-09-28
        // audit) -- deletion still always succeeds regardless of this
        // value, by design; this is purely so a genuine revocation
        // failure leaves a trace somewhere instead of vanishing entirely.
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let status = object["appleRevocationStatus"] as? String, status == "failed" {
            print("[AccountClient] Apple grant revocation FAILED during account deletion -- a live grant may still exist server-side.")
        }
    }

    /// POST /api/apple-link -- forwards the one-time Apple authorization
    /// code (captured right after a native Sign in with Apple) so a later
    /// account deletion can revoke that grant, which Apple requires.
    /// Every failure here is meant to be silent to the user (see
    /// api/apple-link.ts's own doc comment: the identity token already
    /// authenticated them, this is only groundwork for a future deletion)
    /// -- this method still throws, same as every other call here, so the
    /// caller (Session.signInWithApple) is the one that decides to swallow
    /// it with `try?` in a detached, un-awaited Task rather than that
    /// posture being silently baked in here where a future caller
    /// wouldn't expect it.
    public func linkAppleAuthorization(code: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/apple-link"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["authorizationCode": code])

        let (data, response) = try await perform(request)
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
