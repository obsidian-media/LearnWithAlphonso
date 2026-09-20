import XCTest
@testable import LearnWithAlphonsoKit

final class QuestionGradingTests: XCTestCase {
    private func mc(choices: [String], answer: Int) -> Question {
        .multipleChoice(Question.MultipleChoice(id: "q1", prompt: "p", choices: choices, answer: answer, explanation: "e"))
    }

    private func fill(answer: String) -> Question {
        .fillInBlank(Question.FillInBlank(id: "q1", prompt: "p", bank: [], answer: answer, explanation: "e"))
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
}
