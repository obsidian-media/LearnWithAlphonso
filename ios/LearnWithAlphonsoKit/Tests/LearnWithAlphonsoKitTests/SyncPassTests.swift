import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// A SyncQueueBacking over plain arrays. Retention and results go through the same Kit dispositions the real
/// store applies to its records (QueueRetentionPlan.applied, SyncResult.applied), so this holds no rule of its own.
@MainActor
final class InMemorySyncBacking: SyncQueueBacking {
    var lessons: [PendingLessonCompletion] = []
    var grades: [PendingReviewGrade] = []
    var progress: LessonCompletionProgress?
    private(set) var progressWrites: [(LessonCompletionProgress, Bool)] = []
    private(set) var markedSynced = 0
    private(set) var dueWrites: [String] = []
    private(set) var deadLetterCount = 0

    func pendingLessonCompletions() -> [PendingLessonCompletion] { lessons }
    func pendingReviewGrades() -> [PendingReviewGrade] { grades }
    func applyRetention(_ plan: QueueRetentionPlan) {
        let kept = plan.applied(lessons: lessons, grades: grades)
        lessons = kept.lessons
        grades = kept.grades
    }
    func clearCachedAccountState() { progress = nil }
    func apply(_ result: SyncResult, now: Date) {
        let kept = result.applied(lessons: lessons, grades: grades)
        lessons = kept.lessons
        grades = kept.grades
        deadLetterCount += result.deadLetteredLessonCompletions.count + result.deadLetteredReviewGrades.count
    }
    func lastKnownProgress() -> LessonCompletionProgress? { progress }
    func updateLastKnownProgress(_ progress: LessonCompletionProgress, synced: Bool) {
        self.progress = progress
        progressWrites.append((progress, synced))
    }
    func markSyncedNow() { markedSynced += 1 }
    func replaceLastKnownDueReviews(_ items: [ReviewItem], course: String) { dueWrites.append(course) }
}

