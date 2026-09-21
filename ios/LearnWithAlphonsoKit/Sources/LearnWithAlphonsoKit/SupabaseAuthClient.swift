import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A signed-in session. Matches the shape AlphonsoCompanion's
/// VoiceCloudService.swift already proved correct against Supabase's real
/// GoTrue auth API -- same endpoints, same request/response shapes, ported
/// here for this app's own separate Supabase project (see the design
/// doc's architecture section: two backends, each reused for what it's
/// already good at -- this app's own Supabase project for auth/content,
/// AlphonsoEcosystem's voice backend for AI conversation only).
public struct SupabaseSession: Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    /// The signed-in user's own id (GoTrue's `user.id`) -- needed for
    /// anything that must reference "me" client-side (e.g. building an
    /// invite link, comparing a leaderboard row to "is this me").
    public let userID: String

    public init(accessToken: String, refreshToken: String, expiresAt: Date, userID: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.userID = userID
    }
}

public enum SupabaseAuthError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
    case invalidPayload
}

/// Supabase's own GoTrue email-OTP flow: request a code
/// (`POST /auth/v1/otp`), verify it (`POST /auth/v1/verify`) to get a
/// session, and refresh that session (`POST /auth/v1/token?grant_type=
/// refresh_token`) once it's close to expiring. The `requester` closure is
/// injected the same way as TutorConversationClient's, for the same
/// reason: real tests, no network.
public final class SupabaseAuthClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let supabaseURL: URL
    private let publishableKey: String
    private let requester: Requester

    public init(
        supabaseURL: URL,
        publishableKey: String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.supabaseURL = supabaseURL
        self.publishableKey = publishableKey
        self.requester = requester
    }

    public func requestEmailOTP(email: String) async throws {
        let url = supabaseURL.appendingPathComponent("auth/v1/otp")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "create_user": true,
        ])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }

    public func verifyEmailOTP(email: String, code: String) async throws -> SupabaseSession {
        let url = supabaseURL.appendingPathComponent("auth/v1/verify")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "token": code,
            "type": "email",
        ])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return try Self.decodeSession(from: data)
    }

    /// Completes the PKCE handshake started by SupabaseOAuthFlow.authorizeURL
    /// once the app has captured `code` from the browser's redirect back.
    public func exchangeOAuthCode(_ code: String, codeVerifier: String) async throws -> SupabaseSession {
        var components = URLComponents(url: supabaseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "pkce")]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "auth_code": code,
            "code_verifier": codeVerifier,
        ])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return try Self.decodeSession(from: data)
    }

    public func refresh(_ session: SupabaseSession) async throws -> SupabaseSession {
        var components = URLComponents(url: supabaseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": session.refreshToken])

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        return try Self.decodeSession(from: data)
    }

    private static func requireSuccess(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SupabaseAuthError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw SupabaseAuthError.server(status: httpResponse.statusCode, message: errorMessage(from: data))
        }
    }

    private static func decodeSession(from data: Data) throws -> SupabaseSession {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = object["access_token"] as? String,
              let refreshToken = object["refresh_token"] as? String,
              let user = object["user"] as? [String: Any],
              let userID = user["id"] as? String else {
            throw SupabaseAuthError.invalidPayload
        }
        let expiresAt: Date
        if let expiresAtUnix = object["expires_at"] as? Double {
            expiresAt = Date(timeIntervalSince1970: expiresAtUnix)
        } else if let expiresIn = object["expires_in"] as? Double {
            expiresAt = Date().addingTimeInterval(expiresIn)
        } else {
            expiresAt = Date().addingTimeInterval(3600)
        }
        return SupabaseSession(accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt, userID: userID)
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        let message = (object["msg"] as? String) ?? (object["error_description"] as? String) ?? (object["error"] as? String)
        guard let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return message
    }
}
