import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Decodes the SAME fixtures the web tests pin (Tests/.../Fixtures/learning-goal.fixtures.json is a
/// byte-for-byte copy, guarded by src/lib/learning-goal-ios-fixtures.test.ts), so a server-side
/// rename or retype fails here too.
final class LearningGoalTests: XCTestCase {
    private func fixtures() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "learning-goal.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func data(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object)
    }

    private func samples(_ key: String) throws -> [String: Any] {
        try XCTUnwrap(try fixtures()[key] as? [String: Any])
    }

    private func plan(_ key: String) throws -> [String: Any] {
        try XCTUnwrap(try samples("plans")[key] as? [String: Any])
    }

    private func envelope(_ key: String) throws -> [String: Any] {
        try XCTUnwrap(try samples("envelopes")[key] as? [String: Any])
    }

    func testEveryCheckedInPlanDecodes() throws {
        for (name, plan) in try samples("plans") {
            let envelope = try data(["plan": plan])
            XCTAssertNoThrow(try LearningGoalDecoding.plan(fromPreview: envelope), name)
        }
    }

    func testStatusAndRealismRawValuesMapToTheEnums() throws {
        let plans = try samples("plans")
        func decode(_ key: String) throws -> GoalPlan {
            try LearningGoalDecoding.plan(fromPreview: try data(["plan": try XCTUnwrap(plans[key])]))
        }
        XCTAssertEqual(try decode("done").status, .done)
        XCTAssertEqual(try decode("just_started").status, .justStarted)
        XCTAssertEqual(try decode("on_track").status, .onTrack)
        XCTAssertEqual(try decode("ahead").status, .ahead)
        XCTAssertEqual(try decode("behind_with_suggestion").status, .behind)
        XCTAssertEqual(try decode("expired").status, .expired)
        XCTAssertEqual(try decode("unrealistic").realism, .unrealistic)
        XCTAssertEqual(try decode("just_started").realism, .ambitious)
        XCTAssertEqual(try decode("on_track").realism, .ok)
    }

    func testAPlanKeepsItsNumbersAndSuggestedDate() throws {
        let plans = try samples("plans")
        let plan = try LearningGoalDecoding.plan(
            fromPreview: try data(["plan": try XCTUnwrap(plans["behind_with_suggestion"])]))
        XCTAssertEqual(plan.requiredPerWeek, 13)
        XCTAssertEqual(plan.lessonsDoneLast7Days, 5)
        XCTAssertEqual(plan.suggestedDate, "2026-11-10")
        XCTAssertNil(try LearningGoalDecoding.plan(
            fromPreview: try data(["plan": try XCTUnwrap(plans["on_track"])])).suggestedDate)
    }

    func testEveryEnvelopeDecodes() throws {
        let envelopes = try samples("envelopes")
        let stored = try LearningGoalDecoding.state(from: try data(try XCTUnwrap(envelopes["stored"])))
        XCTAssertEqual(stored.goal?.targetLevel, "B1")
        XCTAssertNotNil(stored.plan)

        let planNull = try LearningGoalDecoding.state(
            from: try data(try XCTUnwrap(envelopes["stored_plan_null"])))
        XCTAssertNotNil(planNull.goal)
        XCTAssertNil(planNull.plan)

        let none = try LearningGoalDecoding.state(from: try data(try XCTUnwrap(envelopes["none"])))
        XCTAssertNil(none.goal)
        XCTAssertNil(none.plan)

        XCTAssertNoThrow(try LearningGoalDecoding.plan(fromPreview: try data(try XCTUnwrap(envelopes["preview"]))))
    }

    func testAnUnknownStatusOrRealismDecodesToUnknownInsteadOfFailing() throws {
        var plan = try plan("on_track")
        plan["status"] = "paused_by_a_future_server"
        plan["realism"] = "heroic"
        let decoded = try LearningGoalDecoding.plan(fromPreview: try data(["plan": plan]))
        XCTAssertEqual(decoded.status, .unknown)
        XCTAssertEqual(decoded.realism, .unknown)
    }

    func testAMissingOrMistypedRequiredFieldIsUnavailable() throws {
        let good = try plan("on_track")
        var missing = good
        missing.removeValue(forKey: "requiredPerWeek")
        var wrongType = good
        wrongType["lessonsRemaining"] = "twenty"
        var noStatus = good
        noStatus.removeValue(forKey: "status")
        for (name, plan) in [("missing", missing), ("wrongType", wrongType), ("noStatus", noStatus)] {
            XCTAssertThrowsError(try LearningGoalDecoding.plan(fromPreview: try data(["plan": plan])), name) {
                XCTAssertEqual($0 as? LearningGoalError, .unavailable, name)
            }
        }
    }

    func testAPlanThatIsNotAnObjectIsUnavailable() throws {
        let goal = try envelope("stored")["goal"]
        XCTAssertThrowsError(try LearningGoalDecoding.state(from: try data(["goal": goal as Any, "plan": "oops"]))) {
            XCTAssertEqual($0 as? LearningGoalError, .unavailable)
        }
        XCTAssertThrowsError(try LearningGoalDecoding.plan(fromPreview: try data(["nope": 1]))) {
            XCTAssertEqual($0 as? LearningGoalError, .unavailable)
        }
        XCTAssertThrowsError(try LearningGoalDecoding.state(from: Data("<html>".utf8))) {
            XCTAssertEqual($0 as? LearningGoalError, .unavailable)
        }
    }

    func testAGoalMissingAFieldIsUnavailableButAnyCreatedAtStringDecodes() throws {
        let stored = try envelope("stored")
        var goal = try XCTUnwrap(stored["goal"] as? [String: Any])
        // Microseconds and +00:00 (a server regression) must still decode: createdAt is a plain string.
        goal["createdAt"] = "2026-09-06T12:00:00.123456+00:00"
        let ok = try LearningGoalDecoding.state(from: try data(["goal": goal, "plan": stored["plan"] as Any]))
        XCTAssertEqual(ok.goal?.createdAt, "2026-09-06T12:00:00.123456+00:00")

        goal.removeValue(forKey: "targetDate")
        XCTAssertThrowsError(try LearningGoalDecoding.state(from: try data(["goal": goal, "plan": NSNull()]))) {
            XCTAssertEqual($0 as? LearningGoalError, .unavailable)
        }
    }

    func testUserMessagesMatchTheWebCard() {
        XCTAssertEqual(LearningGoalError.invalid(nil).userMessage, "That goal can't be saved. Check the level and date.")
        XCTAssertEqual(LearningGoalError.invalid("That level is below yours").userMessage, "That level is below yours")
        XCTAssertEqual(LearningGoalError.notSignedIn.userMessage, "Sign in again to use goals.")
        XCTAssertEqual(LearningGoalError.unavailable.userMessage, "Couldn't load your goal. Try again.")
        XCTAssertEqual(LearningGoalError.offline.userMessage, "You're offline. Showing your last saved plan.")
    }
}
