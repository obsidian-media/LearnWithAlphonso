import Foundation

/// Whether the learner has acknowledged that voice audio and conversation
/// text are sent to third-party speech/AI providers -- the single check
/// every AI entry point (ConversationView, HectorView, CampaignView,
/// SpeakQuestionCard, app target) calls before its first AI interaction,
/// rather than each screen keeping its own copy of this decision. Pure
/// I/O wrapper, same "inject the UserDefaults, default to .standard" split
/// as WidgetSharing.swift, so the fresh-install/returning-user behavior is
/// testable here without a Simulator.
public enum AIDisclosureGate {
    public static let acknowledgedDefaultsKey = "aiDisclosureAcknowledged"

    public static func isAcknowledged(in defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: acknowledgedDefaultsKey)
    }

    public static func acknowledge(in defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: acknowledgedDefaultsKey)
    }
}
