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

    /// /api/stt calls Deepgram with smart_format=true, which renders spoken
    /// numbers as numerals -- so "the bus leaves at nine" comes back as "the bus
    /// leaves at 9". The A1 speaking pack contains that exact phrase.
    func testMatchesANumberWordAgainstTheNumeralReturned() {
        XCTAssertTrue(
            SpokenAnswer.matches(
                transcript: "the bus leaves at 9", expected: "The bus leaves at nine."))
        XCTAssertTrue(
            SpokenAnswer.matches(transcript: "I have 2 brothers", expected: "I have two brothers."))
        XCTAssertFalse(
            SpokenAnswer.matches(transcript: "I have 3 brothers", expected: "I have two brothers."))
    }

    /// Vectors the TypeScript suite had and this one was missing -- a parity
    /// guard with holes in it guards nothing.
    func testForgivesALeadingFillerAndRejectsAPartialAttempt() {
        XCTAssertTrue(SpokenAnswer.matches(transcript: "uh good morning", expected: "Good morning."))
        XCTAssertFalse(SpokenAnswer.matches(transcript: "good", expected: "Good morning."))
    }

    /// The remaining shared vectors, all of which were wrong before review:
    /// "let's" became "let is"; "cannot" never matched "can't"; the n't rule
    /// was anchored and never fired; accents were deleted rather than folded.
    func testNormalisationFixesFoundInReview() {
        XCTAssertTrue(
            SpokenAnswer.matches(
                transcript: "Let's not lose sight of it", expected: "Let us not lose sight of it"))
        XCTAssertEqual(SpokenAnswer.normalise("let's"), SpokenAnswer.normalise("lets"))
        XCTAssertTrue(
            SpokenAnswer.matches(
                transcript: "I am afraid I can't agree", expected: "I am afraid I cannot agree"))
        XCTAssertTrue(
            SpokenAnswer.matches(transcript: "I mustn't forget", expected: "I must not forget"))
        XCTAssertTrue(
            SpokenAnswer.matches(
                transcript: "we are meeting at the café later",
                expected: "We are meeting at the cafe later"))
        XCTAssertFalse(
            SpokenAnswer.matches(
                transcript: "he's already finished", expected: "He has already finished"))
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
