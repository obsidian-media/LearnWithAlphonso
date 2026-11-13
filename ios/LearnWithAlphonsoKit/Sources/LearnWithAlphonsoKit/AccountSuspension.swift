import Foundation

/// A suspended (banned) account: the words, and how to recognise it. Staff console, 20261113100000.
///
/// A ban revokes the learner's sessions, so a signed-in app finds out when its refresh is refused, and a sign-in
/// attempt gets Supabase's banned error (`user_banned`, "User is banned"). The server also answers a still-valid access
/// token with `account_suspended` (403). Every route ends in the same plain message and the existing support address.
public enum AccountSuspension {
    public static let title = "This account is suspended."
    /// The API's answer for a banned learner's token (ACCOUNT_SUSPENDED_MESSAGE on the server).
    public static let apiError = "account_suspended"
    public static let supportAddress = "support@alphonsoecosystem.app"
    public static var body: String { "If you think this is a mistake, contact support at \(supportAddress)." }
    public static var message: String { "\(title) \(body)" }

    /// True for Supabase's banned sign-in / refresh error and for the API's `account_suspended`. A wrong code, a
    /// rate limit or an outage is never a suspension.
    public static func isSuspended(_ error: Error) -> Bool {
        guard case SupabaseAuthError.server(_, let message?) = error else { return false }
        return message.localizedCaseInsensitiveContains("banned") || message.contains(apiError)
    }

    /// True for an API response that says the account is suspended (403 with `account_suspended`).
    public static func isSuspended(status: Int, body: Data?) -> Bool {
        guard status == 403, let body, let text = String(data: body, encoding: .utf8) else { return false }
        return text.contains(apiError)
    }
}
