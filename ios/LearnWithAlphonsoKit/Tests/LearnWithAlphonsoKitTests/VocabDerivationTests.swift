import XCTest
@testable import LearnWithAlphonsoKit

final class VocabDerivationTests: XCTestCase {
    private func mc(id: String, prompt: String, choices: [String], answer: Int, explanation: String) -> Question {
        .multipleChoice(Question.MultipleChoice(id: id, prompt: prompt, choices: choices, answer: answer, explanation: explanation))
    }

    private func fill(id: String, prompt: String, bank: [String], answer: String, explanation: String) -> Question {
        .fillInBlank(Question.FillInBlank(id: id, prompt: prompt, bank: bank, answer: answer, explanation: explanation))
    }

    func testDerivesATermMeaningAndArrowExampleFromAMultipleChoiceQuestion() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "Choose the correct word:", choices: ["cat", "dog"], answer: 0, explanation: "A small pet."),
        ])

        let vocab = deriveVocab(lesson: lesson)

        XCTAssertEqual(vocab, [VocabItem(term: "cat", meaning: "A small pet.", example: "Choose the correct word \u{2192} cat")])
    }

    func testDerivesAFilledInSentenceFromAFillInBlankQuestion() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "I ___ to the store.", bank: ["go", "went"], answer: "went", explanation: "Past tense."),
        ])

        let vocab = deriveVocab(lesson: lesson)

        XCTAssertEqual(vocab, [VocabItem(term: "went", meaning: "Past tense.", example: "I went to the store.")])
    }

    func testFallsBackToAppendingTheAnswerWhenThePromptHasNoBlank() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "Translate hello", bank: [], answer: "hola", explanation: "Greeting."),
        ])

        let vocab = deriveVocab(lesson: lesson)

        XCTAssertEqual(vocab.first?.example, "Translate hello hola")
    }

    func testDedupesByCaseInsensitiveTermKeepingTheFirstOccurrence() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p1", choices: ["Dog"], answer: 0, explanation: "first"),
            mc(id: "q2", prompt: "p2", choices: ["dog"], answer: 0, explanation: "second"),
        ])

        let vocab = deriveVocab(lesson: lesson)

        XCTAssertEqual(vocab.count, 1)
        XCTAssertEqual(vocab.first?.meaning, "first")
    }

    func testSkipsAQuestionWithAnEmptyAnswer() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "p", bank: [], answer: "   ", explanation: "e"),
        ])

        XCTAssertTrue(deriveVocab(lesson: lesson).isEmpty)
    }

    func testHandlesAnOutOfBoundsMultipleChoiceAnswerIndexGracefully() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p", choices: ["a"], answer: 5, explanation: "e"),
        ])

        XCTAssertTrue(deriveVocab(lesson: lesson).isEmpty)
    }
}
