import XCTest
@testable import LearnWithAlphonsoKit

final class CurriculumModelsTests: XCTestCase {
    func testDecodesMultipleChoiceQuestion() throws {
        let json = """
        {
            "id": "q1",
            "type": "mc",
            "prompt": "Which is a formal greeting?",
            "choices": ["Hey!", "What's up?", "Good morning.", "Yo."],
            "answer": 2,
            "explanation": "\\"Good morning\\" is polite and used in professional settings."
        }
        """.data(using: .utf8)!

        let question = try JSONDecoder().decode(Question.self, from: json)

        guard case let .multipleChoice(mc) = question else {
            return XCTFail("Expected .multipleChoice, got \(question)")
        }
        XCTAssertEqual(mc.id, "q1")
        XCTAssertEqual(mc.choices.count, 4)
        XCTAssertEqual(mc.answer, 2)
    }

    func testDecodesFillInBlankQuestion() throws {
        let json = """
        {
            "id": "q2",
            "type": "fill",
            "prompt": "Nice to ___ you.",
            "bank": ["meet", "meat", "met", "meeting"],
            "answer": "meet",
            "explanation": "\\"Nice to meet you\\" is the standard greeting when introduced."
        }
        """.data(using: .utf8)!

        let question = try JSONDecoder().decode(Question.self, from: json)

        guard case let .fillInBlank(fill) = question else {
            return XCTFail("Expected .fillInBlank, got \(question)")
        }
        XCTAssertEqual(fill.bank, ["meet", "meat", "met", "meeting"])
        XCTAssertEqual(fill.answer, "meet")
    }
}
