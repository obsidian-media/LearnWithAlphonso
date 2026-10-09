import XCTest
@testable import LearnWithAlphonsoKit

@MainActor
final class InMemoryAccountQueue: AccountScopedQueue {
    var lessons: [PendingLessonCompletion] = []
    var grades: [PendingReviewGrade] = []
    private(set) var clearCount = 0
    func pendingLessonCompletions() -> [PendingLessonCompletion] { lessons }
    func pendingReviewGrades() -> [PendingReviewGrade] { grades }
    func clearAll() {
        lessons.removeAll()
        grades.removeAll()
        clearCount += 1
    }
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

    @MainActor
    private func queueWithItems() -> InMemoryAccountQueue {
        let queue = InMemoryAccountQueue()
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        queue.lessons = [
            PendingLessonCompletion(lessonID: "a1l1", total: 5, answers: [LessonAnswer(questionId: "q1", answer: "hello")], course: "en", queuedAt: now, optimisticXpEstimate: 10),
            PendingLessonCompletion(lessonID: "a1l2", total: 5, answers: [], course: "fr", queuedAt: now, optimisticXpEstimate: 8),
        ]
        queue.grades = [PendingReviewGrade(itemKey: "lesson:a1l1:q1", answer: "hello", course: "en", queuedAt: now)]
        return queue
    }

    /// Sign-out while offline with queued items: the next account inherits nothing.
    @MainActor
    func testSignOutWithQueuedItemsLeavesNothingForTheNextAccount() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        XCTAssertEqual(queue.pendingLessonCompletions().count, 2)
        XCTAssertEqual(queue.pendingReviewGrades().count, 1)
        AccountDataCleanup.register(on: lifecycle, queue: queue, caches: AccountLocalCaches(defaults: defaults()),
                                    clearWidget: {}, entitlements: SpyEntitlements())

        await lifecycle.run(.signedOut)

        XCTAssertEqual(queue.pendingLessonCompletions(), [])
        XCTAssertEqual(queue.pendingReviewGrades(), [])
    }

    @MainActor
    func testAccountDeletionWithQueuedItemsLeavesNothingForTheNextAccount() async {
        let lifecycle = SessionLifecycle()
        let queue = queueWithItems()
        AccountDataCleanup.register(on: lifecycle, queue: queue, caches: AccountLocalCaches(defaults: defaults()),
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
            AccountDataCleanup.register(on: lifecycle, queue: queue, caches: AccountLocalCaches(defaults: store),
                                        clearWidget: { widgetCleared.value += 1 }, entitlements: entitlements)

            await lifecycle.run(event)

            XCTAssertEqual(lifecycle.registeredIDs, [
                AccountDataCleanup.HandlerID.syncQueue,
                AccountDataCleanup.HandlerID.localCaches,
                AccountDataCleanup.HandlerID.widget,
                AccountDataCleanup.HandlerID.entitlements,
            ], "\(event)")
            XCTAssertEqual(queue.clearCount, 1, "\(event)")
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
        store.set("canopy", forKey: "alphonsoTheme")
        store.set(2, forKey: "savedWordHintShownCount")

        AccountLocalCaches(defaults: store).clear()

        for key in AccountCacheKeys.all {
            XCTAssertNil(store.object(forKey: key), key)
        }
        XCTAssertNil(store.object(forKey: GoalCache.key(userID: "user-a", course: "en")))
        XCTAssertEqual(store.string(forKey: "alphonsoTheme"), "canopy")
        XCTAssertEqual(store.integer(forKey: "savedWordHintShownCount"), 2)
    }

    func testAccountCacheKeysAreTheAppCaches() {
        XCTAssertEqual(AccountCacheKeys.all, [
            "lastGlobalWeeklyLeaderboardSnapshot", "lastRecapLeagueTier", "lastKnownLeagueTier", "nudgeCooldowns",
            "deadLetterNotice.dismissed.v1",
        ])
    }
}
