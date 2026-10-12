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
        PendingLessonCompletion(lessonID: lessonID, total: 5, answers: [], course: "en", queuedAt: queuedAt, optimisticXpEstimate: 50)
    }

    private func pendingGrade(itemKey: String, queuedAt: Date) -> PendingReviewGrade {
        PendingReviewGrade(itemKey: itemKey, answer: "cat", course: "en", queuedAt: queuedAt)
    }

    // MARK: - lesson completions

    func testSyncsAllPendingLessonCompletionsOldestFirstAndReturnsTheLatestProgress() async throws {
        let now = Date()
        let older = pendingCompletion(lessonID: "u1l1", queuedAt: now.addingTimeInterval(-60))
        let newer = pendingCompletion(lessonID: "u1l2", queuedAt: now)
        let calledLessonIDs = TestCapture<[String]>([])

        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") {
                return self.jsonResponse(for: request.url!, body: ["token": "tok"])
            }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            let lessonId = body["lessonId"] as! String
            calledLessonIDs.value.append(lessonId)
            return self.jsonResponse(for: request.url!, body: [
                "xpGain": 50, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(),
                "progress": self.completionProgressJSON(xp: lessonId == "u1l2" ? 150 : 100),
            ])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [newer, older], pendingReviewGrades: [], client: client)

        XCTAssertEqual(calledLessonIDs.value, ["u1l1", "u1l2"], "should drain oldest-queued first regardless of input order")
        XCTAssertEqual(result.syncedLessonCompletions, [older, newer])
        XCTAssertEqual(result.lastKnownProgress?.xp, 150, "should report the most recently synced completion's progress")
    }

    private let fixedNow = Date(timeIntervalSince1970: 1_791_000_000)

    func testA400LessonCompletionIsDeadLetteredAndTheRestStillSync() async {
        let failing = pendingCompletion(lessonID: "bad", queuedAt: fixedNow.addingTimeInterval(-60))
        let succeeding = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") { return self.jsonResponse(for: request.url!, body: ["token": "tok"]) }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if (body["lessonId"] as! String) == "bad" { return self.jsonResponse(for: request.url!, body: ["error": "lesson-version-mismatch"], status: 409) }
            return self.jsonResponse(for: request.url!, body: ["xpGain": 50, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.completionProgressJSON(xp: 100)])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [failing, succeeding], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(result.syncedLessonCompletions, [succeeding])
        XCTAssertEqual(result.deadLetteredLessonCompletions, [DeadLetter(item: failing, reason: "lesson-version-mismatch")])
        XCTAssertEqual(result.rescheduledLessonCompletions, [])
    }

    func testA5xxLessonCompletionIsRescheduledWithBackoff() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: ["error": "boom"], status: 503) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(result.rescheduledLessonCompletions, [item.rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(30))])
    }

    /// A flaky network never loses a lesson: an item failing transiently 20 times is still queued, never
    /// dead-lettered, and its wait stays capped.
    func testALessonCompletionFailingTransientlyTwentyTimesIsStillQueued() async {
        var item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        var now = fixedNow
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [:], status: 503) }
        for _ in 0..<20 {
            let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: now)
            XCTAssertTrue(result.deadLetteredLessonCompletions.isEmpty)
            item = try! XCTUnwrap(result.rescheduledLessonCompletions.first)
            now = item.nextAttemptAt!
        }
        XCTAssertEqual(item.attemptCount, 20)
        let last = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: now)
        XCTAssertEqual(last.rescheduledLessonCompletions.first?.nextAttemptAt, now.addingTimeInterval(6 * 60 * 60))
    }

    func testAReviewGradeFailingTransientlyTwentyTimesIsStillQueued() async {
        var grade = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow)
        var now = fixedNow
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [:], status: 429) }
        for _ in 0..<20 {
            let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [grade], client: client, now: now)
            XCTAssertTrue(result.deadLetteredReviewGrades.isEmpty)
            grade = try! XCTUnwrap(result.rescheduledReviewGrades.first)
            now = grade.nextAttemptAt!
        }
        XCTAssertEqual(grade.attemptCount, 20)
    }

    /// A permanent rejection dead-letters whatever its attempt count, and the queue keeps going.
    func testAGradeWithManyPriorFailuresThatIsNowRejectedIsDeadLetteredAndTheLoopContinues() async {
        let first = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow.addingTimeInterval(-60))
            .rescheduled(attemptCount: 7, nextAttemptAt: fixedNow.addingTimeInterval(-1))
        let second = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if (body["itemKey"] as! String) == "u1l1:q1" { return self.jsonResponse(for: request.url!, body: ["error": "not due yet"], status: 400) }
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-10-09"])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [first, second], client: client, now: fixedNow)
        XCTAssertEqual(result.deadLetteredReviewGrades, [DeadLetter(item: first, reason: "rejected")])
        XCTAssertEqual(result.syncedReviewGrades, [second])
    }

    func testAnItemInBackoffIsNotSent() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow).rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(60))
        let calls = TestCapture(0)
        let client = makeClient { request in calls.value += 1; return self.jsonResponse(for: request.url!, body: [:], status: 500) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(calls.value, 0)
        XCTAssertTrue(result.rescheduledLessonCompletions.isEmpty && result.syncedLessonCompletions.isEmpty)
    }

    func testOutOfHeartsDefersUntilARefillWithoutCountingAnAttempt() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: ["error": "out-of-hearts", "refillAt": NSNull()], status: 409) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(result.rescheduledLessonCompletions, [item.rescheduled(attemptCount: 0, nextAttemptAt: fixedNow.addingTimeInterval(HeartsEconomy.heartRefillSeconds))])
        XCTAssertTrue(result.deadLetteredLessonCompletions.isEmpty)
    }

    /// Another account's queued rows are never sent with this account's token.
    func testRowsOwnedByAnotherUserAreDroppedNotSent() async {
        let mine = PendingLessonCompletion(lessonID: "u1l1", total: 5, answers: [], course: "en", queuedAt: fixedNow, optimisticXpEstimate: 1, ownerUserID: "me")
        let theirs = PendingLessonCompletion(lessonID: "u1l2", total: 5, answers: [], course: "en", queuedAt: fixedNow, optimisticXpEstimate: 1, ownerUserID: "them")
        let legacy = PendingLessonCompletion(lessonID: "u1l3", total: 5, answers: [], course: "en", queuedAt: fixedNow, optimisticXpEstimate: 1)
        let theirGrade = PendingReviewGrade(itemKey: "u1l1:q1", answer: "a", course: "en", queuedAt: fixedNow, ownerUserID: "them")
        let sent = TestCapture<[String]>([])
        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") { return self.jsonResponse(for: request.url!, body: ["token": "tok"]) }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            sent.value.append((body["lessonId"] ?? body["itemKey"]) as! String)
            return self.jsonResponse(for: request.url!, body: ["xpGain": 1, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.completionProgressJSON(xp: 1)])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [mine, theirs, legacy], pendingReviewGrades: [theirGrade], client: client, currentUserID: "me", now: fixedNow)
        XCTAssertEqual(Set(sent.value), ["u1l1", "u1l3"])
        XCTAssertEqual(result.droppedForeignLessonCompletions, [theirs])
        XCTAssertEqual(result.droppedForeignReviewGrades, [theirGrade])
    }

    func testA4xxReviewGradeIsDeadLetteredAndTheNextGradeStillSyncs() async {
        let first = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow.addingTimeInterval(-60))
        let second = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if (body["itemKey"] as! String) == "u1l1:q1" { return self.jsonResponse(for: request.url!, body: ["error": "not due yet"], status: 400) }
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-10-09"])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [first, second], client: client, now: fixedNow)
        XCTAssertEqual(result.deadLetteredReviewGrades, [DeadLetter(item: first, reason: "rejected")])
        XCTAssertEqual(result.syncedReviewGrades, [second])
    }

    func testATransientGradeFailureStopsTheGradeQueueAndReschedulesIt() async {
        let first = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow.addingTimeInterval(-60))
        let second = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let calledKeys = TestCapture<[String]>([])
        let calledAttempts = TestCapture<[String]>([])
        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            calledKeys.value.append(body["itemKey"] as! String)
            calledAttempts.value.append(body["attemptId"] as! String)
            return self.jsonResponse(for: request.url!, body: [:], status: 502)
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [first, second], client: client, now: fixedNow)
        XCTAssertEqual(calledKeys.value, ["u1l1:q1"], "SM-2 ordering: never apply grade N+1 before N landed")
        XCTAssertEqual(calledAttempts.value, [first.queueIdentity])
        XCTAssertEqual(result.rescheduledReviewGrades, [first.rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(30))])
    }

    func testA401DuringSyncRefreshesOnceThroughTheProvidedRefresher() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        let seen = TestCapture<[String]>([])
        let client = makeClient { request in
            let auth = request.value(forHTTPHeaderField: "Authorization")!
            seen.value.append(auth)
            if auth == "Bearer user-access-token" { return self.jsonResponse(for: request.url!, body: [:], status: 401) }
            if request.url!.absoluteString.hasSuffix("start-lesson-session") { return self.jsonResponse(for: request.url!, body: ["token": "tok"]) }
            return self.jsonResponse(for: request.url!, body: ["xpGain": 1, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.completionProgressJSON(xp: 1)])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client,
                                           refreshAccessToken: { "fresh" }, now: fixedNow)
        XCTAssertEqual(result.syncedLessonCompletions, [item])
        XCTAssertTrue(seen.value.contains("Bearer fresh"))
    }

    func testRefreshDueReviewsKeepsEachCourseSeparateAndSkipsAFailedOne() async {
        let out = await SyncEngine.refreshDueReviews(courses: ["en", "fr", "es"]) { course in
            if course == "fr" { throw URLError(.notConnectedToInternet) }
            return DueReviews(due: [ReviewItem(itemKey: "\(course):k", lessonId: "u1l1", level: "A1", ease: 2.5, intervalDays: 1, repetitions: 0, dueOn: "2026-10-08")], total: 1)
        }
        XCTAssertEqual(Set(out.keys), ["en", "es"], "a failed course is absent, so its cache is left alone")
        XCTAssertEqual(out["es"]?.first?.itemKey, "es:k")
        XCTAssertEqual(SyncEngine.reviewCourses, ["en", "fr", "es"])
    }

    // MARK: - review grades

    func testSyncsPendingReviewGradesStrictlyOldestFirst() async throws {
        let now = Date()
        let older = pendingGrade(itemKey: "en:l1:q1", queuedAt: now.addingTimeInterval(-60))
        let newer = pendingGrade(itemKey: "en:l1:q2", queuedAt: now)
        let calledKeys = TestCapture<[String]>([])

        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            calledKeys.value.append(body["itemKey"] as! String)
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-09-25"])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [newer, older], client: client)

        XCTAssertEqual(calledKeys.value, ["en:l1:q1", "en:l1:q2"])
        XCTAssertEqual(result.syncedReviewGrades, [older, newer])
    }

    func testReturnsNilLastKnownProgressWhenNoLessonCompletionsWereSynced() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-09-25"])
        }

        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [pendingGrade(itemKey: "en:l1:q1", queuedAt: Date())], client: client)

        XCTAssertNil(result.lastKnownProgress)
    }
}
