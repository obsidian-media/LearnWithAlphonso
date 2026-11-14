import SwiftUI

/// Settings > Share anonymous usage data: optional PostHog analytics, off until the learner chooses it (the first-sign-in
/// step or this switch). Turning it off stops sending at once and resets the anonymous id. Hidden in a build without a
/// PostHog key (see Analytics).
struct AnalyticsSettingsSection: View {
    @State private var shareUsageData = Analytics.tracker.hasConsent
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard {
            Toggle(isOn: Binding(
                get: { shareUsageData },
                set: { wantsOn in
                    shareUsageData = wantsOn
                    Analytics.setConsent(wantsOn)
                }
            )) {
                SettingsToggleLabel(
                    title: "Share anonymous usage data",
                    subtitle: "Which lessons and screens are used, never what you type or say, and never your name or email. Turn it off any time.")
            }
            .tint(ds.choice)
            .accessibilityIdentifier("shareUsageDataToggle")
        }
    }
}
