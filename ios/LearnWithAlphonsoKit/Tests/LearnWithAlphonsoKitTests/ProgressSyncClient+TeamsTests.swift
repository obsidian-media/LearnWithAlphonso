import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientTeamsTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    // MARK: - Teams

    func testGetTeamLeaderboardDecodesRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["team_id": "t1", "name": "Swift Falcons", "weekly_xp": 420]])
        }
        let rows = try await client.getTeamLeaderboard()
        XCTAssertEqual(rows, [TeamLeaderboardRow(teamID: "t1", name: "Swift Falcons", weeklyXP: 420)])
    }

    func testGetMyTeamReturnsNilWhenNotOnATeam() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [])
        }
        let team = try await client.getMyTeam()
        XCTAssertNil(team)
    }

    func testGetMyTeamDecodesAllFields() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "team_id": "t1", "name": "Swift Falcons", "join_code": "ABC123",
                "joined_at": "2026-09-01T00:00:00Z", "switch_locked_until": "2026-09-08T00:00:00Z",
                "this_week_xp": 420,
            ]])
        }
        let team = try await client.getMyTeam()
        XCTAssertEqual(team?.teamID, "t1")
        XCTAssertEqual(team?.thisWeekXP, 420)
    }

    func testJoinTeamByCodePostsTheCodeAndReturnsTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t1"]])
        }
        let result = try await client.joinTeamByCode("ABC123")
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t1")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/join_team"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_code"] as? String, "ABC123")
    }

    func testAutoJoinTeamPostsToTheRpc() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t2"]])
        }
        let result = try await client.autoJoinTeam()
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t2")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/auto_join_team"))
    }

    func testCreateTeamPostsNameAndVisibilityAndReturnsTheJoinCode() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t9", "join_code": "XYZ999"]])
        }
        let result = try await client.createTeam(name: "Night Owls", visibility: "private")
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t9")
        XCTAssertEqual(result.joinCode, "XYZ999")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/create_team"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_name"] as? String, "Night Owls")
        XCTAssertEqual(body["_visibility"] as? String, "private")
    }

    func testCreateTeamDefaultsVisibilityToPublic() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t9", "join_code": "AAA111"]])
        }
        _ = try await client.createTeam(name: "Night Owls")
        let request = try XCTUnwrap(captured)
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_visibility"] as? String, "public")
    }

    func testCreateTeamSurfacesASwitchLockedRejectionAsAFalseOkNotAThrow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "reason": "switch-locked", "team_id": NSNull(), "join_code": NSNull()]])
        }
        let result = try await client.createTeam(name: "Night Owls", visibility: "public")
        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.reason, "switch-locked")
    }

    func testLeaveTeamSurfacesASwitchLockedRejectionAsAFalseOkNotAThrow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "reason": "switch-locked"]])
        }
        let result = try await client.leaveTeam()
        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.reason, "switch-locked")
    }
}
