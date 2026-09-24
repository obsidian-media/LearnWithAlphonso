import XCTest

@testable import LearnWithAlphonsoKit

final class ListeningQuestionTests: XCTestCase {
    private let listeningJSON = """
        {"id":"q1","type":"listening","prompt":"What did you hear?",
         "audioText":"She is a doctor.",
         "choices":["She is a doctor.","He is a driver."],
         "answer":"She is a doctor.","explanation":"The audio says \\"She is a doctor.\\""}
        """

    func testDecodesListeningQuestion() throws {
        let question = try JSONDecoder().decode(
            Question.self, from: Data(listeningJSON.utf8))
        guard case .listening(let q) = question else {
            return XCTFail("expected a listening question")
        }
        XCTAssertEqual(q.audioText, "She is a doctor.")
        XCTAssertEqual(q.answer, "She is a doctor.")
        XCTAssertEqual(q.choices.count, 2)
    }

    /// The answer is the choice TEXT rather than an index, mirroring the
    /// TypeScript variant, so grading is the same case-insensitive comparison
    /// fill-in-blank already uses.
    func testGradesListeningByChoiceText() throws {
        let question = try JSONDecoder().decode(
            Question.self, from: Data(listeningJSON.utf8))
        XCTAssertTrue(isAnswerCorrect(question, picked: "She is a doctor."))
        XCTAssertTrue(isAnswerCorrect(question, picked: "  she is a doctor.  "))
        XCTAssertFalse(isAnswerCorrect(question, picked: "He is a driver."))
        XCTAssertFalse(isAnswerCorrect(question, picked: nil))
    }

    /// A listening answer is a whole sentence, so it would make a nonsense
    /// vocab card -- same reasoning the existing code applies to reorder.
    func testContributesNoVocabulary() throws {
        let question = try JSONDecoder().decode(
            Question.self, from: Data(listeningJSON.utf8))
        let lesson = Lesson(
            id: "l1", title: "T", subtitle: "S", questions: [question])
        XCTAssertTrue(deriveVocab(lesson: lesson, images: [:]).isEmpty)
    }

    /// An unknown question type fails the decode loudly, and that is the
    /// deliberate choice.
    ///
    /// A lenient version was written and reverted. Skipping the unknown
    /// question would leave the lesson with fewer questions than the server's
    /// copy of the same lesson, and `deriveLessonCompletion` throws on that
    /// mismatch -- so the learner would complete the lesson and silently
    /// receive no XP, no streak credit and no unlock, with no error shown.
    /// Failing at decode time is the better trade while content ships inside
    /// the app binary (CI fails the build if the exported JSON drifts from
    /// source, so a bundle newer than its app cannot happen). If
    /// over-the-air content ever lands, this needs a real migration story
    /// rather than silent skipping.
    func testRejectsUnknownQuestionTypes() throws {
        let json = """
            {"id":"l1","title":"T","subtitle":"S","questions":[
              {"id":"q1","type":"from_the_future","prompt":"?","answer":"x","explanation":"e"}
            ]}
            """
        XCTAssertThrowsError(try JSONDecoder().decode(Lesson.self, from: Data(json.utf8)))
    }
}
