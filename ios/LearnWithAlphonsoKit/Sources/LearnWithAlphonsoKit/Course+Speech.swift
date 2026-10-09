import Foundation

/// The on-device text-to-speech locale per course (lesson audio, review, placement, "Hear it first").
/// The Spanish course is Latin American (no vosotros), so its device voice is Mexican Spanish,
/// matching the conversation voice. The web's `localeForCourse` (src/data/courses.ts) returns the
/// same values; src/lib/ios-binary-polish.test.ts keeps them equal. Diacritic folding in
/// SpokenAnswerEs is text normalisation, not speech, and is separate.
extension Course {
    public var speechLocale: String {
        switch self {
        case .english: return "en-US"
        case .french: return "fr-FR"
        case .spanish: return "es-MX"
        }
    }

    /// Voices to try, in order. A device without an es-MX voice gets another Latin American voice before
    /// the system default, never Spain's.
    public var speechLocaleCandidates: [String] {
        switch self {
        case .english: return ["en-US"]
        case .french: return ["fr-FR"]
        case .spanish: return ["es-MX", "es-US"]
        }
    }
}
