import XCTest
@testable import LearnWithAlphonsoKit

final class TutorMemoryContextTests: XCTestCase {
    func testReturnsNilForABrandNewLearnerWithNoLevelAndNoWeaknesses() {
        let message = TutorMemoryContext.buildPrimingMessage(cefrLevel: nil, openWeaknessCategories: [])
        XCTAssertNil(message)
    }

    func testMentionsOnlyTheCefrLevelWhenThereAreNoOpenWeaknesses() {
        let message = TutorMemoryContext.buildPrimingMessage(cefrLevel: "B1", openWeaknessCategories: [])
        XCTAssertEqual(message?.role, "user")
        XCTAssertTrue(message!.content.contains("B1"))
        XCTAssertFalse(message!.content.contains("working on"))
    }

    func testMentionsOnlyWeaknessesWhenThereIsNoCefrLevelYet() {
        let message = TutorMemoryContext.buildPrimingMessage(cefrLevel: nil, openWeaknessCategories: ["past-tense"])
        XCTAssertTrue(message!.content.contains("past tense"))
        XCTAssertFalse(message!.content.contains("English level"))
    }

    func testHumanizesCategoryLabelsAndCapsAtThreeCategories() {
        let message = TutorMemoryContext.buildPrimingMessage(
            cefrLevel: "A2",
            openWeaknessCategories: ["past-tense", "articles", "prepositions", "plurals"]
        )
        let content = try! XCTUnwrap(message?.content)
        XCTAssertTrue(content.contains("past tense"))
        XCTAssertTrue(content.contains("articles"))
        XCTAssertTrue(content.contains("prepositions"))
        XCTAssertFalse(content.contains("plurals"))
    }

    func testMarksTheMessageAsBackgroundNotAConversationTurn() {
        let message = TutorMemoryContext.buildPrimingMessage(cefrLevel: "B1", openWeaknessCategories: [])
        XCTAssertTrue(message!.content.contains("not part of what the learner said"))
    }
}
