import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The goal card on MY PATH, pinned with the same learners as the web test (src/lib/path-goal-card.test.ts) so the
/// three platforms print the same words.
final class PathGoalCardTests: XCTestCase {
    private func path(_ key: String) throws -> LearningPath {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "learning-path.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let all = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let data = try JSONSerialization.data(withJSONObject: ["path": try XCTUnwrap(all[key])])
        return try XCTUnwrap(try LearningPathDecoding.path(from: data))
    }

    func testTheBehindLearnerShowsTargetLessonsAWeekAndStatus() throws {
        let card = PathGoalCard.lines(for: try path("behind"))
        XCTAssertTrue(card.hasGoal)
        XCTAssertEqual(card.kicker, "My goal")
        XCTAssertEqual(card.headline, "A2 by 1 Jun 2027")
        XCTAssertEqual(card.detail, "9 lessons a week \u{00B7} A bit behind")
    }

    func testTheOnTrackLearnerAndTheTrimmedLearner() throws {
        let ahead = PathGoalCard.lines(for: try path("onTrack"))
        XCTAssertEqual(ahead.headline, "A2 by 1 Jun 2028")
        XCTAssertEqual(ahead.detail, "4 lessons a week \u{00B7} Ahead of plan")
        XCTAssertEqual(PathGoalCard.lines(for: try path("behindTrimmed")).detail, "53 lessons a week \u{00B7} A bit behind")
    }

    func testNoPathIsAnInvitationToSetAGoal() {
        let card = PathGoalCard.lines(for: nil)
        XCTAssertFalse(card.hasGoal)
        XCTAssertEqual(card.headline, "Set a goal")
        XCTAssertEqual(card.detail, "Pick a level and a date and we work out the lessons a week.")
    }
}
