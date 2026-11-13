import Foundation

/// The whole analytics vocabulary, the same list as the web's src/lib/analytics-events.ts and Android's
/// AnalyticsEvents.kt; src/lib/analytics-parity.test.ts fails if the three drift.
///
/// Privacy by construction: an event may carry only the properties listed in `AnalyticsEvent.allowedProperties`, and
/// a value is kept only if it looks like a short identifier (content ids, level codes, source names) or a small
/// number. Anything else, an email, a typed answer, a chat line, is dropped before it reaches the SDK. Never add a
/// free-text property.
public enum AnalyticsEvent: String, CaseIterable, Sendable {
    case appOpen = "app_open"
    case onboardingStep = "onboarding_step"
    case signInCompleted = "sign_in_completed"
    case lessonStarted = "lesson_started"
    case lessonCompleted = "lesson_completed"
    case practiceCallStarted = "practice_call_started"
    case practiceCallCompleted = "practice_call_completed"
    case podcastPlayed = "podcast_played"
    case podcastCompleted = "podcast_completed"
    case hectorOpened = "hector_opened"
    case paywallViewed = "paywall_viewed"
    case purchaseStarted = "purchase_started"
    case explainRequested = "explain_requested"
    case pathBuilt = "path_built"

    public enum PropertyKind: Sendable { case identifier, number }

    public var allowedProperties: [String: PropertyKind] {
        switch self {
        case .appOpen, .hectorOpened: return [:]
        case .onboardingStep: return ["step": .identifier]
        case .signInCompleted: return ["method": .identifier]
        case .lessonStarted: return ["lesson_id": .identifier, "level": .identifier, "course": .identifier]
        case .lessonCompleted:
            return ["lesson_id": .identifier, "level": .identifier, "course": .identifier, "score_bucket": .identifier]
        case .practiceCallStarted: return ["scenario_id": .identifier]
        case .practiceCallCompleted: return ["scenario_id": .identifier, "stars": .number]
        case .podcastPlayed, .podcastCompleted: return ["episode_id": .identifier, "course": .identifier]
        case .paywallViewed, .purchaseStarted, .explainRequested: return ["source": .identifier]
        case .pathBuilt: return ["course": .identifier]
        }
    }
}

public enum AnalyticsProperties {
    /// A short identifier: letters, digits and _ . : + - only. No spaces and no at sign, so no sentence and no email.
    public static let identifierPattern = "^[A-Za-z0-9_.:+-]{1,64}$"

    private static func isIdentifier(_ value: String) -> Bool {
        value.range(of: identifierPattern, options: .regularExpression) != nil
    }

    /// 0-49, 50-79, 80-99 or 100: a bucket, never the raw score.
    public static func scoreBucket(percent: Double) -> String {
        if !percent.isFinite { return "0-49" }
        if percent >= 100 { return "100" }
        if percent >= 80 { return "80-99" }
        if percent >= 50 { return "50-79" }
        return "0-49"
    }

    /// Keeps only the allowed keys of `event` whose values pass; everything else is dropped.
    public static func sanitize(_ event: AnalyticsEvent, _ properties: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (key, kind) in event.allowedProperties {
            guard let value = properties[key] else { continue }
            switch kind {
            case .identifier:
                if let text = value as? String, isIdentifier(text) { out[key] = text }
            case .number:
                if let number = value as? Int, (0...100).contains(number) { out[key] = number }
            }
        }
        return out
    }
}
