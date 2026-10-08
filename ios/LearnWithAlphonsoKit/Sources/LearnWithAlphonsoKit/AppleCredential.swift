import Foundation

/// ASAuthorizationAppleIDProvider.CredentialState, mirrored so the decision is testable without
/// AuthenticationServices. `.unknown` = the lookup itself failed.
public enum AppleCredentialStatus: Sendable, Equatable {
    case authorized, revoked, notFound, transferred, unknown
}

public enum AppleCredentialDecision: Sendable, Equatable {
    case keepSession
    case signOut(notice: String)
}

/// Which Apple user id signed in on this device, and for which Supabase account.
public struct AppleCredentialLink: Codable, Sendable, Equatable {
    public let appleUserID: String
    public let supabaseUserID: String

    public init(appleUserID: String, supabaseUserID: String) {
        self.appleUserID = appleUserID
        self.supabaseUserID = supabaseUserID
    }
}

/// Apple asks apps to check the credential state at launch and to honour a revocation. Only the account that
/// signed in with Apple on THIS device is checked: another account, or Apple sign-in on another device, would
/// read as notFound here and sign out a learner who did nothing.
public enum AppleCredentialPolicy {
    public static func decision(for status: AppleCredentialStatus) -> AppleCredentialDecision {
        switch status {
        case .revoked, .notFound:
            return .signOut(notice: AuthCopy.appleCredentialRevoked)
        case .authorized, .transferred, .unknown:
            return .keepSession
        }
    }

    public static func appleUserToCheck(link: AppleCredentialLink?, signedInUserID: String?) -> String? {
        guard let link, let signedInUserID, link.supabaseUserID == signedInUserID else { return nil }
        return link.appleUserID
    }
}

/// One link at a time: the last Apple sign-in on this device. Cleared on sign-out and deletion.
public final class AppleCredentialStore: @unchecked Sendable {
    public static let key = "lwa.apple-credential-link.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func save(_ link: AppleCredentialLink) {
        if let data = try? JSONEncoder().encode(link) { defaults.set(data, forKey: Self.key) }
    }

    public func load() -> AppleCredentialLink? {
        defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(AppleCredentialLink.self, from: $0) }
    }

    public func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}

/// Apple's given name from the first authorization, kept per account until the name prompt has used it.
public final class AppleGivenNameStore: @unchecked Sendable {
    public static let keyPrefix = "lwa.apple-given-name.v1."
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func save(_ givenName: String, userID: String) {
        defaults.set(givenName, forKey: Self.keyPrefix + userID)
    }

    public func load(userID: String) -> String? {
        defaults.string(forKey: Self.keyPrefix + userID)
    }

    public func clearAll() {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(Self.keyPrefix) {
            defaults.removeObject(forKey: key)
        }
    }
}
