import XCTest
@testable import LearnWithAlphonsoKit

final class VocabDerivationTests: XCTestCase {
    private func mc(id: String, prompt: String, choices: [String], answer: Int, explanation: String) -> Question {
        .multipleChoice(Question.MultipleChoice(id: id, prompt: prompt, choices: choices, answer: answer, explanation: explanation))
    }

    private func fill(id: String, prompt: String, bank: [String], answer: String, explanation: String) -> Question {
        .fillInBlank(Question.FillInBlank(id: id, prompt: prompt, bank: bank, answer: answer, explanation: explanation))
    }

    // Mirrors src/data/vocab.test.ts. The quiz explanation is never a word's meaning,
    // and a quiz stem is never an example sentence.

    func testAClozeMultipleChoiceQuestionGivesAFilledSentenceAndNoMeaning() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "She ___ happy.", choices: ["is", "am"], answer: 0, explanation: "'is' is correct here. Match the verb form to the subject."),
        ])

        let vocab = deriveVocab(lesson: lesson, images: [:])

        XCTAssertEqual(vocab, [VocabItem(term: "is", meaning: "", example: "She is happy.", image: nil)])
    }

    func testAFillInBlankQuestionGivesAFilledSentenceAndNoMeaning() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "I ___ to the store.", bank: ["go", "went"], answer: "went", explanation: "Past tense."),
        ])

        let vocab = deriveVocab(lesson: lesson, images: [:])

        XCTAssertEqual(vocab, [VocabItem(term: "went", meaning: "", example: "I went to the store.", image: nil)])
    }

    func testAQuizStemGivesNoExample() {
        let stems = [
            "Plural of \"baby\": ___",
            "Which verb goes with \"homework\"? ___",
            "Opposite of \"hot\":",
            "Choose the correct word:",
            "Which word completes \"attend a ___\"?",
        ]
        for prompt in stems {
            let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
                mc(id: "q1", prompt: prompt, choices: ["babies", "x"], answer: 0, explanation: "e"),
            ])
            XCTAssertEqual(deriveVocab(lesson: lesson, images: [:]).first?.example, "", prompt)
        }
    }

    // Mirrors "tidies the sentence" in src/data/vocab.test.ts.
    func testTidiesTheSentence() {
        func example(_ prompt: String, _ answer: String) -> String? {
            let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
                mc(id: "q1", prompt: prompt, choices: [answer, "x", "y"], answer: 0, explanation: "e"),
            ])
            return deriveVocab(lesson: lesson, images: [:]).first?.example
        }
        XCTAssertEqual(example("Is this seat ___ ?", "taken"), "Is this seat taken?")
        XCTAssertEqual(example("While we ___ , the phone rang.", "were talking"), "While we were talking, the phone rang.")
        XCTAssertEqual(example("___ I open the window, please?", "may"), "May I open the window, please?")
        XCTAssertEqual(example("Je ___ (boire) de l'eau.", "bois"), "Je bois de l'eau.")
        XCTAssertEqual(example("It's ___ past six. (30 min)", "half"), "It's half past six.")
        // French keeps its own space before ? elsewhere; only the join is tidied.
        XCTAssertEqual(example("Excusez-moi, où est la gare ? Et ___ ?", "vous"), "Excusez-moi, où est la gare ? Et vous?")
    }

    func testAPromptWithNoBlankGivesNoExample() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "Translate hello", bank: [], answer: "hola", explanation: "Greeting."),
        ])

        XCTAssertEqual(deriveVocab(lesson: lesson, images: [:]).first?.example, "")
    }

    func testDedupesByCaseInsensitiveTermKeepingTheFirstOccurrence() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p1", choices: ["Dog"], answer: 0, explanation: "first"),
            mc(id: "q2", prompt: "p2", choices: ["dog"], answer: 0, explanation: "second"),
        ])

        let vocab = deriveVocab(lesson: lesson, images: [:])

        XCTAssertEqual(vocab.count, 1)
        XCTAssertEqual(vocab.first?.meaning, "")
    }

    func testSkipsAQuestionWithAnEmptyAnswer() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            fill(id: "q1", prompt: "p", bank: [], answer: "   ", explanation: "e"),
        ])

        XCTAssertTrue(deriveVocab(lesson: lesson, images: [:]).isEmpty)
    }

    func testHandlesAnOutOfBoundsMultipleChoiceAnswerIndexGracefully() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p", choices: ["a"], answer: 5, explanation: "e"),
        ])

        XCTAssertTrue(deriveVocab(lesson: lesson, images: [:]).isEmpty)
    }

    // MARK: - image lookup

    func testAttachesAnImageWhenTheLowercasedTermMatchesTheImagesDictionary() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p", choices: ["Dog"], answer: 0, explanation: "e"),
        ])
        let image = VocabImageRef(url: "https://images.pexels.com/dog.jpg", alt: "A dog", credit: "Someone")

        let vocab = deriveVocab(lesson: lesson, images: ["dog": image])

        XCTAssertEqual(vocab.first?.image, image)
    }

    func testLeavesImageNilWhenNoMatchingKeyExistsInTheImagesDictionary() {
        let lesson = Lesson(id: "u1l1", title: "t", subtitle: "s", questions: [
            mc(id: "q1", prompt: "p", choices: ["Dog"], answer: 0, explanation: "e"),
        ])

        let vocab = deriveVocab(lesson: lesson, images: ["cat": VocabImageRef(url: "u", alt: "a", credit: "c")])

        XCTAssertNil(vocab.first?.image)
    }

    // MARK: - provenance fields (App Store review fix, 2026-10)

    func testDecodesAVocabImageWithProvenanceFields() throws {
        let json = #"{"url":"u","alt":"a","credit":"c","source":"pexels","sourcePageUrl":"https://www.pexels.com/photo/x-1/","license":"Pexels License (https://www.pexels.com/license/)","reviewedBy":"agent:review-r1-b001","reviewedAt":"2026-10-08"}"#
        let ref = try JSONDecoder().decode(VocabImageRef.self, from: Data(json.utf8))
        XCTAssertEqual(ref.source, "pexels")
        XCTAssertEqual(ref.sourcePageUrl, "https://www.pexels.com/photo/x-1/")
        XCTAssertEqual(ref.reviewedBy, "agent:review-r1-b001")
        XCTAssertEqual(ref.reviewedAt, "2026-10-08")
    }

    func testStillDecodesAnEntryWithoutProvenance() throws {
        let ref = try JSONDecoder().decode(VocabImageRef.self, from: Data(#"{"url":"u","alt":"a","credit":"c"}"#.utf8))
        XCTAssertNil(ref.source)
        XCTAssertNil(ref.reviewedAt)
        XCTAssertEqual(ref, VocabImageRef(url: "u", alt: "a", credit: "c"))
    }

    // Authored card fields (pack line fields 3 and 4, bundled on the question).

    func testAuthoredMeaningAndExampleAreUsed() {
        let lesson = Lesson(id: "a1p1l1", title: "t", subtitle: "s", questions: [
            .multipleChoice(Question.MultipleChoice(
                id: "q1", prompt: "Plural of \"child\": ___", choices: ["children", "childs"], answer: 0,
                explanation: "x", meaning: "more than one child", example: "The children play outside.")),
        ])

        XCTAssertEqual(
            deriveVocab(lesson: lesson, images: [:]),
            [VocabItem(term: "children", meaning: "more than one child", example: "The children play outside.", image: nil)])
    }

    func testAnAuthoredMeaningWithoutAnExampleKeepsTheFilledClozeSentence() {
        let lesson = Lesson(id: "a1p2l1", title: "t", subtitle: "s", questions: [
            .fillInBlank(Question.FillInBlank(
                id: "q1", prompt: "I ___ to the store.", bank: ["go", "went"], answer: "went",
                explanation: "x", meaning: "moved to a place in the past")),
        ])

        XCTAssertEqual(
            deriveVocab(lesson: lesson, images: [:]),
            [VocabItem(term: "went", meaning: "moved to a place in the past", example: "I went to the store.", image: nil)])
    }

    func testAnAuthoredTermReplacesTheAnswerAndAnEmptyOneMakesNoCard() {
        let lesson = Lesson(id: "a2p12l1", title: "t", subtitle: "s", questions: [
            .multipleChoice(Question.MultipleChoice(
                id: "q1", prompt: "How often does \"always\" happen?", choices: ["every time", "never"], answer: 0,
                explanation: "x", meaning: "every time, without exception",
                example: "I always brush my teeth.", term: "always")),
            .multipleChoice(Question.MultipleChoice(
                id: "q2", prompt: "Which is the present simple?", choices: ["I ate.", "I eat."], answer: 1,
                explanation: "x", term: "")),
        ])

        XCTAssertEqual(
            deriveVocab(lesson: lesson, images: [:]),
            [VocabItem(term: "always", meaning: "every time, without exception", example: "I always brush my teeth.", image: nil)])
    }

    func testTheBundledEnglishA1CardsAllHaveAMeaning() throws {
        let store = try ContentStore()
        let a1 = store.english.units.filter { $0.level == "A1" }.flatMap { $0.lessons }
        XCTAssertFalse(a1.isEmpty)
        for lesson in a1 {
            for item in deriveVocab(lesson: lesson, images: [:]) {
                XCTAssertFalse(item.meaning.isEmpty, "\(lesson.id) \(item.term) has no meaning")
                XCTAssertFalse(item.example.isEmpty, "\(lesson.id) \(item.term) has no example")
            }
        }
    }
}
