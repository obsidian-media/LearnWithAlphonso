import Foundation

/// Since the account became the source of truth (`AIConsentStore`), this key holds a pre-update acknowledgement
/// until the one-time sync, then mirrors the signed-in account's consent for views not yet reading the store. Only
/// `AIConsentStore` writes it.
///
/// Whether the learner has acknowledged that voice audio and conversation
/// text are sent to third-party speech/AI providers -- the single check
/// every AI entry point (ConversationView, HectorView, CampaignView,
/// SpeakQuestionCard, app target) calls before its first AI interaction,
/// rather than each screen keeping its own copy of this decision. Pure
/// I/O wrapper, same "inject the UserDefaults, default to .standard" split
/// as WidgetSharing.swift, so the fresh-install/returning-user behavior is
/// testable here without a Simulator.
public enum AIDisclosureGate {
    /// "v2" since build 48: the sheet became an explicit Allow / Not now
    /// choice naming the providers (Guideline 5.1.2(i)). The old
    /// `aiDisclosureAcknowledged` flag recorded a forced "Got it", which is
    /// not that consent, so everyone is asked again once.
    public static let acknowledgedDefaultsKey = "aiDataSharingConsent.v2"

    public static func isAcknowledged(in defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: acknowledgedDefaultsKey)
    }

    public static func acknowledge(in defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: acknowledgedDefaultsKey)
    }
}
