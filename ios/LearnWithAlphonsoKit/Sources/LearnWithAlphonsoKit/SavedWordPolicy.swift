import Foundation

/// Where a lesson's text may offer "save this word".
///
/// A saved word is filed under a course and explained by the model as a word OF
/// THAT LANGUAGE. A lesson's explanation is written in English in every course,
/// with French or Spanish words quoted inside it, and a translate prompt mixes
/// both languages the other way round. In the English course the explanation is
/// wholly English, so every word on screen is a word of the course; in the
/// French and Spanish courses most of it is not, so tapping "means" would file
/// an English word under French. Until the app can tell course-language text
/// from interface text, only the English course offers it.
///
/// (Hector, Practice and Campaign are different: their replies are wholly in
/// the language being practised, so they are not gated by this.)
public enum SavedWordPolicy {
    public static func allowsSaving(inCourse code: String) -> Bool {
        code == "en"
    }
}
