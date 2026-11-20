import XCTest
@testable import LearnWithAlphonsoKit

/// Replays shared/learn-map.json, which src/lib/learn-map.test.ts and the Android core's LearnMapTest replay too. If
/// only this fails, the Kit port drifted from the others.
final class LearnMapTests: XCTestCase {
    private typealias JSON = [String: Any]

    private func repoFile(_ relative: String) throws -> Data {
        // Tests/LearnWithAlphonsoKitTests/<this file> -> the repository root is five levels up.
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return try Data(contentsOf: url.appendingPathComponent(relative))
    }

    private func load() throws -> JSON {
        try XCTUnwrap(JSONSerialization.jsonObject(with: repoFile("shared/learn-map.json")) as? JSON)
    }

    private func loadTiming(_ root: JSON) throws -> LessonTiming {
        let data = try JSONSerialization.data(withJSONObject: try XCTUnwrap(root["timing"]))
        return try JSONDecoder().decode(LessonTiming.self, from: data)
    }

    private func loadUnits(_ root: JSON) throws -> [LearnMap.Unit] {
        try units(from: try XCTUnwrap(root["units"] as? [JSON]))
    }

    private func units(from json: [JSON]) throws -> [LearnMap.Unit] {
        try json.map { u in
            LearnMap.Unit(
                id: try XCTUnwrap(u["id"] as? String),
                title: try XCTUnwrap(u["title"] as? String),
                lessons: try XCTUnwrap(u["lessons"] as? [JSON]).map { l in
                    LearnMap.Lesson(
                        id: try XCTUnwrap(l["id"] as? String),
                        title: try XCTUnwrap(l["title"] as? String),
                        subtitle: try XCTUnwrap(l["subtitle"] as? String),
                        questionTypes: try XCTUnwrap(l["questionTypes"] as? [String]),
                        wordCount: try XCTUnwrap(l["wordCount"] as? Int)
                    )
                }
            )
        }
    }

    private func number(_ any: Any?) throws -> Double { try XCTUnwrap((any as? NSNumber)?.doubleValue) }

    private func assertNear(_ expected: Double, _ actual: Double, _ label: String) {
        XCTAssertEqual(expected, actual, accuracy: 1e-9, label)
    }

    private func check(_ expect: JSON, _ climb: LearnMap.Climb, _ name: String) throws {
        XCTAssertEqual(climb.unitID, expect["unitId"] as? String, name)
        let strip = try XCTUnwrap(expect["strip"] as? JSON)
        XCTAssertEqual(climb.strip.number, strip["number"] as? Int, "\(name) strip number")
        XCTAssertEqual(climb.strip.count, strip["count"] as? Int, "\(name) strip count")
        XCTAssertEqual(climb.strip.name, strip["name"] as? String, "\(name) strip name")
        XCTAssertEqual(climb.strip.done, strip["done"] as? Int, "\(name) strip done")
        XCTAssertEqual(climb.strip.total, strip["total"] as? Int, "\(name) strip total")
        assertNear(try number(strip["progress"]), climb.strip.progress, "\(name) strip progress")

        let nodes = try XCTUnwrap(expect["nodes"] as? [JSON])
        XCTAssertEqual(
            climb.nodes.map { "\($0.id):\($0.title):\($0.state.rawValue)" },
            nodes.map { "\($0["id"] as? String ?? ""):\($0["title"] as? String ?? ""):\($0["state"] as? String ?? "")" },
            "\(name) nodes"
        )
        for (e, n) in zip(nodes, climb.nodes) {
            assertNear(try number(e["x"]), n.point.x, "\(name) \(n.id) x")
            assertNear(try number(e["y"]), n.point.y, "\(name) \(n.id) y")
        }

        let chest = try XCTUnwrap(expect["chest"] as? JSON)
        XCTAssertEqual(climb.chest.earned, chest["earned"] as? Bool, "\(name) chest earned")
        assertNear(try number(chest["x"]), climb.chest.point.x, "\(name) chest x")
        assertNear(try number(chest["y"]), climb.chest.point.y, "\(name) chest y")

        let trailhead = try XCTUnwrap(expect["trailhead"] as? JSON)
        let expectedTrailhead: LearnMap.Trailhead = trailhead["kind"] as? String == "chest"
            ? .earnedChest(unitID: try XCTUnwrap(trailhead["unitId"] as? String))
            : .start
        XCTAssertEqual(climb.trailhead, expectedTrailhead, "\(name) trailhead")

        if let n = expect["next"] as? JSON {
            let sheet = try XCTUnwrap(climb.next, "\(name) start sheet")
            XCTAssertEqual(sheet.lessonID, n["lessonId"] as? String, name)
            XCTAssertEqual(sheet.title, n["title"] as? String, name)
            XCTAssertEqual(sheet.coverage, n["coverage"] as? String, name)
            XCTAssertEqual(sheet.minutes, n["minutes"] as? Int, "\(name) minutes")
            XCTAssertEqual(sheet.xp, n["xp"] as? Int, "\(name) xp")
            XCTAssertEqual(sheet.words, n["words"] as? Int, "\(name) words")
        } else {
            XCTAssertNil(climb.next, "\(name) next")
        }
    }

    func testEveryCaseMatchesTheSharedFixture() throws {
        let root = try load()
        let units = try loadUnits(root)
        let timing = try loadTiming(root)
        let cases = try XCTUnwrap(root["cases"] as? [JSON])
        XCTAssertGreaterThanOrEqual(cases.count, 8)
        for c in cases {
            let name = try XCTUnwrap(c["name"] as? String)
            let completed = Set(try XCTUnwrap(c["completed"] as? [String]))
            let caseUnits = try (c["units"] as? [JSON]).map { try self.units(from: $0) } ?? units
            let climb = LearnMap.climb(units: caseUnits, completed: completed, timing: timing, unitID: c["unitId"] as? String)
            if let expect = c["expect"] as? JSON {
                try check(expect, try XCTUnwrap(climb, name), name)
            } else {
                XCTAssertNil(climb, name)
            }
        }
    }

    func testALevelWithNoUnitsGivesNoMap() throws {
        XCTAssertNil(LearnMap.climb(units: [], completed: [], timing: try loadTiming(try load())))
    }

    func testEveryLayoutPointMatchesTheSharedFixture() throws {
        for p in try XCTUnwrap(try load()["points"] as? [JSON]) {
            let index = try XCTUnwrap(p["index"] as? Int)
            let slots = try XCTUnwrap(p["slots"] as? Int)
            let at = LearnMap.point(index: index, slots: slots)
            assertNear(try number(p["x"]), at.x, "slot \(index) of \(slots) x")
            assertNear(try number(p["y"]), at.y, "slot \(index) of \(slots) y")
        }
    }

    func testTheFixtureTimingIsTheBundledOne() throws {
        let fixture = try loadTiming(try load())
        let bundled = try LessonTiming.bundled()
        XCTAssertEqual(fixture.secondsPerQuestion, bundled.secondsPerQuestion)
        XCTAssertEqual(fixture.secondsPerNewWord, bundled.secondsPerNewWord)
    }

    func testTheClimbAlwaysRisesAndTheChestSitsExactlyAtTheSummit() {
        for slots in [2, 4, 6, 12] {
            let ys = (0..<slots).map { LearnMap.point(index: $0, slots: slots).y }
            for i in 1..<ys.count { XCTAssertLessThan(ys[i], ys[i - 1], "slots \(slots)") }
            XCTAssertEqual(LearnMap.point(index: slots - 1, slots: slots), LearnMap.Point(x: 0.5, y: 0.06))
        }
    }
}
