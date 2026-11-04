import XCTest
@testable import LearnWithAlphonsoKit

/// Twin of src/lib/course-language-spans.test.ts: the same rules and the same cases.
final class CourseLanguageSpansTests: XCTestCase {
    private func fill(_ prompt: String, _ answer: String, _ explanation: String) -> Question {
        .fillInBlank(.init(id: "q", prompt: prompt, bank: [answer, "x"], answer: answer, explanation: explanation))
    }

    private func spans(_ q: Question, _ explanation: String) -> [String] {
        CourseLanguageSpans.spans(for: q, explanation: explanation)
    }

    func testTakesTheTargetAfterTheArrowWhenThePromptNamesTheLanguage() {
        let e = "hello (informal) → Salut. Core greetings."
        XCTAssertEqual(spans(fill("How do you say \"hello\" in French? ___", "Salut", e), e), ["Salut"])
    }

    func testDoesNotTakeTheAnswerWhenThePromptDoesNotNameTheDirection() {
        let e = "tomber → \"to faint\". Idioms."
        XCTAssertEqual(spans(fill("The idiom \"tomber dans les pommes\" means… ___", "to faint", e), e), [])
    }

    func testDoesNotTakeTheAnswerOfAPromptThatNamesTheLanguageButAsksForEnglish() {
        let e = "pain → \"bread\". Words."
        XCTAssertEqual(spans(fill("The French word \"pain\" (a false friend) actually means… ___", "bread", e), e), [])
    }

    func testTakesAMultipleChoiceAnswerByIndex() {
        let e = "goodbye → Au revoir. Greetings."
        let q = Question.multipleChoice(
            .init(
                id: "q", prompt: "The French word for \"goodbye\" is…", choices: ["Bonsoir", "Au revoir"], answer: 1,
                explanation: e))
        XCTAssertEqual(spans(q, e), ["Au revoir"])
    }

    func testTakesQuotedCourseTextForTranslateListeningAndSpeak() {
        let t = "One way to say it: \"Bonjour.\" Everyday ideas."
        XCTAssertEqual(
            spans(.translate(.init(id: "q", prompt: "Greet.", acceptableAnswers: ["Bonjour.", "Salut"], explanation: t)), t),
            ["Bonjour."])
        let l = "The audio says \"Le dessus est propre.\" Sounds."
        XCTAssertEqual(
            spans(
                .listening(
                    try! JSONDecoder().decode(
                        Question.Listening.self,
                        from: Data(
                            """
                            {"id":"q","prompt":"p","audioText":"Le dessus est propre.","choices":["a","b"],\
                            "answer":"Le dessus est propre.","explanation":"x"}
                            """.utf8))), l),
            ["Le dessus est propre."])
        let s = "Target phrase: \"À demain !\" Phrases."
        XCTAssertEqual(spans(.speak(.init(id: "q", prompt: "Say this aloud:", answer: "À demain !", explanation: s)), s), ["À demain !"])
    }

    func testIgnoresTheSameLettersInsideAnEnglishWordAndUnquotedOccurrences() {
        let prompt = "How do you say \"yes\" in Spanish? ___"
        let a = "yes → sí. This is a sign, not a dessert."
        XCTAssertEqual(spans(fill(prompt, "sí", a), a), ["sí"])
        let b = "Say it with a sí in your voice."
        XCTAssertEqual(spans(fill(prompt, "sí", b), b), [])
        let c = "no → nope. Sentences."
        XCTAssertEqual(spans(fill("How do you say \"no\" in Spanish? ___", "no", c), c), [])
    }

    func testSplitMarksOnlyTheCourseLanguagePieces() {
        XCTAssertEqual(
            CourseLanguageSpans.split("hello → Salut. Core greetings.", spans: ["Salut"]),
            [
                .init(text: "hello → ", isCourseLanguage: false),
                .init(text: "Salut", isCourseLanguage: true),
                .init(text: ". Core greetings.", isCourseLanguage: false),
            ])
    }

    /// The web implementation's exact spans and positions for every French and Spanish question
    /// (Fixtures/save-word-spans.fixtures.json, a byte-for-byte copy guarded by
    /// src/lib/save-word-spans-fixture.test.ts). Every question must give the same spans, in the same places;
    /// a question absent from the fixture must give none.
    func testRealCurriculumMatchesTheWebFixtureExactly() throws {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "save-word-spans.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: [String: [String: Any]]])
        let store = try ContentStore()
        for (code, bundle) in [("fr", store.french), ("es", store.spanish)] {
            let expected = try XCTUnwrap(root[code])
            var seen = 0
            for unit in bundle.units {
                for lesson in unit.lessons {
                    for q in lesson.questions {
                        let key = "\(lesson.id):\(q.idText)"
                        let spans = CourseLanguageSpans.spans(for: q, explanation: q.explanationText)
                        let entry = expected[key]
                        XCTAssertEqual(spans, entry?["spans"] as? [String] ?? [], "\(code) \(key)")
                        guard let entry else { continue }
                        seen += 1
                        let pieces = CourseLanguageSpans.split(q.explanationText, spans: spans)
                        let want = try XCTUnwrap(entry["pieces"] as? [[Any]], key)
                        XCTAssertEqual(pieces.map(\.text), want.map { $0[0] as? String ?? "" }, "\(code) \(key)")
                        XCTAssertEqual(pieces.map { $0.isCourseLanguage ? 1 : 0 }, want.map { $0[1] as? Int ?? -1 }, "\(code) \(key)")
                    }
                }
            }
            XCTAssertEqual(seen, expected.count, code)
        }
    }

    /// Positions, not just strings: the word before an arrow is the English side and is never tappable.
    func testTextBeforeAnArrowIsNeverTappable() {
        for piece in CourseLanguageSpans.split("hello (informal) → Salut. Core greetings.", spans: ["Salut"])
        where piece.isCourseLanguage {
            XCTAssertFalse(piece.text.contains("→"))
            XCTAssertEqual(piece.text, "Salut")
        }
    }
}

private extension Question {
    var idText: String {
        switch self {
        case .multipleChoice(let q): return q.id
        case .fillInBlank(let q): return q.id
        case .reorder(let q): return q.id
        case .listening(let q): return q.id
        case .speak(let q): return q.id
        case .translate(let q): return q.id
        }
    }

    var explanationText: String {
        switch self {
        case .multipleChoice(let q): return q.explanation
        case .fillInBlank(let q): return q.explanation
        case .reorder(let q): return q.explanation
        case .listening(let q): return q.explanation
        case .speak(let q): return q.explanation
        case .translate(let q): return q.explanation
        }
    }
}
