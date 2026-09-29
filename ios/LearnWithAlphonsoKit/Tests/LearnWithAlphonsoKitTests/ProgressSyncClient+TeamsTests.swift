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

    // 2026-09-30 whole-codebase audit: real PostgREST timestamptz
    // responses carry fractional-second precision (this fixture matches
    // that, not the clean "...:00Z" shape earlier fixtures used, which
    // could never have caught this) -- getMyTeam parsed those with plain
    // ISO8601DateFormatter() until this fix, which fails to parse
    // fractional seconds and collapsed the whole function to nil for
    // every real response, not just this fixture's.
    func testGetMyTeamDecodesAllFields() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "team_id": "t1", "name": "Swift Falcons", "join_code": "ABC123",
                "joined_at": "2026-09-01T00:00:00.123456+00:00", "switch_locked_until": "2026-09-08T00:00:00.123456+00:00",
                "this_week_xp": 420,
            ]])
        }
        let team = try await client.getMyTeam()
        XCTAssertEqual(team?.teamID, "t1")
        XCTAssertEqual(team?.thisWeekXP, 420)
        // is_owner absent from the fixture -- must default to false, not throw.
        XCTAssertEqual(team?.isOwner, false)
    }

    // TestFlight feedback (2026-09-29): "Does the team owner have any
    // authority?" -- is_owner lets the client show owner-only controls.
    func testGetMyTeamDecodesIsOwnerTrue() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "team_id": "t1", "name": "Swift Falcons", "join_code": "ABC123",
                "joined_at": "2026-09-01T00:00:00Z", "switch_locked_until": "2026-09-08T00:00:00Z",
                "this_week_xp": 420, "is_owner": true,
            ]])
        }
        let team = try await client.getMyTeam()
        XCTAssertEqual(team?.isOwner, true)
    }

    // MARK: - Team members / kick

    // 2026-09-30 whole-codebase audit: same fractional-second-precision
    // fixture reasoning as testGetMyTeamDecodesAllFields above --
    // getTeamMembers silently dropped every row via compactMap before
    // this fix, since a real response's joined_at could never parse.
    func testGetTeamMembersDecodesRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [
                [
                    "user_id": "u1", "display_name": "Ada", "avatar_seed": "seed-a",
                    "joined_at": "2026-09-01T00:00:00.123456+00:00", "is_owner": true,
                ],
                [
                    "user_id": "u2", "display_name": "Grace", "avatar_seed": "seed-g",
                    "joined_at": "2026-09-05T00:00:00.123456+00:00", "is_owner": false,
                ],
            ])
        }
        let members = try await client.getTeamMembers()
        XCTAssertEqual(members.count, 2)
        XCTAssertEqual(members[0].displayName, "Ada")
        XCTAssertEqual(members[0].isOwner, true)
        XCTAssertEqual(members[1].displayName, "Grace")
        XCTAssertEqual(members[1].isOwner, false)
    }

    func testKickTeamMemberPostsTheUserIdAndReturnsTheResult() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull()]])
        }
        let result = try await client.kickTeamMember(userID: "u2")
        XCTAssertTrue(result.ok)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/kick_team_member"))
        let body = try XCTUnwrap(request.httpBody)
        let object = try JSONSerialization.jsonObject(with: body) as? [String: String]
        XCTAssertEqual(object?["_user_id"], "u2")
    }

    func testKickTeamMemberSurfacesAFailureReason() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "reason": "not-team-owner"]])
        }
        let result = try await client.kickTeamMember(userID: "u2")
        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.reason, "not-team-owner")
    }

    func testJoinTeamByCodePostsTheCodeAndReturnsTheResult() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t1"]])
        }
        let result = try await client.joinTeamByCode("ABC123")
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t1")
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/join_team"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_code"] as? String, "ABC123")
    }

    func testAutoJoinTeamPostsToTheRpc() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t2"]])
        }
        let result = try await client.autoJoinTeam()
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t2")
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/auto_join_team"))
    }

    func testCreateTeamPostsNameAndVisibilityAndReturnsTheJoinCode() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t9", "join_code": "XYZ999"]])
        }
        let result = try await client.createTeam(name: "Night Owls", visibility: "private")
        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.teamID, "t9")
        XCTAssertEqual(result.joinCode, "XYZ999")
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/create_team"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_name"] as? String, "Night Owls")
        XCTAssertEqual(body["_visibility"] as? String, "private")
    }

    func testCreateTeamDefaultsVisibilityToPublic() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "team_id": "t9", "join_code": "AAA111"]])
        }
        _ = try await client.createTeam(name: "Night Owls")
        let request = try XCTUnwrap(captured.value)
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
