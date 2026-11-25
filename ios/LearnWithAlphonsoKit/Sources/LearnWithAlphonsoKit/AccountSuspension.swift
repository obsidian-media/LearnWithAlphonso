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
    public static let supportAddress = "support@learnwithalphonso.com"
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

    // MARK: Full-screen view (backlog item 87)

    public static let contactTitle = "Contact support"
    public static let signOutTitle = "Sign out"
    /// The address as a mailto link, for the Contact support button.
    public static var contactURL: URL { URL(string: "mailto:\(supportAddress)")! }

    /// What the full-screen view reads out and shows. `reason` is an optional line from the API; the API sends none
    /// today (the web screen has none), so it is nil unless a future response carries one. Blank counts as none.
    public struct Content: Equatable {
        public let title: String
        public let body: String
        public let reason: String?
        public let contactLabel: String
        public let signOutLabel: String
    }

    public static func content(reason: String? = nil) -> Content {
        let trimmed = reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        return Content(
            title: title,
            body: body,
            reason: (trimmed?.isEmpty ?? true) ? nil : trimmed,
            contactLabel: "\(contactTitle). Opens an email to \(supportAddress).",
            signOutLabel: "\(signOutTitle). Returns to the sign-in screen."
        )
    }
}