final class SyncPassTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_794_927_600) // 2026-11-17 15:00 UTC
    private let url = URL(string: "https://example.supabase.co")!

    private func ok(_ url: URL, _ body: Any, status: Int = 200) -> (Data, URLResponse) {
        (try! JSONSerialization.data(withJSONObject: body), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private func lesson(_ id: String, owner: String? = "a", queuedAt: Date) -> PendingLessonCompletion {
        PendingLessonCompletion(lessonID: id, total: 1, answers: [], course: "en", queuedAt: queuedAt, optimisticXpEstimate: 1, ownerUserID: owner)
    }

    private func progressJSON(lastActive: String, streak: Int = 3) -> [String: Any] {
        ["xp": 10, "streak": streak, "longestStreak": streak, "lastActiveDate": lastActive, "hearts": 5,
         "heartsRefillAt": NSNull(), "streakFreezes": 0, "leagueTier": "bronze"]
    }

    /// A client that answers complete-lesson and grade-review, fails every read, and records what it sent.
    private func client(sent: TestCapture<[String]>, lastActive: String = "2026-11-16", onSend: @escaping @Sendable () -> Void = {}) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: url, anonKey: "k", accessToken: "t") { request in
            let u = request.url!
            if u.absoluteString.hasSuffix("start-lesson-session") { return self.ok(u, ["token": "tok"]) }
            guard let body = request.httpBody.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) else {
                return self.ok(u, ["error": "down"], status: 503)
            }
            sent.value.append((body["lessonId"] ?? body["itemKey"]) as? String ?? "?")
            onSend()
            if body["itemKey"] != nil { return self.ok(u, ["retired": false, "dueOn": "2026-11-20"]) }
            return self.ok(u, ["xpGain": 1, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": self.progressJSON(lastActive: lastActive)])
        }
    }

    /// A pass started for A stops the moment B signs in: nothing more is sent, the row that did reach the server
    /// is cleared (never sent again), and nothing else is written for A.
    @MainActor
    func testAnAccountSwitchMidPassSendsNothingMoreAndClearsWhatWasSent() async {
        let backing = InMemorySyncBacking()
        backing.lessons = [lesson("one", queuedAt: now.addingTimeInterval(-120)), lesson("two", queuedAt: now.addingTimeInterval(-60))]
        backing.grades = [PendingReviewGrade(itemKey: "k1", answer: "x", course: "en", queuedAt: now, ownerUserID: "a")]
        let signedIn = TestCapture("a")
        let sent = TestCapture<[String]>([])
        await SyncPass.run(
            backing: backing, client: client(sent: sent, onSend: { signedIn.value = "b" }), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { signedIn.value == "a" }, now: now)
        XCTAssertEqual(sent.value, ["one"])
        XCTAssertEqual(backing.lessons.map(\.lessonID), ["two"], "the sent row is cleared, the unsent one kept as it was")
        XCTAssertEqual(backing.lessons.first?.attemptCount, 0)
        XCTAssertEqual(backing.grades.count, 1)
        XCTAssertTrue(backing.progressWrites.isEmpty, "nothing of A's is written once B is signed in")
        XCTAssertEqual(backing.markedSynced, 0)
    }

    /// The refresher a pass gets is bound to its account: after a switch it hands out no token at all.
    @MainActor
    func testTheAccountBoundRefresherRefusesAnotherAccount() async {
        let signedIn = TestCapture<String?>("a")
        let refresher = SyncPass.accountBoundRefresher(
            for: "a", currentUserID: { signedIn.value }, refresh: { "token-for-\(signedIn.value ?? "nobody")" })
        let first = await refresher()
        XCTAssertEqual(first, "token-for-a")
        signedIn.value = "b"
        let second = await refresher()
        XCTAssertNil(second)
    }

    /// An older queued lesson syncing while a newer one is still queued must not undo the newer one's
    /// optimistic "studied today".
    @MainActor
    func testProgressFromAnOlderLessonKeepsTheOptimisticDayWhileANewerOneWaits() async {
        let backing = InMemorySyncBacking()
        backing.lessons = [
            lesson("old", queuedAt: now.addingTimeInterval(-86_400)),
            lesson("new", queuedAt: now).rescheduled(attemptCount: 1, nextAttemptAt: now.addingTimeInterval(600)),
        ]
        backing.progress = LessonCompletionProgress(
            xp: 1, streak: 4, longestStreak: 4, lastActiveDate: "2026-11-17", hearts: 5, heartsRefillAt: nil,
            streakFreezes: 0, leagueTier: "bronze", dayBasis: "local")
        let sent = TestCapture<[String]>([])
        // "new" is not in backoff for ordering's sake here: it is second, and the pass stops at its backoff.
        await SyncPass.run(
            backing: backing, client: client(sent: sent, lastActive: "2026-11-16"), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { true }, now: now)
        XCTAssertEqual(sent.value, ["old"])
        XCTAssertEqual(backing.progress?.lastActiveDate, "2026-11-17")
        XCTAssertEqual(backing.progress?.streak, 4)
        XCTAssertEqual(backing.progress?.xp, 10, "the rest is the server's")
        XCTAssertEqual(backing.progressWrites.last?.1, true)
    }

    /// Nothing sent and the progress read failed: the pass never reached the server, so "last synced" stays.
    @MainActor
    func testAPassThatSentNothingAndCouldNotReadProgressDoesNotMoveLastSynced() async {
        let backing = InMemorySyncBacking()
        let sent = TestCapture<[String]>([])
        await SyncPass.run(
            backing: backing, client: client(sent: sent), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { true }, now: now)
        XCTAssertEqual(backing.markedSynced, 0)
        XCTAssertTrue(backing.progressWrites.isEmpty)
    }

    @MainActor
    func testASentGradeWithAFailedProgressReadStillCountsAsASync() async {
        let backing = InMemorySyncBacking()
        backing.grades = [PendingReviewGrade(itemKey: "k1", answer: "x", course: "en", queuedAt: now, ownerUserID: "a")]
        let sent = TestCapture<[String]>([])
        await SyncPass.run(
            backing: backing, client: client(sent: sent), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { true }, now: now)
        XCTAssertEqual(sent.value, ["k1"])
        XCTAssertEqual(backing.markedSynced, 1)
    }

    @MainActor
    func testAnotherAccountsRowsArePurgedAfterThirtyDaysAndKeptBefore() async {
        let backing = InMemorySyncBacking()
        backing.lessons = [
            lesson("theirs-old", owner: "b", queuedAt: now.addingTimeInterval(-31 * 86_400)),
            lesson("theirs-recent", owner: "b", queuedAt: now.addingTimeInterval(-29 * 86_400)),
        ]
        let sent = TestCapture<[String]>([])
        await SyncPass.run(
            backing: backing, client: client(sent: sent), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { true }, now: now)
        XCTAssertEqual(backing.lessons.map(\.lessonID), ["theirs-recent"])
        XCTAssertEqual(sent.value, [])
    }

    /// A live finish drains only lessons, and sends the head even inside its backoff (the live call is next).
    @MainActor
    func testALessonsOnlyDrainSendsTheHeadInsideItsBackoffAndLeavesGrades() async {
        let backing = InMemorySyncBacking()
        backing.lessons = [lesson("head", queuedAt: now.addingTimeInterval(-60)).rescheduled(attemptCount: 3, nextAttemptAt: now.addingTimeInterval(3_600))]
        backing.grades = [PendingReviewGrade(itemKey: "k1", answer: "x", course: "en", queuedAt: now, ownerUserID: "a")]
        let sent = TestCapture<[String]>([])
        await SyncPass.run(
            backing: backing, client: client(sent: sent), userID: "a", activeCourse: "en",
            refreshAccessToken: { nil }, isCurrentAccount: { true }, lessonsOnly: true, now: now)
        XCTAssertEqual(sent.value, ["head"])
        XCTAssertTrue(backing.lessons.isEmpty)
        XCTAssertEqual(backing.grades.count, 1)
        XCTAssertTrue(backing.dueWrites.isEmpty)
    }

    @MainActor
    func testWaitAtMostReportsWhetherTheWorkFinishedInTime() async {
        let quick = await SyncPass.waitAtMost(2) { }
        XCTAssertTrue(quick)
        let slow = await SyncPass.waitAtMost(0.05) { try? await Task.sleep(nanoseconds: 2_000_000_000) }
        XCTAssertFalse(slow)
    }

    // MARK: - Proactive refresh timer

    func testAFailedRefreshFarFromExpiryReArmsTheExpiryTimerNotA30SecondRetry() {
        let delay = RefreshSchedule.nextDelay(expiresAt: now.addingTimeInterval(3_000), now: now, afterFailure: true)
        XCTAssertEqual(delay, 2_700)
    }

    func testAFailedRefreshNearExpiryRetriesIn30Seconds() {
        XCTAssertEqual(RefreshSchedule.nextDelay(expiresAt: now.addingTimeInterval(200), now: now, afterFailure: true), 30)
        XCTAssertEqual(RefreshSchedule.nextDelay(expiresAt: now.addingTimeInterval(200), now: now, afterFailure: false), 5,
                       "a timer is always armed, never in the past")
    }

    // MARK: - Owner rules

    func testTheQueueRefusesARowWithNoOwner() {
        var saves = 0
        XCTAssertEqual(QueueAppendResult.decide(owner: nil, saved: { saves += 1; return true }, isPersistent: true), .refusedNoOwner)
        XCTAssertEqual(QueueAppendResult.decide(owner: "", saved: { saves += 1; return true }, isPersistent: true), .refusedNoOwner)
        XCTAssertEqual(saves, 0, "a refused row is never written")
        XCTAssertEqual(QueueAppendResult.decide(owner: "a", saved: { true }, isPersistent: true), .stored(onDisk: true))
    }

    /// "On disk" is about THIS save: an earlier failure does not make every later lesson read as at risk.
    func testOnDiskIsThisSavesOutcome() {
        XCTAssertEqual(QueueAppendResult.decide(owner: "a", saved: { false }, isPersistent: true), .stored(onDisk: false))
        XCTAssertEqual(QueueAppendResult.decide(owner: "a", saved: { true }, isPersistent: false), .stored(onDisk: false))
        XCTAssertTrue(QueueAppendResult.decide(owner: "a", saved: { true }, isPersistent: true).isOnDisk)
    }

    @MainActor
    func testAResumedCleanupKnowsWhoLeft() async {
        let suite = "SyncPassTests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = PendingCleanupStore(defaults: defaults)
        store.mark(.accountDeleted, userID: "a")
        XCTAssertEqual(store.pendingUserID, "a")
        let seen = TestCapture<[String?]>([])
        let lifecycle = SessionLifecycle()
        await lifecycle.resumePending(store, setRetiringUserID: { seen.value.append($0) })
        XCTAssertEqual(seen.value, ["a", nil])
        XCTAssertNil(store.pending)
        XCTAssertNil(store.pendingUserID)
    }

    // MARK: - Parked lessons

    func testAParkedLessonHoldsNothingUpAndTryAgainSendsItOnce() async {
        let policy = SyncRetryPolicy.standard
        let parked = lesson("stuck", queuedAt: now.addingTimeInterval(-60)).rescheduled(attemptCount: 20, nextAttemptAt: now.addingTimeInterval(-1))
        let next = lesson("fresh", queuedAt: now)
        XCTAssertTrue(policy.isParked(parked))
        XCTAssertEqual(QueuedLessonPolicy.blockingLessons([parked, next], userID: "a"), 1)
        XCTAssertEqual(SyncEngine.nextWakeup(lessons: [parked], grades: [], userID: "a", now: now), nil)
        let sent = TestCapture<[String]>([])
        let result = await SyncEngine.sync(pendingLessonCompletions: [parked, next], pendingReviewGrades: [], client: client(sent: sent), currentUserID: "a", now: now)
        XCTAssertEqual(sent.value, ["fresh"])
        XCTAssertFalse(result.rescheduledLessonCompletions.contains { $0.lessonID == "stuck" })

        let retried = policy.retryParked(parked)
        XCTAssertFalse(policy.isParked(retried))
        XCTAssertNil(retried.nextAttemptAt)
        XCTAssertEqual(retried.queueIdentity, parked.queueIdentity, "same row, same claimed day")
        XCTAssertNotNil(QueuedLessonPolicy.parkedMessage(count: 1))
        XCTAssertNil(QueuedLessonPolicy.parkedMessage(count: 0))
    }

    /// A week of timeouts is a weak signal, not a server that refuses the lesson: the age rule ignores them.
    func testTimeoutsNeverTriggerTheAgeRule() {
        let policy = SyncRetryPolicy.standard
        let weekLater = now.addingTimeInterval(8 * 86_400)
        XCTAssertFalse(policy.hasExhaustedRetries(failures: 5, queuedAt: now, now: weekLater, isTimeout: true))
        XCTAssertTrue(policy.hasExhaustedRetries(failures: 5, queuedAt: now, now: weekLater, isTimeout: false))
        XCTAssertTrue(policy.hasExhaustedRetries(failures: 20, queuedAt: now, now: now, isTimeout: true), "the attempt cap still holds")
    }
}
