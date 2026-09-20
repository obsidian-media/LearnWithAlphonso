import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class SyncEngineTests: XCTestCase {
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

    private func completionProgressJSON(xp: Int) -> [String: Any] {
        ["xp": xp, "streak": 1, "longestStreak": 1, "lastActiveDate": "2026-09-18", "hearts": 4, "heartsRefillAt": NSNull(), "streakFreezes": 0, "leagueTier": "bronze"]
    }

    private func pendingCompletion(lessonID: String, queuedAt: Date) -> PendingLessonCompletion {
        PendingLessonCompletion(lessonID: lessonID, total: 5, missedQuestionIDs: [], course: "en", queuedAt: queuedAt, optimisticXpEstimate: 50)
    }

    private func pendingGrade(itemKey: String, queuedAt: Date) -> PendingReviewGrade {
        PendingReviewGrade(itemKey: itemKey, answer: "cat", course: "en", queuedAt: queuedAt)
    }

    // MARK: - lesson completions

    func testSyncsAllPendingLessonCompletionsOldestFirstAndReturnsTheLatestProgress() async throws {
        let now = Date()
        let older = pendingCompletion(lessonID: "u1l1", queuedAt: now.addingTimeInterval(-60))
        let newer = pendingCompletion(lessonID: "u1l2", queuedAt: now)
        var calledLessonIDs: [String] = []

        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") {
                return self.jsonResponse(for: request.url!, body: ["token": "tok"])
            }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            let lessonId = body["lessonId"] as! String
            calledLessonIDs.append(lessonId)
            return self.jsonResponse(for: request.url!, body: [
                "xpGain": 50, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(),
                "progress": self.completionProgressJSON(xp: lessonId == "u1l2" ? 150 : 100),
            ])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [newer, older], pendingReviewGrades: [], client: client)

        XCTAssertEqual(calledLessonIDs, ["u1l1", "u1l2"], "should drain oldest-queued first regardless of input order")
        XCTAssertEqual(result.syncedLessonCompletions, [older, newer])
        XCTAssertEqual(result.lastKnownProgress?.xp, 150, "should report the most recently synced completion's progress")
    }

    func testLeavesAFailedLessonCompletionUnsyncedButStillTriesTheRest() async throws {
        let now = Date()
        let failing = pendingCompletion(lessonID: "bad", queuedAt: now.addingTimeInterval(-60))
        let succeeding = pendingCompletion(lessonID: "u1l1", queuedAt: now)

        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") {
                return self.jsonResponse(for: request.url!, body: ["token": "tok"])
            }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if (body["lessonId"] as! String) == "bad" {
                return self.jsonResponse(for: request.url!, body: ["error": "nope"], status: 400)
            }
            return self.jsonResponse(for: request.url!, body: [
                "xpGain": 50, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.completionProgressJSON(xp: 100),
            ])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [failing, succeeding], pendingReviewGrades: [], client: client)

        XCTAssertEqual(result.syncedLessonCompletions, [succeeding])
    }

    // MARK: - review grades

    func testSyncsPendingReviewGradesStrictlyOldestFirst() async throws {
        let now = Date()
        let older = pendingGrade(itemKey: "en:l1:q1", queuedAt: now.addingTimeInterval(-60))
        let newer = pendingGrade(itemKey: "en:l1:q2", queuedAt: now)
        var calledKeys: [String] = []

        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            calledKeys.append(body["itemKey"] as! String)
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-09-25"])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [newer, older], client: client)

        XCTAssertEqual(calledKeys, ["en:l1:q1", "en:l1:q2"])
        XCTAssertEqual(result.syncedReviewGrades, [older, newer])
    }

    func testStopsDrainingReviewGradesAtTheFirstFailureToPreserveOrdering() async throws {
        let now = Date()
        let first = pendingGrade(itemKey: "en:l1:q1", queuedAt: now.addingTimeInterval(-60))
        let second = pendingGrade(itemKey: "en:l1:q2", queuedAt: now)
        var calledKeys: [String] = []

        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            calledKeys.append(body["itemKey"] as! String)
            return self.jsonResponse(for: request.url!, body: ["error": "not due yet"], status: 400)
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [first, second], client: client)

        XCTAssertEqual(calledKeys, ["en:l1:q1"], "must not attempt the second grade once the first failed")
        XCTAssertTrue(result.syncedReviewGrades.isEmpty)
    }

    func testReturnsNilLastKnownProgressWhenNoLessonCompletionsWereSynced() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-09-25"])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [pendingGrade(itemKey: "en:l1:q1", queuedAt: Date())], client: client)

        XCTAssertNil(result.lastKnownProgress)
    }
}
