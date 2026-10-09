import Foundation

/// The device's offline queue and every cached copy of one account's server state.
/// `SyncQueueStore` (app target, SwiftData) conforms; tests use an in-memory one.
@MainActor
public protocol AccountScopedQueue: AnyObject {
    func pendingLessonCompletions() -> [PendingLessonCompletion]
    func pendingReviewGrades() -> [PendingReviewGrade]
    /// Removes every queued item AND every cached copy of this account's server state.
    func clearAll()
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
    public static let all = [leaderboardSnapshot, recapLeagueTier, leagueTier, nudgeCooldowns, deadLetterDismissals]
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
///    A process kill mid-cleanup is least likely to strand it.
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
        caches: AccountLocalCaches,
        clearWidget: @escaping @MainActor () -> Void,
        entitlements: any EntitlementResetting
    ) {
        lifecycle.register(HandlerID.syncQueue) { _ in queue.clearAll() }
        lifecycle.register(HandlerID.localCaches) { _ in caches.clear() }
        lifecycle.register(HandlerID.widget) { _ in clearWidget() }
        lifecycle.register(HandlerID.entitlements) { _ in await entitlements.reset() }
    }
}
