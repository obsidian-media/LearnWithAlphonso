import XCTest

@testable import LearnWithAlphonsoKit

/// The same vectors as src/lib/translation-answer.test.ts and the Deno mirror.
/// The rule is implemented three times because it runs in three runtimes; these
/// shared vectors are what stop the three drifting.
final class TranslationAnswerTests: XCTestCase {
    private let accepted = [
        "I don't understand.", "I do not understand.", "Sorry, I don't understand.",
    ]

    private let translateJSON = """
        {"id":"q1","type":"translate","prompt":"Say you do not understand.",
         "acceptableAnswers":["I do not understand.","I don't understand."],
         "explanation":"One way to say it."}
        """

    func testDecodesTranslateQuestion() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(translateJSON.utf8))
        guard case .translate(let q) = question else {
            return XCTFail("expected a translate question")
        }
        XCTAssertEqual(q.acceptableAnswers.count, 2)
        XCTAssertEqual(q.prompt, "Say you do not understand.")
    }

    func testAcceptsAnyCuratedPhrasing() {
        XCTAssertTrue(TranslationAnswer.matches(submission: "i dont understand", acceptable: accepted))
        XCTAssertTrue(
            TranslationAnswer.matches(submission: "I DO NOT UNDERSTAND!", acceptable: accepted))
        XCTAssertTrue(
            TranslationAnswer.matches(submission: "sorry, I don't understand", acceptable: accepted))
    }

    func testAnswersTheContractionQuestionLikeSpokenAnswersDo() {
        XCTAssertEqual(
            TranslationAnswer.normalise("I don't understand"),
            TranslationAnswer.normalise("I do not understand"))
        XCTAssertEqual(
            TranslationAnswer.normalise("we are meeting at the café"),
            TranslationAnswer.normalise("We are meeting at the cafe"))
    }

    func testRejectsADifferentOrPartialSentence() {
        XCTAssertFalse(TranslationAnswer.matches(submission: "I understand", acceptable: accepted))
        XCTAssertFalse(TranslationAnswer.matches(submission: "I do not", acceptable: accepted))
    }

    /// Both empty cases fail closed. Over-accepting is the dangerous direction:
    /// it is invisible to the learner and silently guts the question.
    func testFailsClosedOnEmptyInput() {
        XCTAssertFalse(TranslationAnswer.matches(submission: "", acceptable: accepted))
        XCTAssertFalse(TranslationAnswer.matches(submission: "   ", acceptable: accepted))
        XCTAssertFalse(TranslationAnswer.matches(submission: "anything at all", acceptable: []))
    }

    /// A translate question contributes no vocabulary: the answer is a whole
    /// produced sentence, same as listening, speak and reorder.
    func testTranslateQuestionsContributeNoVocabulary() throws {
        let question = try JSONDecoder().decode(Question.self, from: Data(translateJSON.utf8))
        let lesson = Lesson(
            id: "l1", title: "Translate", subtitle: "Write it", questions: [question])
        XCTAssertTrue(deriveVocab(lesson: lesson, images: [:]).isEmpty)
    }
}
