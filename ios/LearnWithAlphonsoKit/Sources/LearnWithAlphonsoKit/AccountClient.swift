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
/// deleteMyAccount itself does not reach Hector/Cloud Voice
/// (AppConfig.cloudVoice* -- a separate Supabase project this app's
/// backend has no admin access to) directly; SettingsView's confirmation
/// copy is explicit about the current, still-partial coverage rather
/// than implying a full erasure. `linkHectorAccount` below is the Hector
/// re-parenting Phase 0 piece that lets the *server* reach it instead --
/// see docs/superpowers/specs/2026-09-26-hector-reparenting-design.md.
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

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    /// POST /api/hector-link -- Hector re-parenting Phase 0. Records
    /// which Cloud Voice (Hector) account belongs to this account, so a
    /// later account deletion can revoke it (see hector-revocation.ts's
    /// doc comment for the AlphonsoEcosystem endpoint contract that
    /// still needs building before revocation actually happens -- this
    /// call itself always succeeds once the pairing is stored). Same
    /// "throws, caller decides to swallow it" posture as
    /// `linkAppleAuthorization` -- the real Hector enrollment already
    /// succeeded by the time this fires, so the caller
    /// (`HectorView`) fires this fire-and-forget too.
    ///
    /// Sends the Cloud Voice **access token**, not a claimed user id --
    /// the server derives the real id itself by verifying this token
    /// against Cloud Voice's own Supabase project
    /// (`src/lib/cloud-voice-auth.ts`). A previous version of this
    /// method sent `cloudVoiceUserId` directly, which let anyone who
    /// knew a victim's id link it without proving they controlled that
    /// account; never revert to that shape.
    public func linkHectorAccount(cloudVoiceAccessToken: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/hector-link"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["cloudVoiceAccessToken": cloudVoiceAccessToken])

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
