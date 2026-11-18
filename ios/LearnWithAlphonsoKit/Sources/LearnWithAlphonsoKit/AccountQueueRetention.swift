import Foundation

/// What happens to the offline queue when the signed-in account leaves this device.
///
/// Sign-out (by the learner, or forced: a refresh token the server rejected, an Apple ID that stopped using the
/// app) used to delete every queued lesson and review answer, so a learner who finished lessons on a train and
/// then signed out lost them without a word. Now:
/// - **Sign-out keeps the queue.** Every row stays, tagged with the account that played it, and syncs when
///   that account signs back in on this device. SyncEngine never sends, and the Learn tab never counts, a row
///   another account owns, so the next account still neither sees nor sends them.
/// - **Account deletion still removes** the deleted account's rows. Rows another account left here stay theirs.
///
/// A row with no owner (queued by a build before owners were recorded) would be adopted by whoever syncs
/// next, so it is stamped with the leaving account, or deleted when that account is unknown (a cleanup resumed
/// after a process kill).
public enum AccountQueueRetention {
    public static func plan(
        event: SessionLifecycle.Event,
        retiringUserID: String?,
        lessons: [PendingLessonCompletion],
        grades: [PendingReviewGrade]
    ) -> QueueRetentionPlan {
        var plan = QueueRetentionPlan(owner: retiringUserID)
        func decide(owner: String?, identity: String, delete: inout Set<String>, tag: inout Set<String>) {
            switch event {
            case .signedOut:
                guard owner == nil else { return }
                if retiringUserID == nil { delete.insert(identity) } else { tag.insert(identity) }
            case .accountDeleted:
                if retiringUserID == nil || owner == nil || owner == retiringUserID { delete.insert(identity) }
            }
        }
        for lesson in lessons {
            decide(owner: lesson.ownerUserID, identity: lesson.queueIdentity,
                   delete: &plan.deleteLessonIdentities, tag: &plan.tagLessonIdentities)
        }
        for grade in grades {
            decide(owner: grade.ownerUserID, identity: grade.queueIdentity,
                   delete: &plan.deleteGradeIdentities, tag: &plan.tagGradeIdentities)
        }
        return plan
    }
}

/// Rows to delete and unowned rows to stamp with `owner`, matched by `queueIdentity`. Rows in neither set are
/// left exactly as they are.
public struct QueueRetentionPlan: Sendable, Equatable {
    public let owner: String?
    public var deleteLessonIdentities: Set<String> = []
    public var tagLessonIdentities: Set<String> = []
    public var deleteGradeIdentities: Set<String> = []
    public var tagGradeIdentities: Set<String> = []

    public init(owner: String?) {
        self.owner = owner
    }
}

extension PendingLessonCompletion {
    public func owned(by owner: String) -> PendingLessonCompletion {
        PendingLessonCompletion(
            lessonID: lessonID, total: total, answers: answers, course: course, queuedAt: queuedAt,
            optimisticXpEstimate: optimisticXpEstimate, ownerUserID: owner, sessionToken: sessionToken,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}

extension PendingReviewGrade {
    public func owned(by owner: String) -> PendingReviewGrade {
        PendingReviewGrade(
            itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt,
            expectedDueOn: expectedDueOn, expectedLastReviewedAt: expectedLastReviewedAt, ownerUserID: owner,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}
