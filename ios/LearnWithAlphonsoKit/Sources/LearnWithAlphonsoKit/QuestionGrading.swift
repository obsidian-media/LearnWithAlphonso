import Foundation

/// Whether `picked` is the correct answer to `question` -- multiple choice
/// requires an exact choice match, fill-in-blank and reorder are both
/// case-insensitive and trim whitespace (for reorder, `picked` is the
/// tapped tokens already joined into one space-separated string -- see
/// LessonPlayerView/ReviewQueueView's reorder UI). Client-side only, for
/// immediate visual feedback and offline-optimistic grading; the server
/// (complete-lesson, grade-review) always re-derives correctness
/// independently and is the source of truth.
public func isAnswerCorrect(_ question: Question, picked: String?) -> Bool {
    guard let picked else { return false }
    switch question {
    case .multipleChoice(let q):
        return q.choices.indices.contains(q.answer) && q.choices[q.answer] == picked
    case .fillInBlank(let q):
        return picked.trimmingCharacters(in: .whitespaces).lowercased()
            == q.answer.trimmingCharacters(in: .whitespaces).lowercased()
    case .reorder(let q):
        return picked.trimmingCharacters(in: .whitespaces).lowercased()
            == q.answer.trimmingCharacters(in: .whitespaces).lowercased()
    case .listening(let q):
        // `answer` is the choice text, so this is the same comparison
        // fill-in-blank uses rather than an index lookup.
        return picked.trimmingCharacters(in: .whitespaces).lowercased()
            == q.answer.trimmingCharacters(in: .whitespaces).lowercased()
    case .speak(let q):
        // `picked` is a speech-to-text transcript, whose spelling of the same
        // utterance varies run to run, so it needs the tolerant match rather
        // than the comparison above -- and it needs the SAME tolerant match the
        // server uses, or the learner is told "Nice" and then has the item
        // lapsed. See SpokenAnswer.swift's note on the three copies.
        return SpokenAnswer.matches(transcript: picked, expected: q.answer)
    }
}

/// Builds a `Question` directly from a weakness-sourced `ReviewItem`'s
/// embedded content, bypassing the bundled-lesson lookup entirely --
/// `nil` if `item` isn't a weakness item or is missing any required
/// field (a malformed/inconsistent row fails safe rather than crashing
/// the reviewer, matching ReviewQueueView's existing "skip on mismatch"
/// behavior for lesson items).
public func question(fromWeaknessItem item: ReviewItem) -> Question? {
    guard item.source == "weakness",
          let prompt = item.prompt,
          let choices = item.choices,
          let answerIndex = item.answerIndex,
          let explanation = item.explanation else {
        return nil
    }
    return .multipleChoice(Question.MultipleChoice(
        id: item.itemKey, prompt: prompt, choices: choices,
        answer: answerIndex, explanation: explanation
    ))
}
