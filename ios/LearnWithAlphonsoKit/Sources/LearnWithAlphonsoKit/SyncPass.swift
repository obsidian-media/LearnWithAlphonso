import Foundation

/// What a sync pass reads and writes. `SyncQueueStore` (app target, SwiftData) conforms; Kit tests use an
/// in-memory one. Retention goes through `QueueRetentionPlan`'s row dispositions in both.
@MainActor
public protocol SyncQueueBacking: AccountScopedQueue {
    func apply(_ result: SyncResult, now: Date)
    func lastKnownProgress() -> LessonCompletionProgress?
    func updateLastKnownProgress(_ progress: LessonCompletionProgress, synced: Bool)
    func markSyncedNow()
    func replaceLastKnownDueReviews(_ items: [ReviewItem], course: String)
}

/// One sync pass for one account: the orchestration SyncQueueStore.runSync used to hold in the app target, here
/// so it is tested.
///
/// - Another account's rows older than `AccountQueueRetention.foreignRowLifetime` are purged first.
/// - SyncEngine sends, asking `isCurrentAccount` before every send.
/// - Rows the pass did send are cleared even if the account changed meanwhile (they reached the server; sending
///   them again would be wrong). Nothing else is written then: no reschedules, no dead letters, no progress.
/// - Progress from a synced lesson or a fetch is merged with the local optimistic day while lessons remain
///   queued (QueuedLessonPolicy.merge). "Last synced" moves only when the pass reached the server.
/// - `lessonsOnly` (a live finish draining what is ahead of it) skips grades, the progress fetch and the due
///   lists, and sends the head lesson even inside its backoff.
public enum SyncPass {
    @MainActor
    @discardableResult
    public static func run(
        backing: any SyncQueueBacking,
        client: ProgressSyncClient,
        userID: String,
        activeCourse: String,
        refreshAccessToken: @escaping @Sendable () async -> String?,
        isCurrentAccount: @escaping @MainActor () -> Bool,
        lessonsOnly: Bool = false,
        now: Date = Date(),
        policy: SyncRetryPolicy = .standard,
        foreignClock: ForeignOwnerClock = ForeignOwnerClock()
    ) async -> SyncResult {
        // Signed out (or switched) before the pass even started: touch nothing, not even the purge.
        guard isCurrentAccount() else {
            return SyncResult(syncedLessonCompletions: [], syncedReviewGrades: [], lastKnownProgress: nil)
        }
        foreignClock.forget(userID)
        for owner in Set((backing.pendingLessonCompletions().map(\.ownerUserID) + backing.pendingReviewGrades().map(\.ownerUserID))
            .compactMap { $0 }) where owner != userID {
            foreignClock.markRetiredIfUnknown(owner, at: now)
        }
        let expired = AccountQueueRetention.expiredForeignRows(
            currentUserID: userID, lessons: backing.pendingLessonCompletions(), grades: backing.pendingReviewGrades(), now: now,
            retiredAt: { foreignClock.retiredAt($0) })
        if !expired.isEmpty { backing.applyRetention(expired) }

        let result = await SyncEngine.sync(
            pendingLessonCompletions: backing.pendingLessonCompletions(),
            pendingReviewGrades: lessonsOnly ? [] : backing.pendingReviewGrades(),
            client: client,
            currentUserID: userID,
            refreshAccessToken: refreshAccessToken,
            isCurrentAccount: { await isCurrentAccount() },
            ignoreHeadLessonBackoff: lessonsOnly,
            now: now,
            policy: policy)

        guard isCurrentAccount() else {
            backing.apply(SyncResult(
                syncedLessonCompletions: result.syncedLessonCompletions, syncedReviewGrades: result.syncedReviewGrades,
                lastKnownProgress: nil), now: now)
            return result
        }
        backing.apply(result, now: now)

        let sentSomething = !result.syncedLessonCompletions.isEmpty || !result.syncedReviewGrades.isEmpty
        // Parked lessons hold nothing up, so they do not keep the optimistic day either.
        let stillQueued = QueuedLessonPolicy.blockingLessons(backing.pendingLessonCompletions(), userID: userID, policy: policy) > 0
        if let synced = result.lastKnownProgress {
            // A completion always leaves the account on local days.
            let fromServer = synced.withDayBasis(synced.dayBasis ?? "local")
            backing.updateLastKnownProgress(
                QueuedLessonPolicy.merge(fetched: fromServer, local: backing.lastKnownProgress(), hasPendingLessons: stillQueued),
                synced: true)
        } else if !lessonsOnly {
            // SyncEngine only learns progress as a side effect of pushing a completion; with nothing pushed read it
            // directly so the header reflects the server, for the course on screen. Best-effort.
            let fetched = try? await client.fetchProgress(course: activeCourse)
            guard isCurrentAccount() else { return result }
            if let fetched {
                backing.updateLastKnownProgress(
                    QueuedLessonPolicy.merge(fetched: fetched, local: backing.lastKnownProgress(), hasPendingLessons: stillQueued),
                    synced: true)
            } else if sentSomething {
                backing.markSyncedNow()
            }
        }
        guard !lessonsOnly else { return result }

        // Every course's due list, so the badge and an offline Review match the course on screen. A course whose
        // fetch fails is absent, so its last good cache stays.
        let due = await SyncEngine.refreshDueReviews { course in try await client.fetchDueReviews(course: course) }
        guard isCurrentAccount() else { return result }
        for (course, items) in due { backing.replaceLastKnownDueReviews(items, course: course) }
        return result
    }

