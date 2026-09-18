import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Covers only the RLS-safe, non-adversarial operations -- direct
/// authenticated PostgREST calls a user can legitimately make about their
/// own row (auth.uid() = user_id enforced server-side by RLS; see
/// supabase/migrations/20260725012934_..._progress.sql's
/// "user_progress_write_own"/"user_progress_update_own" policies).
///
/// completeLessonRemote is deliberately NOT ported here -- it grants XP
/// based on a client-reported score, gated by an HMAC session token signed
/// with a server-only secret (LESSON_SESSION_SECRET, see
/// lesson-session.server.ts). That secret can never ship in a distributed
/// app binary, so this needs a real Supabase Edge Function, not a Swift
/// client method -- see the follow-up plan doc for the design.
final class ProgressSyncClientTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!
    private let userID = "11111111-1111-1111-1111-111111111111"

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

    // MARK: - loseHeart

    func testLoseHeartReadsCurrentHeartsThenPatchesTheDecrementedValue() async throws {
        var requests: [URLRequest] = []
        let client = makeClient { request in
            requests.append(request)
            if request.httpMethod == "GET" {
                return self.jsonResponse(for: request.url!, body: [["hearts": 3]])
            }
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        let result = try await client.loseHeart(userID: userID)

        XCTAssertEqual(result.hearts, 2)
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[0].httpMethod, "GET")
        XCTAssertEqual(requests[1].httpMethod, "PATCH")
        let body = try XCTUnwrap(requests[1].httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["hearts"] as? Int, 2)
        XCTAssertNotNil(payload["hearts_refill_at"] as? NSNull)
    }

    func testLoseHeartNeverGoesBelowZeroAndSchedulesARefill() async throws {
        var requests: [URLRequest] = []
        let client = makeClient { request in
            requests.append(request)
            if request.httpMethod == "GET" {
                return self.jsonResponse(for: request.url!, body: [["hearts": 0]])
            }
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        let result = try await client.loseHeart(userID: userID)

        XCTAssertEqual(result.hearts, 0)
        let body = try XCTUnwrap(requests[1].httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertFalse(payload["hearts_refill_at"] is NSNull)
    }

    func testLoseHeartDefaultsTo5HeartsWhenNoRowExistsYet() async throws {
        var requests: [URLRequest] = []
        let client = makeClient { request in
            requests.append(request)
            if request.httpMethod == "GET" {
                return self.jsonResponse(for: request.url!, body: [] as [[String: Int]])
            }
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        let result = try await client.loseHeart(userID: userID)
        XCTAssertEqual(result.hearts, 4)
    }

    // MARK: - setCefrLevel

    func testSetCefrLevelUpsertsLanguageProgress() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.setCefrLevel(userID: userID, course: "en", level: "B1")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/language_progress"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "resolution=merge-duplicates,return=minimal")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["user_id"] as? String, userID)
        XCTAssertEqual(payload["language"] as? String, "en")
        XCTAssertEqual(payload["cefr_level"] as? String, "B1")
    }

    // MARK: - savePlacementResult

    func testSavePlacementResultUpsertsLevelScoreAndTimestamp() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.savePlacementResult(userID: userID, course: "en", level: "A2", score: 73)

        let request = try XCTUnwrap(captured)
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["cefr_level"] as? String, "A2")
        XCTAssertEqual(payload["placement_level"] as? String, "A2")
        XCTAssertEqual(payload["placement_score"] as? Int, 73)
        XCTAssertNotNil(payload["placement_taken_at"])
    }

    // MARK: - error handling

    func testThrowsAReadableErrorWhenSupabaseRejectsAWrite() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["message": "new row violates row-level security policy"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            try await client.setCefrLevel(userID: userID, course: "en", level: "B1")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 403, message: "new row violates row-level security policy"))
        }
    }
}
