import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientBuddyTests: XCTestCase {
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

    private func body(_ request: URLRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]) ?? [:]
    }

    func testGetMyBuddyReturnsNilWithoutABuddy() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/get_my_buddy")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
            return self.jsonResponse(for: request.url!, body: [] as [Any])
        }
        let buddy = try await client.getMyBuddy()
        XCTAssertNil(buddy)
    }

    func testGetMyBuddyDecodesTheRow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "pair_id": "p1", "buddy_id": "u2", "buddy_name": "Bo", "buddy_avatar_seed": "cd",
                "paired_at": "2026-10-01T00:00:00+00:00", "week_start": "2026-10-05", "my_count": 1,
                "buddy_count": 3, "goal": 3, "streak_weeks": 2, "grace_available": true, "last_outcome": NSNull(),
            ]])
        }
        let buddy = try await client.getMyBuddy()
        XCTAssertEqual(buddy?.buddyName, "Bo")
        XCTAssertEqual(buddy?.streakWeeks, 2)
    }

    func testGetMyBuddyThrowsOnAServerErrorInsteadOfLookingLikeNoBuddy() async {
        let client = makeClient { request in
            // A well-formed empty array: only the 500 can make this throw (an object body would throw for the wrong reason).
            self.jsonResponse(for: request.url!, body: [] as [Any], status: 500)
        }
        do {
            _ = try await client.getMyBuddy()
            XCTFail("a failed lookup must throw, not read as 'no buddy'")
        } catch {}
    }

    func testGetMyBuddyThrowsOnAMalformedRow() async {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["pair_id": "p1"]])
        }
        do {
            _ = try await client.getMyBuddy()
            XCTFail("a malformed row must throw")
        } catch {}
    }

    func testGetBuddyRequestsDecodesRows() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/get_buddy_requests")
            return self.jsonResponse(for: request.url!, body: [[
                "request_id": "r1", "direction": "outgoing", "other_id": "u3", "other_name": "Cy",
                "other_avatar_seed": "ef", "requested_at": "2026-10-06T00:00:00+00:00",
            ]])
        }
        let requests = try await client.getBuddyRequests()
        XCTAssertEqual(requests.map(\.id), ["r1"])
        XCTAssertEqual(requests.first?.direction, .outgoing)
    }

    func testRequestBuddyPostsTheFriendAndReturnsTheStatus() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/request_buddy")
            XCTAssertEqual(self.body(request)["_friend"] as? String, "u2")
            return self.jsonResponse(for: request.url!, body: [["status": "friend_paired"]])
        }
        let status = try await client.requestBuddy(friendID: "u2")
        XCTAssertEqual(status, "friend_paired")
    }

    func testRespondCancelAndEndPostTheRightArguments() async throws {
        let client = makeClient { request in
            let path = request.url?.path ?? ""
            let sent = self.body(request)
            switch path {
            case "/rest/v1/rpc/respond_buddy_request":
                XCTAssertEqual(sent["_request"] as? String, "r1")
                XCTAssertEqual(sent["_accept"] as? Bool, false)
                return self.jsonResponse(for: request.url!, body: [["status": "declined"]])
            case "/rest/v1/rpc/cancel_buddy_request":
                XCTAssertEqual(sent["_request"] as? String, "r2")
                return self.jsonResponse(for: request.url!, body: [["status": "cancelled"]])
            case "/rest/v1/rpc/end_buddy":
                XCTAssertTrue(sent.isEmpty)
                return self.jsonResponse(for: request.url!, body: [["status": "ended"]])
            default:
                XCTFail("unexpected \(path)")
                return self.jsonResponse(for: request.url!, body: [] as [Any])
            }
        }
        let declined = try await client.respondBuddyRequest(requestID: "r1", accept: false)
        let cancelled = try await client.cancelBuddyRequest(requestID: "r2")
        let ended = try await client.endBuddy()
        XCTAssertEqual(declined, "declined")
        XCTAssertEqual(cancelled, "cancelled")
        XCTAssertEqual(ended, "ended")
    }

    func testAMutationWithNoRowAnswersUnknownAndAServerErrorThrows() async throws {
        let empty = makeClient { request in self.jsonResponse(for: request.url!, body: [] as [Any]) }
        let status = try await empty.endBuddy()
        XCTAssertEqual(status, "unknown")
        let failing = makeClient { request in self.jsonResponse(for: request.url!, body: [] as [Any], status: 500) }
        do {
            _ = try await failing.requestBuddy(friendID: "u2")
            XCTFail("a server error must throw")
        } catch {}
    }

    func testSendBuddyMessagePostsThePresetAndGetBuddyMessagesDecodesRows() async throws {
        let client = makeClient { request in
            switch request.url?.path {
            case "/rest/v1/rpc/send_buddy_message":
                XCTAssertEqual(self.body(request)["_preset"] as? String, "nice_work")
                return self.jsonResponse(for: request.url!, body: [["status": "rate_limited"]])
            case "/rest/v1/rpc/get_buddy_messages":
                return self.jsonResponse(for: request.url!, body: [[
                    "message_id": "m1", "sender_id": "u2", "is_mine": false, "preset_id": "nice_work",
                    "sent_at": "2026-10-07T00:00:00+00:00",
                ]])
            default:
                XCTFail("unexpected \(request.url?.path ?? "")")
                return self.jsonResponse(for: request.url!, body: [] as [Any])
            }
        }
        let status = try await client.sendBuddyMessage(presetID: "nice_work")
        XCTAssertEqual(status, "rate_limited")
        let messages = try await client.getBuddyMessages()
        XCTAssertEqual(messages.map(\.presetID), ["nice_work"])
    }

    func testGetBuddyMessagesThrowsOnAServerErrorNeverAnEmptyHistory() async {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [] as [Any], status: 500) }
        do {
            _ = try await client.getBuddyMessages()
            XCTFail("a failed read must throw")
        } catch {}
    }

    func testMatchingCalls() async throws {
        let client = makeClient { request in
            switch request.url?.path {
            case "/rest/v1/rpc/join_buddy_pool":
                XCTAssertEqual(self.body(request)["_course"] as? String, "fr")
                return self.jsonResponse(for: request.url!, body: [["status": "waiting"]])
            case "/rest/v1/rpc/leave_buddy_pool":
                return self.jsonResponse(for: request.url!, body: [["status": "left"]])
            case "/rest/v1/rpc/get_buddy_pool":
                return self.jsonResponse(for: request.url!, body: [["matching_enabled": true, "waiting": false, "course": NSNull(), "courses": ["fr"]]])
            default:
                XCTFail("unexpected \(request.url?.path ?? "")")
                return self.jsonResponse(for: request.url!, body: [] as [Any])
            }
        }
        let joined = try await client.joinBuddyPool(course: "fr")
        let left = try await client.leaveBuddyPool()
        let pool = try await client.getBuddyPool()
        XCTAssertEqual(joined, "waiting")
        XCTAssertEqual(left, "left")
        XCTAssertEqual(pool.courses, ["fr"])
    }

    func testGetBuddyPoolThrowsOnAServerError() async {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [] as [Any], status: 500) }
        do {
            _ = try await client.getBuddyPool()
            XCTFail("a failed read must throw, never look like 'matching is off'")
        } catch {}
    }
}

