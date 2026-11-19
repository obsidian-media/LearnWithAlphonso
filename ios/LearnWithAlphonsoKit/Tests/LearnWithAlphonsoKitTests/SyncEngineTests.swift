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

    /// complete-lesson books max(last_active_date, day): a newer lesson landing first loses the older day. So a
    /// transient failure stops the lesson queue exactly as it stops the grade queue.
    func testATransientLessonFailureStopsTheLessonQueue() async {
        let older = pendingCompletion(lessonID: "monday", queuedAt: fixedNow.addingTimeInterval(-86_400))
        let newer = pendingCompletion(lessonID: "tuesday", queuedAt: fixedNow)
        let sent = TestCapture<[String]>([])
        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") { return self.jsonResponse(for: request.url!, body: ["token": "tok"]) }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            sent.value.append(body["lessonId"] as! String)
            return self.jsonResponse(for: request.url!, body: ["error": "boom"], status: 503)
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [newer, older], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(sent.value, ["monday"], "tuesday must not overtake monday")
        XCTAssertEqual(result.rescheduledLessonCompletions.map(\.lessonID), ["monday"])
        XCTAssertTrue(result.syncedLessonCompletions.isEmpty)
    }

    /// An older lesson still waiting out its backoff holds the newer ones too.
    func testAnOlderLessonInBackoffHoldsTheNewerOnes() async {
        let older = pendingCompletion(lessonID: "monday", queuedAt: fixedNow.addingTimeInterval(-60))
            .rescheduled(attemptCount: 2, nextAttemptAt: fixedNow.addingTimeInterval(120))
        let newer = pendingCompletion(lessonID: "tuesday", queuedAt: fixedNow)
        let calls = TestCapture(0)
        let client = makeClient { request in calls.value += 1; return self.jsonResponse(for: request.url!, body: [:], status: 500) }
        _ = await SyncEngine.sync(pendingLessonCompletions: [older, newer], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(calls.value, 0)
    }

    /// A retry time written by a clock set days ahead does not hold the item until that date.
    func testARetryTimeFromAClockSetDaysAheadIsSentNow() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
            .rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(30 * 24 * 60 * 60))
        let grade = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow)
            .rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(30 * 24 * 60 * 60))
        let client = makeClient { request in
            if request.url!.absoluteString.hasSuffix("start-lesson-session") { return self.jsonResponse(for: request.url!, body: ["token": "tok"]) }
            if request.url!.absoluteString.hasSuffix("grade-review") { return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-10-09"]) }
            return self.jsonResponse(for: request.url!, body: ["xpGain": 1, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.completionProgressJSON(xp: 1)])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [grade], client: client, now: fixedNow)
        XCTAssertEqual(result.syncedLessonCompletions, [item])
        XCTAssertEqual(result.syncedReviewGrades, [grade])
    }

    func testTheWakeupIsTheOldestRowOfEachQueueForThisAccount() {
        let older = pendingCompletion(lessonID: "monday", queuedAt: fixedNow.addingTimeInterval(-60))
            .rescheduled(attemptCount: 3, nextAttemptAt: fixedNow.addingTimeInterval(600))
        let newer = pendingCompletion(lessonID: "tuesday", queuedAt: fixedNow)
        let theirs = PendingLessonCompletion(lessonID: "x", total: 1, answers: [], course: "en", queuedAt: fixedNow.addingTimeInterval(-999), optimisticXpEstimate: 1, ownerUserID: "them")
        let wake = SyncEngine.nextWakeup(lessons: [newer, older, theirs], grades: [], userID: "me", now: fixedNow)
        XCTAssertEqual(wake, fixedNow.addingTimeInterval(600), "tuesday cannot go before monday, and their row is not ours")
        let skewed = older.rescheduled(attemptCount: 3, nextAttemptAt: fixedNow.addingTimeInterval(30 * 24 * 3600))
        XCTAssertEqual(SyncEngine.nextWakeup(lessons: [skewed], grades: [], userID: "me", now: fixedNow), fixedNow)
        XCTAssertNil(SyncEngine.nextWakeup(lessons: [theirs], grades: [], userID: "me", now: fixedNow))
    }

    func testA5xxLessonCompletionIsRescheduledWithBackoff() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: ["error": "boom"], status: 503) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertEqual(result.rescheduledLessonCompletions, [item.rescheduled(attemptCount: 1, nextAttemptAt: fixedNow.addingTimeInterval(30))])
    }

    /// No connection is not server trouble: the item waits the shortest delay and its failure count does not
    /// grow, so a lesson finished offline syncs soon after the phone is back online, not hours later.
    func testALessonCompletionThatFailsOfflineIsRetriedSoonWithoutGrowingItsBackoff() async {
        let item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
            .rescheduled(attemptCount: 6, nextAttemptAt: fixedNow.addingTimeInterval(-1))
        let client = makeClient { _ in throw URLError(.notConnectedToInternet) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: fixedNow)
        XCTAssertTrue(result.deadLetteredLessonCompletions.isEmpty)
        XCTAssertEqual(result.rescheduledLessonCompletions, [item.rescheduled(attemptCount: 6, nextAttemptAt: fixedNow.addingTimeInterval(30))])
    }

    func testAReviewGradeThatFailsOfflineIsRetriedSoonWithoutGrowingItsBackoff() async {
        let first = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow.addingTimeInterval(-60))
            .rescheduled(attemptCount: 6, nextAttemptAt: fixedNow.addingTimeInterval(-1))
        let second = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let calls = TestCapture<Int>(0)
        let client = makeClient { _ in calls.value += 1; throw URLError(.networkConnectionLost) }
        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [first, second], client: client, now: fixedNow)
        XCTAssertEqual(calls.value, 1, "order is kept: the second grade is not sent past the first")
        XCTAssertTrue(result.deadLetteredReviewGrades.isEmpty)
        XCTAssertEqual(result.rescheduledReviewGrades, [first.rescheduled(attemptCount: 6, nextAttemptAt: fixedNow.addingTimeInterval(30))])
    }

    /// A flaky server never loses a lesson: 19 transient failures (days of capped backoff) keep it queued. The
    /// 20th parks it: still queued, holding nothing up (the queue is strictly ordered), waiting for "Try again".
    func testALessonCompletionIsKeptThroughNineteenTransientFailuresAndParkedOnTheTwentieth() async {
        var item = pendingCompletion(lessonID: "u1l1", queuedAt: fixedNow)
        var now = fixedNow
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [:], status: 503) }
        for _ in 0..<19 {
            let result = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: now)
            XCTAssertTrue(result.deadLetteredLessonCompletions.isEmpty)
            item = try! XCTUnwrap(result.rescheduledLessonCompletions.first)
            now = item.nextAttemptAt!
        }
        XCTAssertEqual(item.attemptCount, 19)
        XCTAssertLessThanOrEqual(item.nextAttemptAt!.timeIntervalSince(now), 6 * 60 * 60, "the wait stays capped")
        let last = await SyncEngine.sync(pendingLessonCompletions: [item], pendingReviewGrades: [], client: client, now: now)
        XCTAssertTrue(last.deadLetteredLessonCompletions.isEmpty, "a lesson is never dropped for being unlucky")
        let parked = try! XCTUnwrap(last.rescheduledLessonCompletions.first)
        XCTAssertTrue(SyncRetryPolicy.standard.isParked(parked))
        XCTAssertEqual(parked.queueIdentity, item.queueIdentity)
    }

    func testAReviewGradeIsKeptThroughNineteenTransientFailuresAndDeadLetteredOnTheTwentieth() async {
        var grade = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow)
        var now = fixedNow
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: [:], status: 429) }
        for _ in 0..<19 {
            let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [grade], client: client, now: now)
            XCTAssertTrue(result.deadLetteredReviewGrades.isEmpty)
            grade = try! XCTUnwrap(result.rescheduledReviewGrades.first)
            now = grade.nextAttemptAt!
        }
        XCTAssertEqual(grade.attemptCount, 19)
        let last = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [grade], client: client, now: now)
        XCTAssertEqual(last.deadLetteredReviewGrades, [DeadLetter(item: grade, reason: SyncRetryPolicy.exhaustedReason)])
    }

    /// The poison grade no longer blocks the queue: once it runs out of retries, the grades behind it go in
    /// the same pass.
    func testAGradeThatRanOutOfRetriesLetsTheGradesBehindItThrough() async {
        let poison = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow.addingTimeInterval(-60))
            .rescheduled(attemptCount: 19, nextAttemptAt: fixedNow.addingTimeInterval(-1))
        let next = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let client = makeClient { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if (body["itemKey"] as! String) == "u1l1:q1" { return self.jsonResponse(for: request.url!, body: [:], status: 500) }
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-10-09"])
        }
        let result = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [poison, next], client: client, now: fixedNow)
        XCTAssertEqual(result.deadLetteredReviewGrades.map(\.item), [poison])
        XCTAssertEqual(result.syncedReviewGrades, [next])
    }

    /// A week of real server failures ends it too; a week merely offline does not (offline never counts).
    func testAGradeAWeekOldWithRealFailuresIsDeadLetteredButAWeekOfflineIsNot() async {
        let aWeekLater = fixedNow.addingTimeInterval(7 * 24 * 60 * 60)
        let failing = pendingGrade(itemKey: "u1l1:q1", queuedAt: fixedNow).rescheduled(attemptCount: 2, nextAttemptAt: aWeekLater)
        let serverDown = makeClient { request in self.jsonResponse(for: request.url!, body: [:], status: 503) }
        let aged = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [failing], client: serverDown, now: aWeekLater)
        XCTAssertEqual(aged.deadLetteredReviewGrades.map(\.item), [failing])

        // A week offline: every pass fails with no connection, which never counts, so the age rule never fires.
        var offlineAllWeek = pendingGrade(itemKey: "u1l1:q2", queuedAt: fixedNow)
        let offline = makeClient { _ in throw URLError(.notConnectedToInternet) }
        var day = fixedNow
        while day <= aWeekLater.addingTimeInterval(86_400) {
            let pass = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [offlineAllWeek], client: offline, now: day)
            XCTAssertTrue(pass.deadLetteredReviewGrades.isEmpty)
            offlineAllWeek = try! XCTUnwrap(pass.rescheduledReviewGrades.first)
            day = day.addingTimeInterval(86_400)
        }
        XCTAssertEqual(offlineAllWeek.attemptCount, 0, "offline never counts as a failure")
        // Back online, the first real failure is one, not three: still queued.
        let backOnline = await SyncEngine.sync(pendingLessonCompletions: [], pendingReviewGrades: [offlineAllWeek], client: serverDown, now: day)
        XCTAssertTrue(backOnline.deadLetteredReviewGrades.isEmpty)
        XCTAssertEqual(backOnline.rescheduledReviewGrades.first?.attemptCount, 1)
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

    /// Another account's queued rows are never sent with this account's token, and never deleted either: they
    /// sync when that account signs back in (AccountQueueRetention).
    func testRowsOwnedByAnotherUserAreLeftInPlaceAndNeverSent() async {
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
        XCTAssertEqual(Set(result.syncedLessonCompletions.map(\.lessonID)), ["u1l1", "u1l3"])
        // Not in any list: SyncQueueStore.apply leaves the row exactly as it is.
        XCTAssertFalse(result.rescheduledLessonCompletions.contains(theirs))
        XCTAssertFalse(result.deadLetteredLessonCompletions.map(\.item).contains(theirs))
        XCTAssertTrue(result.syncedReviewGrades.isEmpty && result.rescheduledReviewGrades.isEmpty && result.deadLetteredReviewGrades.isEmpty)
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
