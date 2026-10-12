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
/// Failures are classified (LessonCompletionError): transient ones back off
/// and retry forever, only permanent ones are dead-lettered, so one bad item
/// never blocks the queue and a flaky network never loses one. Rows that belong to another account are dropped, never sent.
public enum SyncEngine {
    /// Lesson completions drain oldest-first but independently of outcome
    /// -- `complete-lesson` is replay-safe (see the design doc's "Sync
    /// conflict handling"), so a failed item doesn't block later ones.
    ///
    /// Review grades drain **strictly** oldest-first and stop at the first
    /// transient failure, rather than skipping ahead: `grade-review` reads
    /// and advances an item's *current* SM-2 state, so grade N+1 must be
    /// replayed against whatever state grade N actually left the item in
    /// server-side. Applying grade N+1 before N even landed (because N
    /// merely failed this attempt, not permanently) would silently corrupt
    /// that item's schedule. A grade the server will never accept (a 4xx)
    /// is dead-lettered and the next one continues. See the design doc's
    /// "Known limitation: concurrent-device review grading" for the one
    /// case this still can't fully protect against.
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
        var foreign: [PendingLessonCompletion] = []
        var lastKnownProgress: LessonCompletionProgress?

        for completion in pendingLessonCompletions.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            if isForeign(completion.ownerUserID) { foreign.append(completion); continue }
            if let next = completion.nextAttemptAt, next > now { continue }
            switch await service.complete(LessonCompletionRequest(completion)) {
            case let .success(result):
                synced.append(completion)
                lastKnownProgress = result.progress
            case .failure(.rejected(code: "out-of-hearts")):
                // Not a failure of the lesson: wait for a refill, without spending an attempt.
                rescheduled.append(completion.rescheduled(
                    attemptCount: completion.attemptCount,
                    nextAttemptAt: now.addingTimeInterval(HeartsEconomy.heartRefillSeconds)))
            case .failure(.unauthorized):
                continue
            case let .failure(error) where error.shouldQueue:
                // Transient: back off and keep it, however many times it fails. attemptCount only drives the backoff.
                let failures = completion.attemptCount + 1
                rescheduled.append(completion.rescheduled(
                    attemptCount: failures,
                    nextAttemptAt: now.addingTimeInterval(policy.delay(afterAttempt: failures))))
            case let .failure(error):
                dead.append(DeadLetter(item: completion, reason: error.reasonCode))
            }
        }

        var syncedGrades: [PendingReviewGrade] = []
        var rescheduledGrades: [PendingReviewGrade] = []
        var deadGrades: [DeadLetter<PendingReviewGrade>] = []
        var foreignGrades: [PendingReviewGrade] = []
        var gradeRefreshed = false

        gradeLoop: for grade in pendingReviewGrades.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            if isForeign(grade.ownerUserID) { foreignGrades.append(grade); continue }
            if let next = grade.nextAttemptAt, next > now { break gradeLoop }
            do {
                do {
                    _ = try await makeClient(tokenBox.value).gradeReview(itemKey: grade.itemKey, answer: grade.answer, course: grade.course, attemptID: grade.queueIdentity)
                } catch let ProgressSyncError.server(status, _) where status == 401 && !gradeRefreshed {
                    gradeRefreshed = true
                    guard let refreshAccessToken, let fresh = await refreshAccessToken() else { break gradeLoop }
                    tokenBox.value = fresh
                    _ = try await makeClient(fresh).gradeReview(itemKey: grade.itemKey, answer: grade.answer, course: grade.course, attemptID: grade.queueIdentity)
                }
                syncedGrades.append(grade)
            } catch {
                let classified = LessonCompletionError.classify(error)
                if classified == .unauthorized { break gradeLoop }
                if classified.shouldQueue {
                    let failures = grade.attemptCount + 1
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
            droppedForeignLessonCompletions: foreign, rescheduledReviewGrades: rescheduledGrades,
            deadLetteredReviewGrades: deadGrades, droppedForeignReviewGrades: foreignGrades)
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
