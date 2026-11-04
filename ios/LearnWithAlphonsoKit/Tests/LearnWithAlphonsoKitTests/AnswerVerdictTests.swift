import XCTest
@testable import LearnWithAlphonsoKit

final class AnswerVerdictTests: XCTestCase {
    func testMultipleChoiceShowsTheChoiceText() {
        let q = Question.multipleChoice(.init(id: "q1", prompt: "p", choices: ["dig up", "ascertain"], answer: 1, explanation: "e"))
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: q), "ascertain")
    }

    func testMultipleChoiceWithAnOutOfRangeAnswerShowsNothing() {
        let q = Question.multipleChoice(.init(id: "q1", prompt: "p", choices: ["a"], answer: 4, explanation: "e"))
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: q), "")
    }

    func testFillInBlankReorderAndSpeakShowTheirAnswer() {
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: .fillInBlank(.init(id: "q", prompt: "p", bank: [], answer: "water", explanation: "e"))), "water")
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: .reorder(.init(id: "q", prompt: "p", tokens: [], answer: "She is here", explanation: "e"))), "She is here")
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: .speak(.init(id: "q", prompt: "p", answer: "Bonjour", explanation: "e"))), "Bonjour")
    }

    func testTranslateShowsTheFirstAcceptedWordingOrNothing() {
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: .translate(.init(id: "q", prompt: "p", acceptableAnswers: ["I am tired", "I'm tired"], explanation: "e"))), "I am tired")
        XCTAssertEqual(AnswerVerdict.correctAnswer(for: .translate(.init(id: "q", prompt: "p", acceptableAnswers: [], explanation: "e"))), "")
    }

    func testTitles() {
        XCTAssertEqual(AnswerVerdict.title(correct: true), "Correct!")
        XCTAssertEqual(AnswerVerdict.title(correct: false), "Not quite")
    }
}
