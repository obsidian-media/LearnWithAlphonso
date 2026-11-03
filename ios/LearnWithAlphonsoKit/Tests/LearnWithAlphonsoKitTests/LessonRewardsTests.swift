import XCTest
@testable import LearnWithAlphonsoKit

/// Same vectors as src/lib/lesson-rewards.test.ts.
final class LessonRewardsTests: XCTestCase {
    private func values(_ xp: Int, _ streak: Int?, _ correct: Int, _ total: Int) -> [String] {
        LessonRewards.chips(xp: xp, streak: streak, correct: correct, total: total).map { "\($0.kind.rawValue):\($0.value)" }
    }

    func testXPStreakAndAccuracy() {
        XCTAssertEqual(values(20, 12, 11, 12), ["xp:+20", "streak:12", "accuracy:92%"])
        XCTAssertEqual(
            LessonRewards.chips(xp: 20, streak: 12, correct: 11, total: 12).map(\.emoji),
            ["\u{2B50}", "\u{1F525}", "\u{1F3AF}"]
        )
    }

    func testOfflineHasNoStreakChip() {
        XCTAssertEqual(values(15, nil, 3, 4), ["xp:+15", "accuracy:75%"])
    }

    func testZeroStreakHasNoStreakChip() {
        XCTAssertEqual(values(10, 0, 4, 4), ["xp:+10", "accuracy:100%"])
    }

    func testNoQuestionsHasNoAccuracyChip() {
        XCTAssertEqual(values(5, 2, 0, 0), ["xp:+5", "streak:2"])
    }

    func testRoundsAccuracy() {
        XCTAssertEqual(values(0, nil, 2, 3), ["xp:+0", "accuracy:67%"])
    }

    func testLessonCompletePaywallSourceRawValue() {
        XCTAssertEqual(PaywallSource.lessonComplete.rawValue, "lesson_complete")
    }
}
