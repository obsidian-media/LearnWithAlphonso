import XCTest
@testable import LearnWithAlphonsoKit

final class LessonFinishCopyTests: XCTestCase {
    func testAZeroScoreIsNotCongratulated() {
        XCTAssertEqual(LessonFinishCopy.headline(correct: 0, total: 8), LessonFinishCopy.low)
        XCTAssertNotEqual(LessonFinishCopy.headline(correct: 0, total: 8), "Nice work!")
    }

    func testLowMiddleAndGoodScoresGetTheirOwnLine() {
        XCTAssertEqual(LessonFinishCopy.headline(correct: 3, total: 8), LessonFinishCopy.low)
        XCTAssertEqual(LessonFinishCopy.headline(correct: 4, total: 8), LessonFinishCopy.fair)
        XCTAssertEqual(LessonFinishCopy.headline(correct: 6, total: 8), LessonFinishCopy.fair)
        XCTAssertEqual(LessonFinishCopy.headline(correct: 7, total: 8), LessonFinishCopy.good)
        XCTAssertEqual(LessonFinishCopy.headline(correct: 8, total: 8), LessonFinishCopy.good)
    }

    func testALessonWithNoQuestionsKeepsTheDefault() {
        XCTAssertEqual(LessonFinishCopy.headline(correct: 0, total: 0), LessonFinishCopy.good)
    }

    func testTheLinesAreShortAndHaveNoDoubleHyphens() {
        for line in [LessonFinishCopy.good, LessonFinishCopy.fair, LessonFinishCopy.low] {
            XCTAssertLessThanOrEqual(line.count, 30)
            XCTAssertFalse(line.contains("--"))
        }
    }
}
