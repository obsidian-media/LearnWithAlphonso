import Foundation

/// The device's offline queue and every cached copy of one account's server state.
/// `SyncQueueStore` (app target, SwiftData) conforms; tests use an in-memory one.
@MainActor
public protocol AccountScopedQueue: AnyObject {
    func pendingLessonCompletions() -> [PendingLessonCompletion]
    func pendingReviewGrades() -> [PendingReviewGrade]
    /// Deletes and owner-stamps queued rows as `plan` says (AccountQueueRetention). Rows in neither set stay.
    func applyRetention(_ plan: QueueRetentionPlan)
    /// Removes every cached copy of the account's server state: the due-review cache, the last-known progress
    /// row and the dead letters. Never touches queued rows.
    func clearCachedAccountState()
}

/// The entitlement side of sign-out: Pro off, products and trial eligibility dropped, and
/// RevenueCat's identity logged out. `EntitlementController` and the app's
/// `EntitlementStore` conform.
@MainActor
public protocol EntitlementResetting: AnyObject {
    func reset() async
}

/// The UserDefaults keys of the app target's account-scoped caches. They live here so
/// the cache types and the cleanup read one list. Device preferences (theme, hint counts)
/// are deliberately not in it.
public enum AccountCacheKeys {
    public static let leaderboardSnapshot = "lastGlobalWeeklyLeaderboardSnapshot"
    public static let recapLeagueTier = "lastRecapLeagueTier"
    public static let leagueTier = "lastKnownLeagueTier"
    public static let nudgeCooldowns = "nudgeCooldowns"
    public static let deadLetterDismissals = DeadLetterDismissals.key
    /// The account's voice choices (VoicePrefsCache); the account copy restores them on the next sign-in.
    public static let voicePrefs = VoicePrefsCache.key
    public static let all = [leaderboardSnapshot, recapLeagueTier, leagueTier, nudgeCooldowns, deadLetterDismissals, voicePrefs]
}

public struct AccountLocalCaches {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func clear() {
        for key in AccountCacheKeys.all {
            defaults.removeObject(forKey: key)
        }
        GoalCache(defaults: defaults).clearAll()
    }
}

/// Registers the sign-out and account-deletion handlers. The app calls this exactly once,
/// at launch, with the real stores; tests call it with fakes. A handler missing here is a
/// failing test, not a code-review catch.
///
/// Order matters:
/// 1. The queue goes first, because it is the one with privacy impact and it is synchronous.
///    A process kill mid-cleanup is least likely to strand it. A sign-out keeps queued rows for the account
///    that played them; account deletion removes that account's rows (AccountQueueRetention). Either way the
///    cached copies of the account's server state go.
/// 2. The local caches.
/// 3. The widget.
/// 4. RevenueCat goes last, because it is the only step that waits on the network.
public enum AccountDataCleanup {
    public enum HandlerID {
        public static let syncQueue = "account.sync-queue"
        public static let localCaches = "account.local-caches"
        public static let widget = "account.widget"
        public static let entitlements = "account.entitlements"
    }

    @MainActor
    public static func register(
        on lifecycle: SessionLifecycle,
        queue: any AccountScopedQueue,
        retiringUserID: @escaping @MainActor () -> String?,
        caches: AccountLocalCaches,
        clearWidget: @escaping @MainActor () -> Void,
        entitlements: any EntitlementResetting
    ) {
        lifecycle.register(HandlerID.syncQueue) { event in
            queue.applyRetention(AccountQueueRetention.plan(
                event: event, retiringUserID: retiringUserID(),
                lessons: queue.pendingLessonCompletions(), grades: queue.pendingReviewGrades()))
            queue.clearCachedAccountState()
        }
        lifecycle.register(HandlerID.localCaches) { _ in caches.clear() }
        lifecycle.register(HandlerID.widget) { _ in clearWidget() }
        lifecycle.register(HandlerID.entitlements) { _ in await entitlements.reset() }
    }
}
