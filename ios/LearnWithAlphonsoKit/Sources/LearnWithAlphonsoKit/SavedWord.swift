import Foundation

/// What `POST /api/define-word` returns: the word as saved, the sentence it
/// came from, and the stored explanation (the meaning, plus a translation for
/// French and Spanish). `alreadySaved` is true when the word was saved before;
/// that costs nothing server-side.
public struct SavedWordResult: Sendable, Equatable {
    public let alreadySaved: Bool
    public let word: String
    public let sentence: String
    public let explanation: String

    public init(alreadySaved: Bool, word: String, sentence: String, explanation: String) {
        self.alreadySaved = alreadySaved
        self.word = word
        self.sentence = sentence
        self.explanation = explanation
    }
}

public enum SavedWordError: Error, Equatable {
    case invalid
    case limitReached
    case quotaExceeded
    case notSignedIn
    case aiConsentRequired
    case unavailable
    case offline

    /// The server's status code mapped to what the learner should be told.
    public static func from(status: Int, message: String? = nil) -> SavedWordError {
        switch status {
        case 400: return .invalid
        // A 403 can mean the session or the AI consent; only the server's message tells them apart.
        case 403 where message == "ai-consent-required": return .aiConsentRequired
        case 401, 403: return .notSignedIn
        case 409: return .limitReached
        case 429: return .quotaExceeded
        default: return .unavailable
        }
    }

    public var userMessage: String {
        switch self {
        case .invalid: return "That word can't be saved."
        case .limitReached: return "You've reached the limit of 500 saved words. Finish some reviews first."
        case .quotaExceeded: return "You've saved a lot of words for now. Try again in a bit."
        case .notSignedIn: return "Sign in again to save words."
        case .aiConsentRequired: return "Saving a word uses AI, which is turned off. Turn it on to save words."
        case .unavailable: return "Couldn't look that word up. Try again."
        case .offline: return "Saving a word needs a connection."
        }
    }
}
