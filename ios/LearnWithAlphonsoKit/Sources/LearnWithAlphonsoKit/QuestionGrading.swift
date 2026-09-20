import Foundation

/// Whether `picked` is the correct answer to `question` -- multiple choice
/// requires an exact choice match, fill-in-blank is case-insensitive and
/// trims whitespace. Client-side only, for immediate visual feedback and
/// offline-optimistic grading; the server (complete-lesson, grade-review)
/// always re-derives correctness independently and is the source of truth.
public func isAnswerCorrect(_ question: Question, picked: String?) -> Bool {
    guard let picked else { return false }
    switch question {
    case .multipleChoice(let q):
        return q.choices.indices.contains(q.answer) && q.choices[q.answer] == picked
    case .fillInBlank(let q):
        return picked.trimmingCharacters(in: .whitespaces).lowercased()
            == q.answer.trimmingCharacters(in: .whitespaces).lowercased()
    }
}
