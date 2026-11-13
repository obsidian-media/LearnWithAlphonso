import Foundation
import LearnWithAlphonsoKit
import PostHog

/// Optional usage analytics (PostHog, US cloud). Strictly opt-in; the rules live in the Kit's AnalyticsTracker
/// (tested there) and are pinned by src/lib/analytics-parity.test.ts:
/// - nothing is created, started or sent until the learner opts in (the first-sign-in step or Settings);
/// - turning it off resets the anonymous id and stops sending at once;
/// - never on a device that answered Under 13;
/// - anonymous only: identify() is never called, so no email, name or account id; only the allow-listed
///   properties of AnalyticsEvent, never a typed answer, chat or audio;
/// - no autocapture, no screen-view capture, no session replay, no surveys, no feature flags, no lifecycle events.
/// The project key is a build-time value (Info.plist PostHogKey, injected from the POSTHOG_PROJECT_KEY secret by
/// ios-release.yml); when it is missing the whole feature is off and its screens are hidden.
enum Analytics {
    static let host = "https://us.i.posthog.com"

    static let tracker = AnalyticsTracker(defaults: .standard, isUnder13: { FirstRunDevice.isBlocked })

    /// The injected key, nil in Debug, simulator and CI builds where it is not set.
    static let projectKey: String? = {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "PostHogKey") as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed.hasPrefix("$(") ? nil : trimmed
    }()

    /// False when this build has no key: no consent screen, no Settings switch, nothing sent.
    static var isAvailable: Bool { projectKey != nil && !FirstRunDevice.isBlocked }

    /// At launch: starts the SDK only if the learner already opted in.
    static func start() {
        tracker.resume(makeSink: makeSink)
    }

    static func setConsent(_ on: Bool) {
        tracker.setConsent(on, makeSink: makeSink)
    }

    static func track(_ event: AnalyticsEvent, _ properties: [String: Any] = [:]) {
        tracker.track(event, properties)
    }

    private static func makeSink() -> AnalyticsSink? {
        guard let key = projectKey else { return nil }
        return PostHogSink(key: key)
    }
}

private final class PostHogSink: AnalyticsSink {
    init(key: String) {
        let config = PostHogConfig(projectToken: key, host: Analytics.host)
        config.captureApplicationLifecycleEvents = false
        config.captureScreenViews = false
        config.captureElementInteractions = false
        config.enableSwizzling = false
        config.preloadFeatureFlags = false
        config.sendFeatureFlagEvent = false
        config.personProfiles = .never
        config.surveys = false
        PostHogSDK.shared.setup(config)
        // An earlier opt-out in this run (or a previous one) is persisted by the SDK: this sink exists only because
        // the learner opted in again.
        PostHogSDK.shared.optIn()
    }

    func capture(_ event: String, properties: [String: Any]) {
        PostHogSDK.shared.capture(event, properties: properties)
    }

    func reset() {
        PostHogSDK.shared.reset()
        PostHogSDK.shared.optOut()
    }
}
