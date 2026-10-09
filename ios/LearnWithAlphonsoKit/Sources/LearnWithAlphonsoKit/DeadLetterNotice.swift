import Foundation

/// The Learn-tab notice for lesson completions the server permanently rejected.
/// The sync engine moves such an item to a dead-letter store so it stops blocking the queue; without
/// this notice the learner would never know a finished lesson was not saved.
public enum DeadLetterNotice {
    public static let supportAddress = "support@alphonsoecosystem.app"
    public static let contactTitle = "Contact support"
    public static let dismissTitle = "Dismiss"

    public static func visible(lessonIdentities: [String], dismissed: Set<String>) -> [String] {
        lessonIdentities.filter { !dismissed.contains($0) }
    }

    public static func message(count: Int) -> String? {
        guard count > 0 else { return nil }
        return count == 1
            ? "1 lesson couldn't be saved. Contact support."
            : "\(count) lessons couldn't be saved. Contact support."
    }

    /// A mailto with the queue identities (lesson id, course, queued time) and the stable reason codes, so
    /// support can find and fix the record. Nothing else about the learner is added.
    public static func supportMailURL(identities: [String], reasons: [String], appVersion: String) -> URL? {
        var lines = ["Please keep the lines below so we can find your lesson.", ""]
        for (i, identity) in identities.enumerated() {
            lines.append(i < reasons.count ? "\(identity) (\(reasons[i]))" : identity)
        }
        lines.append("App: \(appVersion)")
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = supportAddress
        components.queryItems = [
            URLQueryItem(name: "subject", value: "A lesson couldn't be saved"),
            URLQueryItem(name: "body", value: lines.joined(separator: "\n")),
        ]
        return components.url
    }
}

/// Which dead letters the learner dismissed. Dismissing hides the notice; the records stay for support.
/// The key is in `AccountCacheKeys.all`, so sign-out and account deletion clear it with the other caches.
public struct DeadLetterDismissals {
    public static let key = "deadLetterNotice.dismissed.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var dismissed: Set<String> {
        Set(defaults.stringArray(forKey: Self.key) ?? [])
    }

    public func dismiss(_ identities: [String]) {
        defaults.set(dismissed.union(identities).sorted(), forKey: Self.key)
    }

    /// Forgets dismissals whose record no longer exists, so the key cannot grow forever.
    public func prune(keeping live: [String]) {
        defaults.set(dismissed.intersection(live).sorted(), forKey: Self.key)
    }
}