    /// A refresher bound to one account. The app's refresher refreshes whoever is signed in NOW, so a pass started
    /// for one account could carry on with the next account's token. This one answers nil unless `userID` is
    /// still the signed-in account, before and after the refresh.
    public static func accountBoundRefresher(
        for userID: String,
        currentUserID: @escaping @Sendable @MainActor () -> String?,
        refresh: @escaping @Sendable @MainActor () async -> String?
    ) -> @Sendable () async -> String? {
        return { @Sendable @MainActor () async -> String? in
            guard currentUserID() == userID else { return nil }
            let token = await refresh()
            guard currentUserID() == userID else { return nil }
            return token
        }
    }

    /// Runs `operation`, waiting at most `seconds` for it. True when it finished in time. The operation itself
    /// keeps running past the deadline (a sync pass must not be cut off mid-write); only the wait ends.
    @MainActor
    public static func waitAtMost(
        _ seconds: TimeInterval, for operation: @escaping @MainActor () async -> Void
    ) async -> Bool {
        let work = Task { @MainActor in await operation() }
        let finished = Flag()
        return await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            Task { @MainActor in
                await work.value
                if finished.claim() { continuation.resume(returning: true) }
            }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
                if finished.claim() { continuation.resume(returning: false) }
            }
        }
    }
}

/// One-shot claim, used on the main actor only.
@MainActor
private final class Flag {
    private var claimed = false
    func claim() -> Bool {
        guard !claimed else { return false }
        claimed = true
        return true
    }
}

/// When the session's next proactive refresh fires. A failed refresh retries in 30 s only when the token is
/// actually close to expiry; otherwise the expiry timer is re-armed. Before, a forced refresh that failed (on a
/// 401, with hours left on the token) replaced the expiry timer with a 30 s retry, the retry found nothing due and
/// armed nothing, and the session then had no timer at all.
public enum RefreshSchedule {
    public static let leeway: TimeInterval = 300
    public static let retryDelay: TimeInterval = 30

    public static func nextDelay(expiresAt: Date, now: Date, afterFailure: Bool) -> TimeInterval {
        let untilDue = expiresAt.timeIntervalSince(now) - leeway
        if afterFailure && untilDue <= 60 { return retryDelay }
        return max(untilDue, 5)
    }
}
