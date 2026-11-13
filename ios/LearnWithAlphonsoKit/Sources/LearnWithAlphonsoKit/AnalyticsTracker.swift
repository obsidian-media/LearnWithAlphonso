import Foundation

/// Where an event finally goes. The app conforms with a PostHog-backed sink; tests use a recording fake.
public protocol AnalyticsSink: AnyObject {
    func capture(_ event: String, properties: [String: Any])
    /// Forgets the anonymous id and anything queued (the learner turned sharing off).
    func reset()
}

/// Optional usage analytics, strictly opt-in, the same rules as the web's src/lib/analytics.ts:
/// - nothing reaches the sink until the learner opts in (first-run choice or Settings);
/// - turning it off stops sending at once and resets the anonymous id;
/// - never on a device that answered Under 13, even with a stored opt-in;
/// - anonymous only (no email, name, account id), and only the allow-listed properties.
public final class AnalyticsTracker: @unchecked Sendable {
    public static let consentKey = "lwa.analytics-consent.v1"

    private let defaults: UserDefaults
    private let isUnder13: () -> Bool
    private let lock = NSLock()
    private var sink: AnalyticsSink?

    public init(defaults: UserDefaults, isUnder13: @escaping () -> Bool) {
        self.defaults = defaults
        self.isUnder13 = isUnder13
    }

    /// True only for an explicit opt-in on a device that is not Under 13.
    public var hasConsent: Bool {
        if isUnder13() { return false }
        return defaults.string(forKey: Self.consentKey) == "1"
    }

    /// Whether the learner has been asked yet (either answer).
    public var hasAnswered: Bool { defaults.string(forKey: Self.consentKey) != nil }

    /// `makeSink` runs only when consent is on, so the SDK is never created or started before it.
    public func setConsent(_ on: Bool, makeSink: () -> AnalyticsSink?) {
        defaults.set(on ? "1" : "0", forKey: Self.consentKey)
        lock.lock()
        defer { lock.unlock() }
        if on {
            if sink == nil, !isUnder13() { sink = makeSink() }
        } else {
            sink?.reset()
            sink = nil
        }
    }

    /// At launch: starts the sink if consent was already given.
    public func resume(makeSink: () -> AnalyticsSink?) {
        guard hasConsent else { return }
        lock.lock()
        defer { lock.unlock() }
        if sink == nil { sink = makeSink() }
    }

    public func track(_ event: AnalyticsEvent, _ properties: [String: Any] = [:]) {
        guard hasConsent else { return }
        lock.lock()
        let current = sink
        lock.unlock()
        guard let current else { return }
        var clean = AnalyticsProperties.sanitize(event, properties)
        clean["platform"] = "ios"
        current.capture(event.rawValue, properties: clean)
    }
}
