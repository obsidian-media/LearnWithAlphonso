import Foundation

/// Which parts of a lesson explanation are in the course's language, for the French and Spanish courses, where an
/// explanation is English with course text quoted inside it. Only text the QUESTION itself proves is course-language
/// is offered for saving; nothing is guessed from a dictionary. Twin of src/lib/course-language-spans.ts: keep the
/// rules and tests the same.
///
/// Proven course-language text, by question type:
/// - translate: the acceptable answers; listening: the audio text; speak: the answer. (Reorder is left out: neither course has one, so it is unverified.)
/// - multiple choice and fill: the correct answer, but ONLY when the prompt states that the answer is in the course
///   language ("... in French?", "The French word for ..."). "The idiom X means..." has an English answer, so it
///   offers nothing.
///
/// A candidate counts only where the explanation quotes it ("...") or puts it right after an arrow
/// ("hello → Salut."), so the same letters inside an English word, or in unquoted English prose, never match.
public enum CourseLanguageSpans {
    public struct Piece: Equatable, Sendable {
        public let text: String
        public let isCourseLanguage: Bool
    }

    private static let answerInCourseLanguage = [
        "^how do you say .* in (?:French|Spanish)\\?",
        "^the (?:French|Spanish)(?: word)? for ",
        "^the opposite of .* in (?:French|Spanish) is",
    ]

    private static func namesTheAnswerLanguage(_ prompt: String) -> Bool {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        return answerInCourseLanguage.contains {
            trimmed.range(of: $0, options: [.regularExpression, .caseInsensitive]) != nil
        }
    }

    private static func candidates(for question: Question) -> [String] {
        switch question {
        case .translate(let q): return q.acceptableAnswers
        case .listening(let q): return [q.audioText]
        case .speak(let q): return [q.answer]
        case .reorder: return []
        case .multipleChoice(let q):
            guard namesTheAnswerLanguage(q.prompt), q.choices.indices.contains(q.answer) else { return [] }
            return [q.choices[q.answer]]
        case .fillInBlank(let q):
            return namesTheAnswerLanguage(q.prompt) ? [q.answer] : []
        }
    }

    /// Ranges (in `explanation`'s Characters) where `text` is quoted or follows an arrow.
    private static func hits(of text: String, in explanation: String) -> [Range<String.Index>] {
        var found: [Range<String.Index>] = []
        let quoted = "\"" + text + "\""
        var from = explanation.startIndex
        while let r = explanation.range(of: quoted, range: from..<explanation.endIndex) {
            found.append(explanation.index(after: r.lowerBound)..<explanation.index(before: r.upperBound))
            from = r.upperBound
        }
        let arrow = "→ " + text
        from = explanation.startIndex
        while let r = explanation.range(of: arrow, range: from..<explanation.endIndex) {
            let nextIsLetter = r.upperBound < explanation.endIndex && explanation[r.upperBound].isLetter
            if !nextIsLetter {
                found.append(explanation.index(r.lowerBound, offsetBy: 2)..<r.upperBound)
            }
            from = r.upperBound
        }
        return found
    }

    /// The course-language strings the explanation contains, each safe to offer for saving.
    public static func spans(for question: Question, explanation: String) -> [String] {
        let explanation = explanation.precomposedStringWithCanonicalMapping
        var out: [String] = []
        for raw in candidates(for: question) {
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
            if !text.isEmpty, !out.contains(text), !hits(of: text, in: explanation).isEmpty { out.append(text) }
        }
        return out
    }

    /// The explanation cut into plain and course-language pieces, in order.
    public static func split(_ explanation: String, spans: [String]) -> [Piece] {
        let text = explanation.precomposedStringWithCanonicalMapping
        let ranges = spans.flatMap { hits(of: $0, in: text) }.sorted { $0.lowerBound < $1.lowerBound }
        var pieces: [Piece] = []
        var cursor = text.startIndex
        for range in ranges where range.lowerBound >= cursor {
            if range.lowerBound > cursor {
                pieces.append(Piece(text: String(text[cursor..<range.lowerBound]), isCourseLanguage: false))
            }
            pieces.append(Piece(text: String(text[range]), isCourseLanguage: true))
            cursor = range.upperBound
        }
        if cursor < text.endIndex { pieces.append(Piece(text: String(text[cursor...]), isCourseLanguage: false)) }
        return pieces
    }
}
