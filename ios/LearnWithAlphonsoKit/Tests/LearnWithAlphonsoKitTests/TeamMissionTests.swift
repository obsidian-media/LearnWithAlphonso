import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Decodes the SAME fixtures the web tests pin (Tests/.../Fixtures/team-mission.fixtures.json is a
/// byte-for-byte copy, guarded by src/lib/team-mission-ios-fixtures.test.ts), so a rename, a retype or a
/// wording change on the server or the web fails here too. The wording must match
/// src/lib/team-mission.ts; change both together.
final class TeamMissionTests: XCTestCase {
    private func fixtures() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "team-mission.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func date(_ iso: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return try XCTUnwrap(formatter.date(from: iso))
    }

    private func baseRow() -> [String: Any] {
        [
            "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 8, "total": 3,
            "my_count": 2, "member_count": 2, "status": "in_progress", "reward_xp": 50, "rewarded": false,
        ]
    }

    func testEveryFixtureCaseDecodesToTheWebViewModel() throws {
        let all = try fixtures()
        let defaultNow = try date(try XCTUnwrap(all["now"] as? String))
        let cases = try XCTUnwrap(all["cases"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(cases.count, 7)
        for c in cases {
            let name = try XCTUnwrap(c["name"] as? String)
            let now = try (c["now"] as? String).map(date) ?? defaultNow
            let row = try XCTUnwrap(c["row"] as? [String: Any])
            let expected = try XCTUnwrap(c["expected"] as? [String: Any])
            let mission = try XCTUnwrap(TeamMission(row: row, now: now), name)
            XCTAssertEqual(mission.teamID, expected["teamId"] as? String, name)
            XCTAssertEqual(mission.weekStart, expected["weekStart"] as? String, name)
            XCTAssertEqual(mission.weekEnd, expected["weekEnd"] as? String, name)
            XCTAssertEqual(mission.target, expected["target"] as? Int, name)
            XCTAssertEqual(mission.total, expected["total"] as? Int, name)
            XCTAssertEqual(mission.myCount, expected["myCount"] as? Int, name)
            XCTAssertEqual(mission.memberCount, expected["memberCount"] as? Int, name)
            XCTAssertEqual(mission.status.rawValue, expected["status"] as? String, name)
            XCTAssertEqual(mission.rewardXP, expected["rewardXp"] as? Int, name)
            XCTAssertEqual(mission.rewarded, expected["rewarded"] as? Bool, name)
            XCTAssertEqual(mission.daysLeft, expected["daysLeft"] as? Int, name)
            XCTAssertEqual(mission.percent, expected["percent"] as? Int, name)
            XCTAssertEqual(mission.headline, expected["headline"] as? String, name)
            XCTAssertEqual(mission.footer, expected["footer"] as? String, name)
        }
    }

    func testNeverReportsNegativeDaysLeft() throws {
        var row = baseRow()
        row["week_end"] = "2026-10-01"
        XCTAssertEqual(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z"))?.daysLeft, 0)
    }

    func testAnUnknownStatusFromANewerServerFallsBackToInProgress() throws {
        var row = baseRow()
        row["status"] = "weird"
        XCTAssertEqual(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z"))?.status, .inProgress)
    }

    func testAZeroTargetNeverDividesByZero() throws {
        var row = baseRow()
        row["target"] = 0
        XCTAssertEqual(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z"))?.percent, 0)
    }

    func testPercentRoundsDownSo99PointNineNeverReadsAsDone() throws {
        var row = baseRow()
        row["total"] = 799
        row["target"] = 800
        XCTAssertEqual(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z"))?.percent, 99)
    }

    func testARowMissingAFieldDoesNotDecode() throws {
        for key in ["team_id", "week_start", "week_end", "target", "total", "my_count", "member_count", "reward_xp", "rewarded"] {
            var row = baseRow()
            row.removeValue(forKey: key)
            XCTAssertNil(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z")), key)
        }
    }

    func testAWrongTypedFieldDoesNotDecode() throws {
        var row = baseRow()
        row["target"] = "8"
        XCTAssertNil(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z")))
    }

    func testAMissionThatIsNotParseableAsADateDoesNotDecode() throws {
        var row = baseRow()
        row["week_end"] = "soon"
        XCTAssertNil(TeamMission(row: row, now: try date("2026-10-07T12:00:00.000Z")))
    }
}

final class ProgressSyncClientTeamMissionTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(
            supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token",
            requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    private let row: [String: Any] = [
        "team_id": "t1", "week_start": "2026-10-05", "week_end": "2026-10-12", "target": 8, "total": 3,
        "my_count": 2, "member_count": 2, "status": "in_progress", "reward_xp": 50, "rewarded": false,
    ]

    func testPostsToTheRpcWithTheUsersTokenAndDecodesTheMission() async throws {
        let captured = Captured()
        let client = makeClient { request in
            captured.set(request)
            return self.jsonResponse(for: request.url!, body: [self.row])
        }
        let mission = try await client.getTeamMission(now: Date(timeIntervalSince1970: 1_791_374_400))
        let request = try XCTUnwrap(captured.request)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/rest/v1/rpc/get_team_mission")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(mission?.headline, "3 of 8 lessons done")
    }

    func testReturnsNilWhenTheCallerHasNoTeam() async throws {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: []) }
        let mission = try await client.getTeamMission()
        XCTAssertNil(mission)
    }

    func testAServerErrorThrowsInsteadOfLookingLikeNoTeam() async {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["message": "boom"], status: 500)
        }
        do {
            _ = try await client.getTeamMission()
            XCTFail("expected a throw")
        } catch let error as ProgressSyncError {
            XCTAssertEqual(error, .server(status: 500, message: "boom"))
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testAMalformedRowThrowsInvalidPayloadNotNoTeam() async {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["team_id": "t1"]])
        }
        do {
            _ = try await client.getTeamMission()
            XCTFail("expected a throw")
        } catch let error as ProgressSyncError {
            XCTAssertEqual(error, .invalidPayload)
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testANonArrayBodyThrowsInvalidPayload() async {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: ["not": "an array"]) }
        do {
            _ = try await client.getTeamMission()
            XCTFail("expected a throw")
        } catch let error as ProgressSyncError {
            XCTAssertEqual(error, .invalidPayload)
        } catch {
            XCTFail("unexpected \(error)")
        }
    }
}

/// A tiny thread-safe box so a `@Sendable` requester can hand the request back to the test.
private final class Captured: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: URLRequest?
    func set(_ request: URLRequest) { lock.lock(); stored = request; lock.unlock() }
    var request: URLRequest? { lock.lock(); defer { lock.unlock() }; return stored }
}
