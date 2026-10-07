import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Reads the SAME fixtures the web tests pin (Fixtures/buddy.fixtures.json is a byte-for-byte copy, guarded by
/// src/lib/buddy-native-fixtures.test.ts): the week rules, the server statuses' wording and the card wording must
/// be word-for-word src/lib/buddy.ts. Change both together.
final class BuddyTests: XCTestCase {
    private func fixtures() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "buddy.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    func testWeekRulesMatchEveryFixtureCase() throws {
        let cases = try XCTUnwrap(fixtures()["resolve"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(cases.count, 6)
        for c in cases {
            let name = try XCTUnwrap(c["name"] as? String)
            let state = try XCTUnwrap(c["state"] as? [String: Any])
            let counts = try XCTUnwrap(c["counts"] as? [String: Any])
            let expected = try XCTUnwrap(c["expected"] as? [String: Any])
            let result = BuddyRules.resolveWeek(
                streakWeeks: try XCTUnwrap(state["streakWeeks"] as? Int),
                graceAvailable: try XCTUnwrap(state["graceAvailable"] as? Bool),
                a: try XCTUnwrap(counts["a"] as? Int),
                b: try XCTUnwrap(counts["b"] as? Int),
                isFirstWeek: try XCTUnwrap(c["isFirstWeek"] as? Bool))
            XCTAssertEqual(result.outcome.rawValue, expected["outcome"] as? String, name)
            XCTAssertEqual(result.streakWeeks, expected["streakWeeks"] as? Int, name)
            XCTAssertEqual(result.graceAvailable, expected["graceAvailable"] as? Bool, name)
        }
        XCTAssertEqual(BuddyRules.goal, 3)
    }

    func testEveryServerStatusHasTheWebWording() throws {
        let messages = try XCTUnwrap(fixtures()["messages"] as? [String: String])
        XCTAssertGreaterThanOrEqual(messages.count, 14)
        for (status, text) in messages {
            XCTAssertEqual(BuddyCopy.statusMessage(status), text, status)
        }
        XCTAssertEqual(BuddyCopy.statusMessage("something_new"), messages["unknown"])
    }

    func testWeekLinesAndCardWording() throws {
        let all = try fixtures()
        for c in try XCTUnwrap(all["weekLines"] as? [[String: Any]]) {
            XCTAssertEqual(
                BuddyCopy.weekLine(
                    myCount: try XCTUnwrap(c["my"] as? Int), buddyCount: try XCTUnwrap(c["buddy"] as? Int),
                    goal: try XCTUnwrap(c["goal"] as? Int)),
                c["expected"] as? String)
        }
        let copy = try XCTUnwrap(all["copy"] as? [String: Any])
        XCTAssertEqual(BuddyCopy.intro, copy["intro"] as? String)
        XCTAssertEqual(BuddyCopy.loadFailed, copy["loadFailed"] as? String)
        for s in try XCTUnwrap(copy["streakLines"] as? [[String: Any]]) {
            XCTAssertEqual(BuddyCopy.streakLine(try XCTUnwrap(s["weeks"] as? Int)), s["expected"] as? String)
        }
        for g in try XCTUnwrap(copy["graceLines"] as? [[String: Any]]) {
            XCTAssertEqual(BuddyCopy.graceLine(try XCTUnwrap(g["available"] as? Bool)), g["expected"] as? String)
        }
        let incoming = try XCTUnwrap(copy["incoming"] as? [String: String])
        let outgoing = try XCTUnwrap(copy["outgoing"] as? [String: String])
        let endConfirm = try XCTUnwrap(copy["endConfirm"] as? [String: String])
        XCTAssertEqual(BuddyCopy.incomingLine(try XCTUnwrap(incoming["name"])), incoming["expected"])
        XCTAssertEqual(BuddyCopy.outgoingLine(try XCTUnwrap(outgoing["name"])), outgoing["expected"])
        XCTAssertEqual(BuddyCopy.endConfirm(try XCTUnwrap(endConfirm["name"])), endConfirm["expected"])
    }

    // MARK: - Decoding the RPC rows

    private func buddyRow() -> [String: Any] {
        [
            "pair_id": "p1", "buddy_id": "u2", "buddy_name": "Bo", "buddy_avatar_seed": "cd",
            "paired_at": "2026-10-01T00:00:00+00:00", "week_start": "2026-10-05", "my_count": 2, "buddy_count": 3,
            "goal": 3, "streak_weeks": 4, "grace_available": false, "last_outcome": "grace",
        ]
    }

    func testMyBuddyDecodesTheRow() throws {
        let buddy = try XCTUnwrap(MyBuddy(row: buddyRow()))
        XCTAssertEqual(buddy.pairID, "p1")
        XCTAssertEqual(buddy.buddyID, "u2")
        XCTAssertEqual(buddy.buddyName, "Bo")
        XCTAssertEqual(buddy.myCount, 2)
        XCTAssertEqual(buddy.buddyCount, 3)
        XCTAssertEqual(buddy.goal, 3)
        XCTAssertEqual(buddy.streakWeeks, 4)
        XCTAssertFalse(buddy.graceAvailable)
        XCTAssertEqual(buddy.lastOutcome, "grace")
    }

    func testMyBuddyAcceptsANullLastOutcome() throws {
        var row = buddyRow()
        row["last_outcome"] = NSNull()
        XCTAssertNil(try XCTUnwrap(MyBuddy(row: row)).lastOutcome)
    }

    func testMyBuddyRejectsARowWithAMissingOrMistypedField() {
        var missing = buddyRow()
        missing.removeValue(forKey: "streak_weeks")
        XCTAssertNil(MyBuddy(row: missing))
        var mistyped = buddyRow()
        mistyped["my_count"] = "2"
        XCTAssertNil(MyBuddy(row: mistyped))
    }

    func testBuddyRequestDecodesBothDirectionsAndRejectsAnUnknownOne() {
        let row: [String: Any] = [
            "request_id": "r1", "direction": "incoming", "other_id": "u2", "other_name": "Bo",
            "other_avatar_seed": "cd", "requested_at": "2026-10-06T00:00:00+00:00",
        ]
        let incoming = BuddyRequest(row: row)
        XCTAssertEqual(incoming?.id, "r1")
        XCTAssertEqual(incoming?.direction, .incoming)
        XCTAssertEqual(incoming?.otherName, "Bo")
        var outgoing = row
        outgoing["direction"] = "outgoing"
        XCTAssertEqual(BuddyRequest(row: outgoing)?.direction, .outgoing)
        var unknown = row
        unknown["direction"] = "sideways"
        XCTAssertNil(BuddyRequest(row: unknown))
    }
}
