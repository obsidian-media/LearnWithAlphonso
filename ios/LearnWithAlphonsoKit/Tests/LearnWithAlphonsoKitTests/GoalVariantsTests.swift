import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Goal-flavoured question variants (src/lib/goal-variants.test.ts is the web twin of these).
final class GoalVariantsTests: XCTestCase {
    private let json = """
    {"course":"en","units":[{"id":"u1","level":"A1","eyebrow":"","title":"","description":"","lessons":[
      {"id":"u1l1","title":"","subtitle":"","questions":[
        {"id":"q1","type":"mc","prompt":"We eat ___ seven o'clock.","choices":["at","in","on","for"],"answer":0,
         "explanation":"We say \\"at\\".","term":"at",
         "goalVariants":{"travel":{"prompt":"The train leaves ___ seven o'clock.","choices":["in","at","on","for"],
           "answer":1,"explanation":"We say \\"at\\"."}}},
        {"id":"t1","type":"translate","prompt":"Ask where the bank is.","acceptableAnswers":["Where is the bank?"],
         "explanation":"e",
         "goalVariants":{"travel":{"prompt":"Ask where the station is.",
           "acceptableAnswers":["Where is the station?"],"explanation":"e"}}},
        {"id":"q9","type":"mc","prompt":"p","choices":["a","b"],"answer":0,"explanation":"e"}
      ]}]}]}
    """

    private func questions() throws -> [Question] {
        let bundle = try JSONDecoder().decode(ContentBundle.self, from: Data(json.utf8))
        return bundle.units[0].lessons[0].questions
    }

    func testAQuestionWithoutVariantsDecodesAsBefore() throws {
        let q = try questions()[2]
        XCTAssertNil(q.goalVariants)
        XCTAssertFalse(q.hasVariant(forGoal: "travel"))
    }

    func testResolvedForGoalShowsTheVariantAndKeepsTheIdAndShape() throws {
        let q = try questions()[0]
        XCTAssertTrue(q.hasVariant(forGoal: "travel"))
        guard case .multipleChoice(let shown) = q.resolved(forGoal: "travel") else { return XCTFail("type changed") }
        XCTAssertEqual(shown.id, "q1")
        XCTAssertEqual(shown.prompt, "The train leaves ___ seven o'clock.")
        XCTAssertEqual(shown.choices[shown.answer], "at")
        // Same answer text, so the authored vocab card still describes it.
        XCTAssertEqual(shown.term, "at")
    }

    func testAGoalWithoutAVariantShowsTheBaseQuestion() throws {
        let q = try questions()[0]
        guard case .multipleChoice(let shown) = q.resolved(forGoal: "work") else { return XCTFail("type changed") }
        XCTAssertEqual(shown.prompt, "We eat ___ seven o'clock.")
        guard case .multipleChoice(let none) = q.resolved(forGoal: nil) else { return XCTFail("type changed") }
        XCTAssertEqual(none.prompt, "We eat ___ seven o'clock.")
    }

    func testGradingAcceptsTheShownVersionAndTheBaseOnly() throws {
        let t = try questions()[1]
        XCTAssertTrue(isAnswerCorrect(t, picked: "Where is the station?", variantGoal: "travel"))
        XCTAssertTrue(isAnswerCorrect(t, picked: "Where is the bank?", variantGoal: "travel"))
        XCTAssertFalse(isAnswerCorrect(t, picked: "Where is the airport?", variantGoal: "travel"))
        // Another goal, no goal (an older build) and a goal without a version are all the base.
        XCTAssertFalse(isAnswerCorrect(t, picked: "Where is the station?", variantGoal: "work"))
        XCTAssertFalse(isAnswerCorrect(t, picked: "Where is the station?"))
        XCTAssertTrue(isAnswerCorrect(t, picked: "Where is the bank?"))
        // What the player shows is graded by what it shows.
        XCTAssertTrue(isAnswerCorrect(t.resolved(forGoal: "travel"), picked: "Where is the station?"))
    }

    func testAQueuedAnswerKeepsItsGoalAndAnOldRowDecodesAsTheBase() {
        let stored = VariantGoalTag.encode("I take a taxi.", goal: "travel")
        XCTAssertEqual(VariantGoalTag.decode(stored).text, "I take a taxi.")
        XCTAssertEqual(VariantGoalTag.decode(stored).goal, "travel")
        XCTAssertEqual(VariantGoalTag.encode("plain", goal: nil), "plain")
        XCTAssertNil(VariantGoalTag.decode("plain").goal)
        XCTAssertEqual(VariantGoalTag.decode("plain").text, "plain")
        XCTAssertEqual(VariantGoalTag.decode(VariantGoalTag.encode("", goal: "work")).text, "")
    }
}
