import Foundation

/// What the answer panel says after Check: a title, and the right answer to show when the learner missed it.
/// The verdict itself is decided by the caller (`isAnswerCorrect`, or a settled translation verdict); this only
/// words it. Mirrors the web's `src/lib/answer-verdict.ts`.
public enum AnswerVerdict {
    public static func title(correct: Bool) -> String {
        correct ? "Correct!" : "Not quite"
    }

    /// The answer to show under "Not quite". For a translation, one of several accepted wordings.
    public static func correctAnswer(for question: Question) -> String {
        switch question {
        case .multipleChoice(let q):
            return q.choices.indices.contains(q.answer) ? q.choices[q.answer] : ""
        case .fillInBlank(let q):
            return q.answer
        case .reorder(let q):
            return q.answer
        case .listening(let q):
            return q.answer
        case .speak(let q):
            return q.answer
        case .translate(let q):
            return q.acceptableAnswers.first ?? ""
        }
    }
}
