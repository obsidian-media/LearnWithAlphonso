import XCTest
@testable import LearnWithAlphonsoKit

final class VocabDeckTests: XCTestCase {
    func testAOneWordDeckGoesStraightToPractice() {
        XCTAssertEqual(VocabDeck.buttonTitle(index: 0, count: 1), "Start practice")
    }

    func testMovesWordToWordThenStartsPracticeOnTheLastCard() {
        XCTAssertEqual(VocabDeck.buttonTitle(index: 0, count: 3), "Next word")
        XCTAssertEqual(VocabDeck.buttonTitle(index: 1, count: 3), "Next word")
        XCTAssertEqual(VocabDeck.buttonTitle(index: 2, count: 3), "Start practice")
    }
}
