import Foundation

/// What a whole-screen AI gate shows. Pure, so the rules that keep a live conversation alive are tested rather than
/// read off a view.
public enum AIConsentGatePrompt: Equatable, Sendable {
    /// The setting is off: offer the consent sheet.
    case consent
    /// The setting could not be read: offer a retry, never the sheet.
    case retry
}

public enum AIConsentGatePresentation: Equatable, Sendable {
    /// Not known yet: nothing is mounted and nothing is asked.
    case spinner
    /// The screen is not mounted; only the prompt is shown.
    case prompt(AIConsentGatePrompt)
    /// The screen is mounted. `covered` is the prompt laid over it, if any; the screen itself stays in place.
    case content(covered: AIConsentGatePrompt?)
}

public enum AIConsentGate {
    /// - Parameters:
    ///   - hasBeenShown: the screen has been mounted before in this visit. Once it has, it is never unmounted.
    ///   - didRefresh: this gate's own read of the account has finished. A remembered "denied" from before it is not
    ///     trusted for a first decision, so a learner who consented elsewhere is never asked again.
    public static func presentation(
        status: AIConsentStatus, hasBeenShown: Bool, didRefresh: Bool
    ) -> AIConsentGatePresentation {
        if hasBeenShown {
            switch status {
            case .granted, .loading: return .content(covered: nil)
            case .denied: return .content(covered: .consent)
            case .unavailable: return .content(covered: .retry)
            }
        }
        switch status {
        case .granted: return .content(covered: nil)
        case .loading: return .spinner
        case .unavailable: return .prompt(.retry)
        case .denied: return didRefresh ? .prompt(.consent) : .spinner
        }
    }
}
