import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientSocialSafetyTests: XCTestCase {
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

    // MARK: - blockUser

    func testBlockUserPostsToTheRpcAndReturnsTheResult() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "message": "blocked"]])
        }

        let result = try await client.blockUser("target-1")

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.message, "blocked")
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/block_user"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_target"] as? String, "target-1")
    }

    func testBlockUserSurfacesAServerError() async {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["message": "cannot block yourself"], status: 400)
        }
        do {
            _ = try await client.blockUser("me")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "cannot block yourself"))
        }
    }

    // MARK: - unblockUser

    func testUnblockUserSendsADeleteScopedToTheBlockedID() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }

        try await client.unblockUser("target-1")

        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/blocked_users"))
        XCTAssertTrue(request.url!.absoluteString.contains("blocked=eq.target-1"))
    }

    // MARK: - reportUser

    func testReportUserPostsTheReportedIDAndReason() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }

        try await client.reportUser("target-1", reason: "harassment")

        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/content_reports"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "return=minimal")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["reported"] as? String, "target-1")
        XCTAssertEqual(body["reason"] as? String, "harassment")
        XCTAssertNil(body["reporter"])
    }

    func testReportUserSurfacesAServerError() async {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["message": "invalid reason"], status: 400)
        }
        do {
            try await client.reportUser("target-1", reason: "")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "invalid reason"))
        }
    }

    // MARK: - reportTeamName (2026-09-29 pre-submission audit)

    func testReportTeamNameFilesAReportAgainstTheTeamsCreatorTaggedWithTheTeam() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let client = makeClient { request in
            captured.value.append(request)
            if request.httpMethod == "GET" {
                return self.jsonResponse(for: request.url!, body: [["created_by": "creator-1"]])
            }
            return self.jsonResponse(for: request.url!, body: [], status: 201)
        }

        let filed = try await client.reportTeamName(teamID: "team-9", reason: "harassment")

        XCTAssertTrue(filed)
        let lookup = try XCTUnwrap(captured.value.first)
        XCTAssertTrue(lookup.url!.absoluteString.contains("/rest/v1/teams"))
        XCTAssertTrue(lookup.url!.query!.contains("id=eq.team-9"))
        let insert = try XCTUnwrap(captured.value.last)
        XCTAssertEqual(insert.httpMethod, "POST")
        XCTAssertTrue(insert.url!.absoluteString.hasSuffix("/rest/v1/content_reports"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(insert.httpBody)) as! [String: Any]
        XCTAssertEqual(body["reported"] as? String, "creator-1")
        XCTAssertEqual(body["reason"] as? String, "team_name:team-9:harassment")
    }

    func testReportTeamNameFilesNothingWhenTheTeamHasNoCreator() async throws {
        // Auto-created teams get a system-generated name and no creator:
        // there is no person to report and nothing user-written to review.
        let captured = TestCapture<[URLRequest]>([])
        let client = makeClient { request in
            captured.value.append(request)
            return self.jsonResponse(for: request.url!, body: [["created_by": NSNull()]])
        }

        let filed = try await client.reportTeamName(teamID: "team-9", reason: "spam")

        XCTAssertFalse(filed)
        XCTAssertEqual(captured.value.count, 1)
    }
}
