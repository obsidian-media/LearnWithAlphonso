import XCTest
@testable import LearnWithAlphonsoKit

final class LessonReinforcementTests: XCTestCase {
    private func mc(_ id: String) -> Question {
        .multipleChoice(Question.MultipleChoice(id: id, prompt: "p\(id)", choices: ["a", "b"], answer: 0, explanation: "e"))
    }

    func testDrawsFromSiblingQuestionsByDefault() {
        let result = pickReinforcementQuestion(
            siblingQuestions: [mc("s1"), mc("s2")],
            levelQuestions: [mc("l1"), mc("l2")],
            doingWell: false,
            seed: "seed-1"
        )
        guard case .multipleChoice(let q) = result else { return XCTFail("expected a question") }
        XCTAssertTrue(["s1", "s2"].contains(q.id))
    }

    func testDrawsFromLevelQuestionsWhenDoingWell() {
        let result = pickReinforcementQuestion(
            siblingQuestions: [mc("s1"), mc("s2")],
            levelQuestions: [mc("l1"), mc("l2")],
            doingWell: true,
            seed: "seed-1"
        )
        guard case .multipleChoice(let q) = result else { return XCTFail("expected a question") }
        XCTAssertTrue(["l1", "l2"].contains(q.id))
    }

    func testFallsBackToLevelQuestionsWhenSiblingQuestionsIsEmpty() {
        let result = pickReinforcementQuestion(
            siblingQuestions: [],
            levelQuestions: [mc("l1")],
            doingWell: false,
            seed: "seed-1"
        )
        guard case .multipleChoice(let q) = result else { return XCTFail("expected a question") }
        XCTAssertEqual(q.id, "l1")
    }

    func testFallsBackToSiblingQuestionsWhenLevelQuestionsIsEmpty() {
        let result = pickReinforcementQuestion(
            siblingQuestions: [mc("s1")],
            levelQuestions: [],
            doingWell: true,
            seed: "seed-1"
        )
        guard case .multipleChoice(let q) = result else { return XCTFail("expected a question") }
        XCTAssertEqual(q.id, "s1")
    }

    func testReturnsNilWhenBothPoolsAreEmpty() {
        let result = pickReinforcementQuestion(
            siblingQuestions: [], levelQuestions: [], doingWell: false, seed: "seed-1"
        )
        XCTAssertNil(result)
    }

    func testIsDeterministicForTheSameSeed() {
        let pool = [mc("s1"), mc("s2"), mc("s3")]
        let a = pickReinforcementQuestion(siblingQuestions: pool, levelQuestions: [], doingWell: false, seed: "same-seed")
        let b = pickReinforcementQuestion(siblingQuestions: pool, levelQuestions: [], doingWell: false, seed: "same-seed")
        guard case .multipleChoice(let qa) = a, case .multipleChoice(let qb) = b else { return XCTFail("expected questions") }
        XCTAssertEqual(qa.id, qb.id)
    }
}
