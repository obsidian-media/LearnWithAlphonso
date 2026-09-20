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
public enum SyncEngine {
    /// Lesson completions drain oldest-first but independently of outcome
    /// -- `complete-lesson` is replay-safe (see the design doc's "Sync
    /// conflict handling"), so a failed item doesn't block later ones.
    ///
    /// Review grades drain **strictly** oldest-first and stop at the first
    /// failure, rather than skipping ahead: `grade-review` reads and
    /// advances an item's *current* SM-2 state, so grade N+1 must be
    /// replayed against whatever state grade N actually left the item in
    /// server-side. Applying grade N+1 before N even landed (because N
    /// merely failed this attempt, not permanently) would silently corrupt
    /// that item's schedule. See the design doc's "Known limitation:
    /// concurrent-device review grading" for the one case this still can't
    /// fully protect against.
    public static func sync(
        pendingLessonCompletions: [PendingLessonCompletion],
        pendingReviewGrades: [PendingReviewGrade],
        client: ProgressSyncClient
    ) async -> SyncResult {
        var syncedCompletions: [PendingLessonCompletion] = []
        var lastKnownProgress: LessonCompletionProgress?

        for completion in pendingLessonCompletions.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            do {
                let sessionToken = try await client.startLessonSession(lessonID: completion.lessonID, course: completion.course)
                let result = try await client.completeLesson(
                    lessonID: completion.lessonID,
                    total: completion.total,
                    missedQuestionIDs: completion.missedQuestionIDs,
                    course: completion.course,
                    sessionToken: sessionToken
                )
                syncedCompletions.append(completion)
                lastKnownProgress = result.progress
            } catch {
                // Left queued; retried on the next sync trigger.
            }
        }

        var syncedGrades: [PendingReviewGrade] = []
        for grade in pendingReviewGrades.sorted(by: { $0.queuedAt < $1.queuedAt }) {
            do {
                _ = try await client.gradeReview(itemKey: grade.itemKey, answer: grade.answer, course: grade.course)
                syncedGrades.append(grade)
            } catch {
                break
            }
        }

        return SyncResult(syncedLessonCompletions: syncedCompletions, syncedReviewGrades: syncedGrades, lastKnownProgress: lastKnownProgress)
    }
}
