import XCTest
@testable import LearnWithAlphonsoKit

final class QuestionGradingTests: XCTestCase {
    private func mc(choices: [String], answer: Int) -> Question {
        .multipleChoice(Question.MultipleChoice(id: "q1", prompt: "p", choices: choices, answer: answer, explanation: "e"))
    }

    private func fill(answer: String) -> Question {
        .fillInBlank(Question.FillInBlank(id: "q1", prompt: "p", bank: [], answer: answer, explanation: "e"))
    }

    private func reorder(answer: String) -> Question {
        .reorder(Question.Reorder(id: "q1", prompt: "p", tokens: [], answer: answer, explanation: "e"))
    }

    func testMultipleChoiceRequiresAnExactChoiceMatch() {
        let question = mc(choices: ["cat", "dog"], answer: 1)
        XCTAssertTrue(isAnswerCorrect(question, picked: "dog"))
        XCTAssertFalse(isAnswerCorrect(question, picked: "cat"))
    }

    func testMultipleChoiceHandlesAnOutOfBoundsAnswerIndexGracefully() {
        let question = mc(choices: ["cat"], answer: 5)
        XCTAssertFalse(isAnswerCorrect(question, picked: "cat"))
    }

    func testFillInBlankIsCaseInsensitiveAndTrimsWhitespace() {
        let question = fill(answer: "Went")
        XCTAssertTrue(isAnswerCorrect(question, picked: "  went  "))
        XCTAssertFalse(isAnswerCorrect(question, picked: "go"))
    }

    func testReturnsFalseWhenNothingWasPicked() {
        XCTAssertFalse(isAnswerCorrect(mc(choices: ["cat"], answer: 0), picked: nil))
    }

    func testReorderIsCaseInsensitiveAndTrimsWhitespaceOnTheJoinedString() {
        let question = reorder(answer: "She is a doctor")
        XCTAssertTrue(isAnswerCorrect(question, picked: "  she IS a doctor  "))
        XCTAssertFalse(isAnswerCorrect(question, picked: "a doctor is she"))
    }

    func testQuestionFromWeaknessItemBuildsAMultipleChoiceQuestion() {
        let item = ReviewItem(
            itemKey: "weakness:abc123", lessonId: "weakness", level: "A1",
            ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20",
            source: "weakness", weaknessDisplay: "Past-tense verbs",
            prompt: "She ___ to the store yesterday.",
            choices: ["go", "goes", "went", "gone"], answerIndex: 2,
            explanation: "Past tense of 'go' is 'went'."
        )

        let question = question(fromWeaknessItem: item)

        guard case .multipleChoice(let mc) = question else {
            return XCTFail("Expected a multipleChoice question")
        }
        XCTAssertEqual(mc.id, "weakness:abc123")
        XCTAssertEqual(mc.choices, ["go", "goes", "went", "gone"])
        XCTAssertEqual(mc.answer, 2)
    }

    func testQuestionFromWeaknessItemReturnsNilForALessonSourcedItem() {
        let item = ReviewItem(
            itemKey: "lesson1:q1", lessonId: "lesson1", level: "A1",
            ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20"
        )

        XCTAssertNil(question(fromWeaknessItem: item))
    }

    func testQuestionFromWeaknessItemReturnsNilWhenEmbeddedFieldsAreMissing() {
        let item = ReviewItem(
            itemKey: "weakness:abc123", lessonId: "weakness", level: "A1",
            ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20",
            source: "weakness", weaknessDisplay: "Past-tense verbs",
            prompt: nil, choices: ["go", "went"], answerIndex: 1,
            explanation: "why"
        )

        XCTAssertNil(question(fromWeaknessItem: item))
    }
}
