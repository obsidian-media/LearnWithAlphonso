import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

@MainActor
final class InMemoryAccountQueue: AccountScopedQueue {
    var lessons: [PendingLessonCompletion] = []
    var grades: [PendingReviewGrade] = []
    private(set) var cachedStateClearCount = 0
    func pendingLessonCompletions() -> [PendingLessonCompletion] { lessons }
    func pendingReviewGrades() -> [PendingReviewGrade] { grades }
    /// Through the plan's own row dispositions, the ones SyncQueueStore applies to its records.
    func applyRetention(_ plan: QueueRetentionPlan) {
        let kept = plan.applied(lessons: lessons, grades: grades)
        lessons = kept.lessons
        grades = kept.grades
    }
    func clearCachedAccountState() { cachedStateClearCount += 1 }
}

@MainActor
final class SpyEntitlements: EntitlementResetting {
    private(set) var resetCount = 0
    func reset() async { resetCount += 1 }
}

final class AccountDataCleanupTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let suite = "AccountDataCleanupTests-" + UUID().uuidString
        let d = UserDefaults(suiteName: suite)!
        d.removePersistentDomain(forName: suite)
        return d
    }

    private let fixedNow = Date(timeIntervalSince1970: 1_790_000_000)

    /// user-a's queue as an older build and this one left it: one lesson with no owner, the rest user-a's.
    @MainActor
    private func queueWithItems() -> InMemoryAccountQueue {
        let queue = InMemoryAccountQueue()
        let now = fixedNow
        queue.lessons = [
            PendingLessonCompletion(lessonID: "a1l1", total: 5, answers: [LessonAnswer(questionId: "q1", answer: "hello")], course: "en", queuedAt: now, optimisticXpEstimate: 10),
            PendingLessonCompletion(lessonID: "a1l2", total: 5, answers: [], course: "fr", queuedAt: now.addingTimeInterval(1), optimisticXpEstimate: 8, ownerUserID: "user-a"),
        ]
        queue.grades = [PendingReviewGrade(itemKey: "lesson:a1l1:q1", answer: "hello", course: "en", queuedAt: now, ownerUserID: "user-a")]
        return queue
    }

    /// What one real SyncEngine pass sends for `userID`, in order.
    private func sentIDs(_ lessons: [PendingLessonCompletion], _ grades: [PendingReviewGrade], as userID: String) async -> [String] {
        let sent = TestCapture<[String]>([])
        let client = ProgressSyncClient(supabaseURL: URL(string: "https://example.supabase.co")!, anonKey: "k", accessToken: "t") { request in
            let url = request.url!
            func ok(_ body: Any) -> (Data, URLResponse) {
                (try! JSONSerialization.data(withJSONObject: body), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            if url.absoluteString.hasSuffix("start-lesson-session") { return ok(["token": "tok"]) }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            sent.value.append((body["lessonId"] ?? body["itemKey"]) as! String)
            if body["itemKey"] != nil { return ok(["retired": false, "dueOn": "2026-10-09"]) }
            return ok(["xpGain": 1, "newlyUnlocked": [] as [String], "heartsBonus": NSNull(), "progress": [
                "xp": 1, "streak": 1, "longestStreak": 1, "lastActiveDate": "2026-09-21", "hearts": 5,
                "heartsRefillAt": NSNull(), "streakFreezes": 0, "leagueTier": "bronze"] as [String: Any]])
        }
        _ = await SyncEngine.sync(pendingLessonCompletions: lessons, pendingReviewGrades: grades, client: client,
                                  currentUserID: userID, now: fixedNow.addingTimeInterval(60))
        return sent.value
    }

    /// Sign-out with queued items (by the learner, or forced: a rejected refresh, a revoked Apple ID) keeps
    /// every row for the account that played it. The next account never sends them; the same account signing
    /// back in sends them all.
    @MainActor
    func testSignOutKeepsQueuedItemsForTheSameAccountAndNeverForTheNextOne() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        AccountDataCleanup.register(on: lifecycle, queue: queue, retiringUserID: { "user-a" },
                                    caches: AccountLocalCaches(defaults: defaults()),
                                    clearWidget: {}, entitlements: SpyEntitlements())

        await lifecycle.run(.signedOut)

        XCTAssertEqual(queue.pendingLessonCompletions().count, 2, "nothing is deleted")
        XCTAssertEqual(queue.pendingReviewGrades().count, 1)
        XCTAssertEqual(Set(queue.pendingLessonCompletions().map(\.ownerUserID)), ["user-a"],
                       "the unowned row is stamped, so the next account cannot adopt it")
        XCTAssertEqual(queue.cachedStateClearCount, 1, "the cached server state still goes")

        let sentByNext = await sentIDs(queue.lessons, queue.grades, as: "user-b")
        XCTAssertEqual(sentByNext, [], "the next account never sends them")
        let sentBySame = await sentIDs(queue.lessons, queue.grades, as: "user-a")
        XCTAssertEqual(sentBySame, ["a1l1", "a1l2", "lesson:a1l1:q1"])
    }

    /// A cleanup resumed after a process kill does not know who left: an unowned row could then be adopted by
    /// anyone, so it goes. Owned rows stay.
    @MainActor
    func testASignOutWithAnUnknownAccountDropsOnlyUnownedRows() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        AccountDataCleanup.register(on: lifecycle, queue: queue, retiringUserID: { nil },
                                    caches: AccountLocalCaches(defaults: defaults()),
                                    clearWidget: {}, entitlements: SpyEntitlements())

        await lifecycle.run(.signedOut)

        XCTAssertEqual(queue.pendingLessonCompletions().map(\.lessonID), ["a1l2"])
        XCTAssertEqual(queue.pendingReviewGrades().count, 1)
    }

    /// Deletion removes the deleted account's rows (and unowned ones), never another account's.
    @MainActor
    func testAccountDeletionRemovesThatAccountsQueuedItemsAndKeepsAnotherAccounts() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        let theirs = PendingLessonCompletion(lessonID: "b1l1", total: 5, answers: [], course: "es", queuedAt: fixedNow, optimisticXpEstimate: 3, ownerUserID: "user-b")
        queue.lessons.append(theirs)
        AccountDataCleanup.register(on: lifecycle, queue: queue, retiringUserID: { "user-a" },
                                    caches: AccountLocalCaches(defaults: defaults()),
                                    clearWidget: {}, entitlements: SpyEntitlements())

        await lifecycle.run(.accountDeleted)

        XCTAssertEqual(queue.pendingLessonCompletions(), [theirs])
        XCTAssertEqual(queue.pendingReviewGrades(), [])
    }

    @MainActor
    func testAccountDeletionWithAnUnknownAccountLeavesNothing() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        AccountDataCleanup.register(on: lifecycle, queue: queue, retiringUserID: { nil },
                                    caches: AccountLocalCaches(defaults: defaults()),
                                    clearWidget: {}, entitlements: SpyEntitlements())

        await lifecycle.run(.accountDeleted)

        XCTAssertEqual(queue.pendingLessonCompletions(), [])
        XCTAssertEqual(queue.pendingReviewGrades(), [])
    }

    @MainActor
    func testEveryHandlerRunsForBothEventsAndTheQueueGoesFirst() async {
        for event in [SessionLifecycle.Event.signedOut, .accountDeleted] {
            let lifecycle = SessionLifecycle()
            let queue = queueWithItems()
            let entitlements = SpyEntitlements()
            let widgetCleared = TestCapture(0)
            let store = defaults()
            store.set("gold", forKey: AccountCacheKeys.leagueTier)
            AccountDataCleanup.register(on: lifecycle, queue: queue, retiringUserID: { "user-a" }, caches: AccountLocalCaches(defaults: store),
                                        clearWidget: { widgetCleared.value += 1 }, entitlements: entitlements)

            await lifecycle.run(event)

            XCTAssertEqual(lifecycle.registeredIDs, [
                AccountDataCleanup.HandlerID.syncQueue,
                AccountDataCleanup.HandlerID.localCaches,
                AccountDataCleanup.HandlerID.widget,
                AccountDataCleanup.HandlerID.entitlements,
            ], "\(event)")
            XCTAssertEqual(queue.cachedStateClearCount, 1, "\(event)")
            XCTAssertNil(store.string(forKey: AccountCacheKeys.leagueTier), "\(event)")
            XCTAssertEqual(widgetCleared.value, 1, "\(event)")
            XCTAssertEqual(entitlements.resetCount, 1, "\(event)")
        }
    }

    func testLocalCachesClearEveryAccountKeyAndKeepDevicePreferences() {
        let store = defaults()
        store.set(Data([1, 2]), forKey: AccountCacheKeys.leaderboardSnapshot)
        store.set("silver", forKey: AccountCacheKeys.recapLeagueTier)
        store.set("gold", forKey: AccountCacheKeys.leagueTier)
        store.set(Data([3]), forKey: AccountCacheKeys.nudgeCooldowns)
        store.set(Data([4]), forKey: GoalCache.key(userID: "user-a", course: "en"))
        store.set("royal", forKey: "alphonsoTheme")
        store.set(2, forKey: "savedWordHintShownCount")

        AccountLocalCaches(defaults: store).clear()

        for key in AccountCacheKeys.all {
            XCTAssertNil(store.object(forKey: key), key)
        }
        XCTAssertNil(store.object(forKey: GoalCache.key(userID: "user-a", course: "en")))
        XCTAssertEqual(store.string(forKey: "alphonsoTheme"), "royal")
        XCTAssertEqual(store.integer(forKey: "savedWordHintShownCount"), 2)
    }

    func testAccountCacheKeysAreTheAppCaches() {
        XCTAssertEqual(AccountCacheKeys.all, [
            "lastGlobalWeeklyLeaderboardSnapshot", "lastRecapLeagueTier", "lastKnownLeagueTier", "nudgeCooldowns",
            "deadLetterNotice.dismissed.v1", "voicePrefs.v1", "lastKnownStreakDayBasis",
        ])
    }
}
