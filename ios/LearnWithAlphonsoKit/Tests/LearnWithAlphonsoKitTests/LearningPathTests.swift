import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Decodes the SAME fixtures the web tests pin (Tests/.../Fixtures/learning-path.fixtures.json is a byte-for-byte
/// copy, guarded by src/lib/learning-path-native-fixtures.test.ts), so a server-side rename or retype fails here too.
/// The values asserted are the ones src/lib/path-plan.ts produced for these learners.
final class LearningPathTests: XCTestCase {
    private func scenario(_ key: String) throws -> Data {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "learning-path.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let all = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let path = try XCTUnwrap(all[key])
        return try JSONSerialization.data(withJSONObject: ["path": path])
    }

    private func path(_ key: String) throws -> LearningPath {
        try XCTUnwrap(try LearningPathDecoding.path(from: try scenario(key)))
    }

    func testEveryCheckedInScenarioDecodes() throws {
        for key in ["onTrack", "behind", "behindTrimmed"] {
            XCTAssertNoThrow(try LearningPathDecoding.path(from: try scenario(key)), key)
        }
    }

    func testTheBehindPathCarriesTheThreeWaysForward() throws {
        let p = try path("behind")
        XCTAssertEqual(p.status, "behind")
        XCTAssertEqual(p.statusLine, "A bit behind")
        XCTAssertEqual(p.recovery.map(\.id), ["lessons_first", "move_date", "add_minutes"])
        XCTAssertEqual(p.recovery.first?.suggested, true)
        XCTAssertNotNil(p.recovery.first?.mix)
        XCTAssertEqual(p.recovery.last?.dailyMinutes, 15)
    }

    func testTheTrimmedPathKeepsTheSwitchesAndTheTrimDate() throws {
        let p = try path("behindTrimmed")
        XCTAssertTrue(p.trimmed)
        XCTAssertEqual(p.off, ["talk"])
        XCTAssertNotNil(p.trimUntil)
        XCTAssertEqual(p.mix.first { $0.kind == .talk }?.minutes, 0)
    }

    func testTheRoadEndsAtTheGoalFlagAndHasOneCurrentStop() throws {
        let p = try path("onTrack")
        XCTAssertEqual(p.road.last?.kind, "goal")
        XCTAssertEqual(p.road.filter { $0.state == "current" }.count, 1)
    }

    func testTheWeekHasSevenDaysWithOneRestDay() throws {
        let p = try path("onTrack")
        XCTAssertEqual(p.week.count, 7)
        XCTAssertEqual(p.week.filter { $0.state == "rest" }.count, 1)
    }

    func testTheMixAddsUpToTheWeeksMinutes() throws {
        let p = try path("onTrack")
        XCTAssertEqual(p.mix.map(\.minutes).reduce(0, +), p.weekMinutes)
    }

    func testEveryTypeHasAStreakTile() throws {
        let p = try path("onTrack")
        XCTAssertEqual(p.streaks.map(\.kind), [.lesson, .podcast, .talk, .campaign])
    }

    func testAnUnknownTypeFromANewerServerIsDrawnGenerically() {
        XCTAssertEqual(PathKind(raw: "video"), .unknown)
        XCTAssertEqual(PathKind(raw: "podcast"), .podcast)
    }

    func testNoGoalDecodesAsNil() throws {
        let none = try JSONSerialization.data(withJSONObject: ["path": NSNull()])
        XCTAssertNil(try LearningPathDecoding.path(from: none))
    }

    func testAPathMissingAPartIsUnavailableNotHalfRead() throws {
        let broken = try JSONSerialization.data(withJSONObject: ["path": ["status": "behind"]])
        XCTAssertThrowsError(try LearningPathDecoding.path(from: broken)) {
            XCTAssertEqual($0 as? LearningPathError, .unavailable)
        }
    }

    func testChangesSerialiseToTheServersActions() async throws {
        final class Box: @unchecked Sendable { var body: [String: Any] = [:]; var method = "" }
        let box = Box()
        let ok = try scenario("onTrack")
        let client = LearningPathClient(
            baseURL: URL(string: "https://example.test")!,
            accessToken: { "t" },
            requester: { request in
                box.method = request.httpMethod ?? ""
                box.body = (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]) ?? [:]
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
                return (ok, response)
            })
        _ = try await client.change(course: "en", .setOff([.podcast, .talk]))
        XCTAssertEqual(box.method, "PUT")
        XCTAssertEqual(box.body["action"] as? String, "set_off")
        XCTAssertEqual(box.body["off"] as? [String], ["podcast", "talk"])
        XCTAssertEqual(box.body["course"] as? String, "en")
        _ = try await client.change(course: "en", .setDailyMinutes(15))
        XCTAssertEqual(box.body["dailyMinutes"] as? Int, 15)
    }
}
