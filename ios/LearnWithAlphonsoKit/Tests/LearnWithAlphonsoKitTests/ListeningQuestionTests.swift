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

    /// The whole ContentBundle decodes at once, so a question type this build
    /// does not know must degrade to "one fewer question", never "no content
    /// at all". Content ships inside the app bundle, so without this an app
    /// older than its JSON would show a learner nothing.
    func testSkipsUnknownQuestionTypesInsteadOfFailingTheLesson() throws {
        let json = """
            {"id":"l1","title":"T","subtitle":"S","questions":[
              {"id":"q1","type":"from_the_future","prompt":"?","answer":"x","explanation":"e"},
              {"id":"q2","type":"fill","prompt":"a ___","bank":["b"],"answer":"b","explanation":"e"}
            ]}
            """
        let lesson = try JSONDecoder().decode(Lesson.self, from: Data(json.utf8))
        XCTAssertEqual(lesson.questions.count, 1)
        guard case .fillInBlank(let q) = lesson.questions[0] else {
            return XCTFail("expected the known fill question to survive")
        }
        XCTAssertEqual(q.id, "q2")
    }
}
