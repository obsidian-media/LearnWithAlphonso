import Foundation

/// Drains a queue of items accumulated while offline (docs/v2-kickoffs/
/// 01-offline-first.md), by replaying them through `client` exactly like
/// the online path would have called it. Deliberately takes plain arrays
/// in and returns plain results out -- persistence (loading the pending
/// items, deleting the synced ones) is entirely the caller's job. This is
/// a departure from the design doc's own sketch, which put the whole
/// engine in the app target "since it needs NetworkMonitor" -- the actual
/// drain algorithm never needed to know about connectivity itself, only
/// *when* to call `sync` is a connectivity concern, which belongs to
/// whatever's calling this (app-target NetworkMonitor/scenePhase glue).
/// Keeping the algorithm here, decoupled from any storage mechanism, means
/// it stays covered by this Kit's normal fake-requester XCTest pattern
/// instead of needing an app-target test target this project doesn't have.
///
/// Failures are classified (LessonCompletionError): transient ones back off and retry, permanent ones are
/// dead-lettered, and an item that keeps failing transiently is dead-lettered once its retries run out
/// (SyncRetryPolicy.hasExhaustedRetries), so one poison item cannot hold the queue behind it forever. Rows that
/// belong to another account are left in place, never sent (AccountQueueRetention).
public enum SyncEngine {
    /// Both queues drain **strictly** oldest-first and stop at the first item that must wait (a transient
    /// failure, a backoff not yet over, out of hearts, no valid token), rather than skipping ahead.
    ///
    /// Lesson completions: `complete-lesson` books the day it is told about as `max(last_active_date, day)`, so
    /// a newer day landing first moves last_active_date past an older queued day, and that older day is then
    /// lost for the streak. Sending them in order is the only way every day counts.
    ///
    /// Review grades: `grade-review` reads and advances an item's *current* SM-2 state, so grade N+1 must be
    /// replayed against whatever state grade N actually left the item in server-side. Applying grade N+1 before N
    /// even landed (because N merely failed this attempt, not permanently) would silently corrupt that item's
    /// schedule. See the design doc's "Known limitation: concurrent-device review grading" for the one case this
    /// still can't fully protect against.
    ///
    /// An item the server will never accept (a 4xx) is dead-lettered and the next one continues.
    public static func sync(
        pendingLessonCompletions: [PendingLessonCompletion],
        pendingReviewGrades: [PendingReviewGrade],
        client: ProgressSyncClient,
        currentUserID: String? = nil,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        now: Date = Date(),
        policy: SyncRetryPolicy = .standard
    ) async -> SyncResult {
        func isForeign(_ owner: String?) -> Bool {
            guard let owner, let currentUserID else { return false }
            return owner != currentUserID
        }
        let tokenBox = TokenBox(client.accessToken)
        let makeClient: @Sendable (String) -> ProgressSyncClient = {
            ProgressSyncClient(supabaseURL: client.supabaseURL, anonKey: client.anonKey, accessToken: $0, requester: client.requester)
        }
        let service = LessonCompletionService(
            token: { force in
                if !force { return .token(tokenBox.value) }
                guard let refreshAccessToken, let fresh = await refreshAccessToken() else { return .unreachable }
                tokenBox.value = fresh
                return .token(fresh)
            },
            makeClient: { makeClient($0) })

        var synced: [PendingLessonCompletion] = []
        var rescheduled: [PendingLessonCompletion] = []
        var dead: [DeadLetter<PendingLessonCompletion>] = []
        var lastKnownProgress: LessonCompletionProgress?

        lessonLoop: for completion in pendingLessonCompletions.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            // Another account's row is not in this account's order at all: skip it, keep it.
            if isForeign(completion.ownerUserID) { continue }
            if let next = policy.clampedNextAttempt(completion.nextAttemptAt, now: now), next > now { break lessonLoop }
            switch await service.complete(LessonCompletionRequest(completion)) {
            case let .success(result):
                synced.append(completion)
                lastKnownProgress = result.progress
            case .failure(.rejected(code: "out-of-hearts")):
                // Not a failure of the lesson: wait for a refill, without spending an attempt. The ones behind it
                // would be refused the same way.
                rescheduled.append(completion.rescheduled(
                    attemptCount: completion.attemptCount,
                    nextAttemptAt: now.addingTimeInterval(HeartsEconomy.heartRefillSeconds)))
                break lessonLoop
            case .failure(.unauthorized):
                break lessonLoop
            case .failure(.offline):
                // No connection is not the server struggling, so it earns no growing backoff: the item waits the
                // shortest delay and its failure count is left alone. Backing off here left a lesson finished on
                // a train unsynced for up to hours after the phone was back online.
                rescheduled.append(completion.rescheduled(
                    attemptCount: completion.attemptCount,
                    nextAttemptAt: now.addingTimeInterval(policy.baseDelay)))
                break lessonLoop
            case let .failure(error) where error.shouldQueue:
                let failures = completion.attemptCount + 1
                if policy.hasExhaustedRetries(failures: failures, queuedAt: completion.queuedAt, now: now) {
                    dead.append(DeadLetter(item: completion, reason: SyncRetryPolicy.exhaustedReason))
                    continue lessonLoop
                }
                rescheduled.append(completion.rescheduled(
                    attemptCount: failures,
                    nextAttemptAt: now.addingTimeInterval(policy.delay(afterAttempt: failures))))
                break lessonLoop
            case let .failure(error):
                dead.append(DeadLetter(item: completion, reason: error.reasonCode))
            }
        }

