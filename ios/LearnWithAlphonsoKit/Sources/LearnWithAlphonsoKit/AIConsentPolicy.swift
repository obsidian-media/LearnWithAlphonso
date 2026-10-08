import Foundation

public enum AIConsentSurface: String, CaseIterable, Sendable {
    case placement, lesson, review, saveWord, hector, conversation, campaign
}

public enum AIItemMode: Equatable, Sendable {
    /// Graded or answered on device only, nothing offered.
    case local
    /// AI is used (the learner allowed it).
    case ai
    /// Local now, with an inline way to turn AI on.
    case localWithOptIn
}

/// Which screens may be walled by consent, and how each item behaves without it. Placement never uses AI (no
/// consent prompt during onboarding). Lesson and review work fully without consent, item by item.
public enum AIConsentPolicy {
    public static func blocksWholeScreen(_ surface: AIConsentSurface) -> Bool {
        switch surface {
        case .hector, .conversation, .campaign: return true
        case .placement, .lesson, .review, .saveWord: return false
        }
    }

    public static func translateMode(on surface: AIConsentSurface, consentGranted: Bool) -> AIItemMode {
        switch surface {
        case .placement: return .local
        case .lesson, .review: return consentGranted ? .ai : .localWithOptIn
        case .saveWord, .hector, .conversation, .campaign: return consentGranted ? .ai : .local
        }
    }

    /// Whether a lesson or review translate card offers "Turn on AI grading". Only when the account itself said no: a
    /// setting that is loading or could not be read must not look like "AI is off" or offer the sheet.
    public static func offersAIGradingOptIn(on surface: AIConsentSurface, status: AIConsentStatus) -> Bool {
        status == .denied && translateMode(on: surface, consentGranted: false) == .localWithOptIn
    }

    public static func speakMode(on surface: AIConsentSurface, consentGranted: Bool) -> AIItemMode {
        translateMode(on: surface, consentGranted: consentGranted)
    }
}
