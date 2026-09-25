import Foundation

/// Whether `picked` is the correct answer to `question` -- multiple choice
/// requires an exact choice match, fill-in-blank and reorder are both
/// case-insensitive and trim whitespace (for reorder, `picked` is the
/// tapped tokens already joined into one space-separated string -- see
/// LessonPlayerView/ReviewQueueView's reorder UI). Client-side only, for
/// immediate visual feedback and offline-optimistic grading; the server
/// (complete-lesson, grade-review) always re-derives correctness
/// independently and is the source of truth.
///
/// `course` defaults to `.english` so every pre-existing call site keeps its
/// exact prior behaviour without changes -- only `.speak` branches on it.
public func isAnswerCorrect(_ question: Question, picked: String?, course: Course = .english) -> Bool {
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
    case .translate(let q):
        // Local-only on device, and deliberately so. The AI half of translate
        // grading runs server-side (/api/grade-translation, and grade-review
        // for review items); this is the floor the player shows instantly and
        // the whole verdict when there is no network.
        return TranslationAnswer.matches(submission: picked, acceptable: q.acceptableAnswers)
    case .speak(let q):
        // `picked` is a speech-to-text transcript, whose spelling of the same
        // utterance varies run to run, so it needs the tolerant match rather
        // than the comparison above -- and it needs the SAME tolerant match the
        // server uses, or the learner is told "Nice" and then has the item
        // lapsed. See SpokenAnswer.swift's note on the three copies.
        //
        // English's rules are actively wrong for French ('s -> "is" is an
        // auxiliary-verb contraction; French elision is a different,
        // phonological rule) -- see SpokenAnswerFr.swift's header for why
        // this is a course-selected sibling, not a language flag.
        return course == .french
            ? SpokenAnswerFr.matches(transcript: picked, expected: q.answer)
            : SpokenAnswer.matches(transcript: picked, expected: q.answer)
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