        var syncedGrades: [PendingReviewGrade] = []
        var rescheduledGrades: [PendingReviewGrade] = []
        var deadGrades: [DeadLetter<PendingReviewGrade>] = []
        var gradeRefreshed = false

        gradeLoop: for grade in pendingReviewGrades.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            if isForeign(grade.ownerUserID) { continue }
            if let next = policy.clampedNextAttempt(grade.nextAttemptAt, now: now), next > now { break gradeLoop }
            do {
                do {
                    _ = try await makeClient(tokenBox.value).gradeReview(grade)
                } catch let ProgressSyncError.server(status, _) where status == 401 && !gradeRefreshed {
                    gradeRefreshed = true
                    guard let refreshAccessToken, let fresh = await refreshAccessToken() else { break gradeLoop }
                    tokenBox.value = fresh
                    _ = try await makeClient(fresh).gradeReview(grade)
                }
                syncedGrades.append(grade)
            } catch {
                let classified = LessonCompletionError.classify(error)
                if classified == .unauthorized { break gradeLoop }
                if classified == .offline {
                    // Same as a lesson completion: no connection earns the shortest wait and no backoff growth.
                    rescheduledGrades.append(grade.rescheduled(
                        attemptCount: grade.attemptCount,
                        nextAttemptAt: now.addingTimeInterval(policy.baseDelay)))
                    break gradeLoop
                }
                if classified.shouldQueue {
                    let failures = grade.attemptCount + 1
                    if policy.hasExhaustedRetries(failures: failures, queuedAt: grade.queuedAt, now: now) {
                        // A grade that has failed this long is poison, not unlucky: let the ones behind it through.
                        deadGrades.append(DeadLetter(item: grade, reason: SyncRetryPolicy.exhaustedReason))
                        continue gradeLoop
                    }
                    rescheduledGrades.append(grade.rescheduled(
                        attemptCount: failures,
                        nextAttemptAt: now.addingTimeInterval(policy.delay(afterAttempt: failures))))
                    break gradeLoop
                }
                deadGrades.append(DeadLetter(item: grade, reason: classified.reasonCode))
            }
        }

        return SyncResult(
            syncedLessonCompletions: synced, syncedReviewGrades: syncedGrades, lastKnownProgress: lastKnownProgress,
            rescheduledLessonCompletions: rescheduled, deadLetteredLessonCompletions: dead,
            rescheduledReviewGrades: rescheduledGrades, deadLetteredReviewGrades: deadGrades)
    }

    /// When the next `sync` pass could send something for `userID`; nil means there is nothing to wake for.
    /// Mirrors `sync`: each queue is strictly ordered, so only its oldest row of this account counts (nothing
    /// behind it can go first), and a retry time is read clamped like `sync` reads it. Rows with no owner (queued
    /// by an older build) are synced as the current account's, so they count too.
    public static func nextWakeup(
        lessons: [PendingLessonCompletion],
        grades: [PendingReviewGrade],
        userID: String,
        now: Date = Date(),
        policy: SyncRetryPolicy = .standard
    ) -> Date? {
        let mine: (String?) -> Bool = { $0 == nil || $0 == userID }
        let oldestLesson = lessons.filter { mine($0.ownerUserID) }.min { $0.queuedAt < $1.queuedAt }
        let oldestGrade = grades.filter { mine($0.ownerUserID) }.min { $0.queuedAt < $1.queuedAt }
        let dates = [
            oldestLesson.map { policy.clampedNextAttempt($0.nextAttemptAt, now: now) ?? now },
            oldestGrade.map { policy.clampedNextAttempt($0.nextAttemptAt, now: now) ?? now },
        ].compactMap { $0 }
        return dates.min()
    }

    /// The courses whose due-review cache the app keeps.
    public static let reviewCourses = ["en", "fr", "es"]

    /// Fetches each course's due list. A course whose fetch fails is absent from the result, so the caller
    /// keeps that course's last good cache instead of blanking it.
    public static func refreshDueReviews(
        courses: [String] = reviewCourses,
        fetch: @Sendable (String) async throws -> DueReviews
    ) async -> [String: [ReviewItem]] {
        var out: [String: [ReviewItem]] = [:]
        for course in courses {
            if let due = try? await fetch(course) { out[course] = due.due }
        }
        return out
    }
}

/// The current access token, replaced after a refresh. Mutated only from this sequential sync pass.
private final class TokenBox: @unchecked Sendable {
    var value: String
    init(_ value: String) { self.value = value }
}
