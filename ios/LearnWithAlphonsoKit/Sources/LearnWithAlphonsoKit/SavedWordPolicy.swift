import Foundation

/// Where a lesson's text may offer "save this word".
///
/// A saved word is filed under a course and explained by the model as a word OF
/// THAT LANGUAGE. A lesson's explanation is written in English in every course,
/// with French or Spanish words quoted inside it. In the English course the
/// explanation is wholly English, so every word on screen is a word of the
/// course (`savesWholeText`). In the French and Spanish courses most of it is
/// not, so only the course-language text the question itself proves is offered
/// (`CourseLanguageSpans`); everything else, including the English words around
/// it, stays plain. Same rule as `allowsSaving` / `savesWholeText` in
/// src/lib/saved-word-client.ts.
///
/// (Hector, Practice and Campaign are different: their replies are wholly in
/// the language being practised, so they are not gated by this.)
public enum SavedWordPolicy {
    /// What a lesson explanation offers for saving.
    public enum Scope: Equatable, Sendable {
        case none
        /// Every word (the English course).
        case wholeText
        /// Only words inside these course-language strings (French and Spanish).
        case spans([String])
    }

    public static func allowsSaving(inCourse code: String) -> Bool {
        code == "en" || code == "fr" || code == "es"
    }

    /// True where the whole of a lesson's text is in the course's language.
    public static func savesWholeText(inCourse code: String) -> Bool {
        code == "en"
    }

    /// What the explanation under `question` offers. Generated practice has no `Question`: it uses
    /// `savesWholeText` and stays English-only.
    public static func scope(for question: Question, explanation: String, inCourse code: String) -> Scope {
        guard allowsSaving(inCourse: code) else { return .none }
        if savesWholeText(inCourse: code) { return .wholeText }
        let spans = CourseLanguageSpans.spans(for: question, explanation: explanation)
        return spans.isEmpty ? .none : .spans(spans)
    }
}
