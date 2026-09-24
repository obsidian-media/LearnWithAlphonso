import XCTest

@testable import LearnWithAlphonsoKit

/// The vectors here are deliberately the SAME vectors as
/// src/lib/spoken-answer.test.ts and supabase/functions/grade-review's
/// spoken-answer.test.ts. The rule is implemented three times because it runs
/// in three runtimes; these shared vectors are what stop the three drifting. If
/// they disagreed, the learner would be told "Nice" here and have the item
/// lapsed by the server afterwards -- invisible from either side alone.
final class SpeakQuestionTests: XCTestCase {
    private let speakJSON = """
        {"id":"q1","type":"speak","prompt":"Say this aloud:",
         "answer":"She's a doctor.",
         "explanation":"Target phrase: \\"She's a doctor.\\""}
        """

    func testDecodesSpeakQuestion() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(speakJSON.utf8))
        guard case .speak(let q) = question else {
            return XCTFail("expected a speak question")
        }
        XCTAssertEqual(q.answer, "She's a doctor.")
        XCTAssertEqual(q.prompt, "Say this aloud:")
    }

    func testGradesSpokenAnswerTolerantly() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(speakJSON.utf8))
        XCTAssertTrue(isAnswerCorrect(question, picked: "She is a doctor"))
        XCTAssertTrue(isAnswerCorrect(question, picked: "shes a doctor"))
        XCTAssertTrue(isAnswerCorrect(question, picked: "um, she's a doctor"))
    }

    func testRejectsADifferentOrPartialPhrase() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(speakJSON.utf8))
        XCTAssertFalse(isAnswerCorrect(question, picked: "he is a driver"))
        XCTAssertFalse(isAnswerCorrect(question, picked: "she is"))
    }

    /// Nothing captured is not a wrong answer. It reaches grading looking
    /// identical to silence, and a heart must not be spent on it -- which is
    /// why the speaking UI never submits an empty transcript in the first place.
    func testTreatsNothingCapturedAsNoAnswer() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(speakJSON.utf8))
        XCTAssertFalse(isAnswerCorrect(question, picked: ""))
        XCTAssertFalse(isAnswerCorrect(question, picked: "   "))
        XCTAssertFalse(isAnswerCorrect(question, picked: nil))
    }

    func testNormalisesContractionsAndFillersLikeTheWeb() {
        XCTAssertEqual(
            SpokenAnswer.normalise("She's a Doctor!"), SpokenAnswer.normalise("shes a doctor"))
        XCTAssertEqual(
            SpokenAnswer.normalise("I do not understand"),
            SpokenAnswer.normalise("I don't understand"))
        XCTAssertEqual(SpokenAnswer.normalise("we will see"), SpokenAnswer.normalise("we'll see"))
        XCTAssertEqual(
            SpokenAnswer.normalise("  good   morning "), SpokenAnswer.normalise("good morning"))
    }

    /// A speaking lesson has no vocabulary step: the answer is a whole phrase,
    /// which would make a nonsense vocab card. Same as listening and reorder,
    /// and same as the web's deriveVocab.
    func testSpeakQuestionsContributeNoVocabulary() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(speakJSON.utf8))
        let lesson = Lesson(
            id: "l1", title: "Speaking", subtitle: "Say it out loud", questions: [question])
        XCTAssertTrue(deriveVocab(lesson: lesson, images: [:]).isEmpty)
    }
}
