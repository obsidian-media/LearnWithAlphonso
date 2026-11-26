import Foundation

/// Comparing a learner's written translation against the curated phrasings a
/// question accepts.
///
/// A hand-kept port of src/lib/translation-answer.ts, which also has a Deno
/// copy in supabase/functions/grade-review. This is the LOCAL half of translate
/// grading and the only half that exists on-device: what it accepts is correct,
/// and what it rejects is sent to the server's AI grader when there is a
/// network. Offline, this IS the verdict -- stricter, but the question stays
/// answerable and the lesson stays completable, which matters more than
/// leniency (a question the learner cannot answer is a lesson that never pays
/// out XP, a streak or an unlock).
///
/// It delegates normalisation to `SpokenAnswer.normalise` for the same reason
/// the TypeScript does: a typed translation and a spoken one face the same
/// "is don't the same as do not" question, and two answers to it would mean a
/// phrasing accepted when said and rejected when typed.
public enum TranslationAnswer {
    /// A letters-only stand-in for "ñ" that survives the spoken normaliser's accent fold and punctuation strip.
    private static let enye = "xqenyeqx"

    /// The spoken normaliser folds every accent, right for a transcript but wrong for typed Spanish: "ano" and "año"
    /// are different words. The enye is protected through the fold and restored; speech keeps its tolerance.
    public static func normalise(_ input: String) -> String {
        let protected = input.precomposedStringWithCanonicalMapping
            .replacingOccurrences(of: "ñ", with: enye)
            .replacingOccurrences(of: "Ñ", with: enye)
        return SpokenAnswer.normalise(protected).replacingOccurrences(of: enye, with: "ñ")
    }

    /// Whether `submission` is one of the phrasings `acceptable` allows.
    ///
    /// Fails closed in both empty cases. An empty submission is not an answer,
    /// and an empty `acceptable` list -- which only malformed content can
    /// produce -- matches nothing rather than everything: over-accepting is
    /// invisible to the learner and silently guts the question.
    public static func matches(submission: String, acceptable: [String]) -> Bool {
        let written = normalise(submission)
        if written.isEmpty { return false }
        return acceptable.contains { normalise($0) == written }
    }
}
