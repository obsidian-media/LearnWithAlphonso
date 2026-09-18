import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Covers the RLS-safe, non-adversarial PostgREST operations (a user's own
/// row, auth.uid() = user_id enforced server-side; see
/// supabase/migrations/20260725012934_..._progress.sql's
/// "user_progress_write_own"/"user_progress_update_own" policies), plus
/// completeLesson, which calls the complete-lesson Edge Function instead
/// of PostgREST directly (see that method's doc comment and
/// supabase/functions/complete-lesson/index.ts for why).
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

    // MARK: - startLessonSession

    func testStartLessonSessionPostsToTheEdgeFunctionAndReturnsTheToken() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: ["token": "payload.sig"])
        }

        let token = try await client.startLessonSession(lessonID: "u1l1", course: "en")

        XCTAssertEqual(token, "payload.sig")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/functions/v1/start-lesson-session"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["course"] as? String, "en")
    }

    func testStartLessonSessionSurfacesTheEdgeFunctionsErrorShape() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Lesson not found"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.startLessonSession(lessonID: "missing", course: "en")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 404, message: "Lesson not found"))
        }
    }

    // MARK: - completeLesson

    func testCompleteLessonPostsToTheEdgeFunctionAndDecodesTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                "xpGain": 100,
                "newlyUnlocked": ["xp_100", "perfect_1"],
                "heartsBonus": "perfect",
                "progress": [
                    "xp": 100,
                    "streak": 1,
                    "longestStreak": 1,
                    "lastActiveDate": "2026-09-18",
                    "hearts": 4,
                    "heartsRefillAt": NSNull(),
                    "streakFreezes": 0,
                    "leagueTier": "bronze",
                ],
            ])
        }

        let result = try await client.completeLesson(
            lessonID: "u1l1",
            total: 8,
            missedQuestionIDs: [],
            course: "en",
            sessionToken: "a.b"
        )

        XCTAssertEqual(result.xpGain, 100)
        XCTAssertEqual(result.newlyUnlocked, ["xp_100", "perfect_1"])
        XCTAssertEqual(result.heartsBonus, "perfect")
        XCTAssertEqual(result.progress, LessonCompletionProgress(
            xp: 100, streak: 1, longestStreak: 1, lastActiveDate: "2026-09-18",
            hearts: 4, heartsRefillAt: nil, streakFreezes: 0, leagueTier: "bronze"
        ))

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/functions/v1/complete-lesson"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["total"] as? Int, 8)
        XCTAssertEqual(payload["missedQuestionIds"] as? [String], [])
        XCTAssertEqual(payload["course"] as? String, "en")
        XCTAssertEqual(payload["sessionToken"] as? String, "a.b")
    }

    func testCompleteLessonSurfacesTheEdgeFunctionsErrorShape() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Invalid or expired lesson session"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.completeLesson(lessonID: "u1l1", total: 8, missedQuestionIDs: [], course: "en", sessionToken: "bad")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 403, message: "Invalid or expired lesson session"))
        }
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
