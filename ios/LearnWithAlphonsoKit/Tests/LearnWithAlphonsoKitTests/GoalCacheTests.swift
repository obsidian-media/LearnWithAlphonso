import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class GoalCacheTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let suite = "GoalCacheTests-" + UUID().uuidString
        let d = UserDefaults(suiteName: suite)!
        d.removePersistentDomain(forName: suite)
        return d
    }

    private func fixtureState() throws -> LearningGoalState {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "learning-goal.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let stored = try XCTUnwrap((root["envelopes"] as? [String: Any])?["stored"])
        return try LearningGoalDecoding.state(from: try JSONSerialization.data(withJSONObject: stored))
    }

    func testRoundTripsAStateExactly() throws {
        let cache = GoalCache(defaults: defaults())
        let state = try fixtureState()
        cache.write(state, userID: "u1", course: "en")
        XCTAssertEqual(cache.read(userID: "u1", course: "en"), state)
    }

    func testEveryStatusSurvivesTheRoundTrip() throws {
        let cache = GoalCache(defaults: defaults())
        let base = try XCTUnwrap(try fixtureState().plan)
        let goal = try XCTUnwrap(try fixtureState().goal)
        let statuses: [GoalStatus] = [.done, .expired, .justStarted, .ahead, .onTrack, .behind, .unknown]
        let realisms: [GoalRealism] = [.ok, .ambitious, .unrealistic, .unknown]
        for (i, status) in statuses.enumerated() {
            let plan = GoalPlan(
                currentLevel: base.currentLevel, targetLevel: base.targetLevel, targetDate: base.targetDate,
                lessonsInScope: base.lessonsInScope, lessonsRemaining: base.lessonsRemaining,
                lessonsDoneLast7Days: base.lessonsDoneLast7Days, requiredPerWeek: base.requiredPerWeek,
                status: status, realism: realisms[i % realisms.count], suggestedDate: i % 2 == 0 ? "2026-11-10" : nil,
                asOf: base.asOf)
            let state = LearningGoalState(goal: goal, plan: plan)
            cache.write(state, userID: "u1", course: "en")
            XCTAssertEqual(cache.read(userID: "u1", course: "en"), state, "\(status)")
        }
    }

    func testAnotherUserOrCourseReadsNothing() throws {
        let cache = GoalCache(defaults: defaults())
        cache.write(try fixtureState(), userID: "u1", course: "en")
        XCTAssertNil(cache.read(userID: "u2", course: "en"))
        XCTAssertNil(cache.read(userID: "u1", course: "fr"))
    }

    func testClearRemovesIt() throws {
        let cache = GoalCache(defaults: defaults())
        cache.write(try fixtureState(), userID: "u1", course: "en")
        cache.clear(userID: "u1", course: "en")
        XCTAssertNil(cache.read(userID: "u1", course: "en"))
    }

    func testCorruptDataReadsAsNothing() {
        let d = defaults()
        d.set(Data("{not json".utf8), forKey: GoalCache.key(userID: "u1", course: "en"))
        XCTAssertNil(GoalCache(defaults: d).read(userID: "u1", course: "en"))
    }

    func testAStateWithoutAPlanOrGoalIsNotCached() throws {
        let cache = GoalCache(defaults: defaults())
        let full = try fixtureState()
        cache.write(LearningGoalState(goal: full.goal, plan: nil), userID: "u1", course: "en")
        XCTAssertNil(cache.read(userID: "u1", course: "en"))
        cache.write(LearningGoalState(goal: nil, plan: nil), userID: "u1", course: "en")
        XCTAssertNil(cache.read(userID: "u1", course: "en"))
    }

    func testWritingAnUncachableStateClearsTheOldEntry() throws {
        let cache = GoalCache(defaults: defaults())
        cache.write(try fixtureState(), userID: "u1", course: "en")
        cache.write(LearningGoalState(goal: nil, plan: nil), userID: "u1", course: "en")
        XCTAssertNil(cache.read(userID: "u1", course: "en"))
    }

    func testAnEntryWithAGoalButNoPlanReadsAsNothing() throws {
        // e.g. written by some other version: the cache must still refuse to show half a state.
        let d = defaults()
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "learning-goal.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let planNull = try XCTUnwrap((root["envelopes"] as? [String: Any])?["stored_plan_null"])
        d.set(try JSONSerialization.data(withJSONObject: planNull), forKey: GoalCache.key(userID: "u1", course: "en"))
        XCTAssertNil(GoalCache(defaults: d).read(userID: "u1", course: "en"))
    }

    func testTheKeyIncludesTheUser() {
        XCTAssertNotEqual(GoalCache.key(userID: "a", course: "en"), GoalCache.key(userID: "b", course: "en"))
        XCTAssertTrue(GoalCache.key(userID: "a", course: "en").contains("a"))
    }
}
