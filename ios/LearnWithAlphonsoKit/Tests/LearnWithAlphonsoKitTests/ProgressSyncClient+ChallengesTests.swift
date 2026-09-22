import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientChallengesTests: XCTestCase {
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

    // MARK: - Challenges

    func testGetWeeklyChallengesDecodesRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [
                ["template_id": "lessons_5", "title": "On a roll", "description": "Complete 5 lessons this week", "progress": 3, "threshold": 5, "completed": false],
            ])
        }
        let challenges = try await client.getWeeklyChallenges()
        XCTAssertEqual(challenges, [WeeklyChallenge(templateID: "lessons_5", title: "On a roll", description: "Complete 5 lessons this week", progress: 3, threshold: 5, completed: false)])
    }

    func testJoinOpenDuelQueueReturnsWaitingWhenNoMatch() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["matched": false, "duel_id": NSNull()]])
        }
        let result = try await client.joinOpenDuelQueue(course: "en", matchByLevel: true)
        XCTAssertFalse(result.matched)
        XCTAssertNil(result.duelID)
    }

    func testJoinOpenDuelQueueReturnsMatchedDuelID() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["matched": true, "duel_id": "d1"]])
        }
        let result = try await client.joinOpenDuelQueue(course: "en", matchByLevel: false)
        XCTAssertTrue(result.matched)
        XCTAssertEqual(result.duelID, "d1")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/join_open_duel_queue"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_course"] as? String, "en")
        XCTAssertEqual(body["_match_by_level"] as? Bool, false)
    }

    func testLeaveOpenDuelQueuePostsToTheRpc() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }
        try await client.leaveOpenDuelQueue()
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/leave_duel_queue"))
    }
}
