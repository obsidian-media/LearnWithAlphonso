import Foundation

/// A lesson completion attempted while offline, queued for a later sync.
/// `optimisticXpEstimate` is a naive client-side guess (`ProgressMath`'s
/// `computeXpGain(correct:total:)` against this attempt alone) -- it
/// deliberately does NOT account for complete-lesson's real replay-safety
/// rule (XP is only the delta over the current server-side best score for
/// this lesson), since the client has no local history of past attempts to
/// replicate that against. Never trust this as authoritative; it exists
/// only so the offline finish screen can show *something* instead of a
/// blank "?", and gets corrected once the real sync result comes back.
public struct PendingLessonCompletion: Sendable, Equatable {
    public let lessonID: String
    public let total: Int
    /// §0.1-d #6: was `missedQuestionIDs: [String]`, a claimed pass/fail the
    /// server trusted outright. Now every real question's raw submission,
    /// so a queued-offline completion re-grades through the same real
    /// answer key as an online one once it syncs -- see LessonAnswer.
    public let answers: [LessonAnswer]
    public let course: String
    public let queuedAt: Date
    public let optimisticXpEstimate: Int
    /// The account that played this lesson. Nil only for rows written before the owner was recorded; the
    /// first account to sync adopts those.
    public let ownerUserID: String?
    /// The start-lesson-session token from when the lesson opened, if it was online then.
    public let sessionToken: String?
    public let attemptCount: Int
    public let nextAttemptAt: Date?

    public init(
        lessonID: String, total: Int, answers: [LessonAnswer], course: String, queuedAt: Date, optimisticXpEstimate: Int,
        ownerUserID: String? = nil, sessionToken: String? = nil, attemptCount: Int = 0, nextAttemptAt: Date? = nil
    ) {
        self.lessonID = lessonID
        self.total = total
        self.answers = answers
        self.course = course
        self.queuedAt = queuedAt
        self.optimisticXpEstimate = optimisticXpEstimate
        self.ownerUserID = ownerUserID
        self.sessionToken = sessionToken
        self.attemptCount = attemptCount
        self.nextAttemptAt = nextAttemptAt
    }

    /// Stable across retries (attempt fields change; this does not). The store matches rows by it.
    public var queueIdentity: String { "\(lessonID)|\(course)|\(queuedAt.timeIntervalSince1970)" }

    public func rescheduled(attemptCount: Int, nextAttemptAt: Date) -> PendingLessonCompletion {
        PendingLessonCompletion(
            lessonID: lessonID, total: total, answers: answers, course: course, queuedAt: queuedAt,
            optimisticXpEstimate: optimisticXpEstimate, ownerUserID: ownerUserID, sessionToken: sessionToken,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}

/// A review grade submitted while offline, queued for a later sync. Order
/// matters here in a way it doesn't for lesson completions -- see
/// `SyncEngine.sync`'s doc comment.
public struct PendingReviewGrade: Sendable, Equatable {
    public let itemKey: String
    public let answer: String
    public let course: String
    public let queuedAt: Date
    public let ownerUserID: String?
    public let attemptCount: Int
    public let nextAttemptAt: Date?

    public init(
        itemKey: String, answer: String, course: String, queuedAt: Date,
        ownerUserID: String? = nil, attemptCount: Int = 0, nextAttemptAt: Date? = nil
    ) {
        self.itemKey = itemKey
        self.answer = answer
        self.course = course
        self.queuedAt = queuedAt
        self.ownerUserID = ownerUserID
        self.attemptCount = attemptCount
        self.nextAttemptAt = nextAttemptAt
    }

    public var queueIdentity: String { "\(itemKey)|\(course)|\(queuedAt.timeIntervalSince1970)" }

    public func rescheduled(attemptCount: Int, nextAttemptAt: Date) -> PendingReviewGrade {
        PendingReviewGrade(
            itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt, ownerUserID: ownerUserID,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}

/// What `SyncEngine.sync` actually managed to drain in one pass. Items not
/// present in any list here are untouched (still queued, waiting out a
/// backoff, or unauthorized this pass) and stay as they are.
public struct SyncResult: Sendable, Equatable {
    public let syncedLessonCompletions: [PendingLessonCompletion]
    public let syncedReviewGrades: [PendingReviewGrade]
    /// The most recent real `LessonCompletionProgress` a synced lesson
    /// completion returned, if any completions synced this pass -- the
    /// caller should persist this as the new "last known progress" cache.
    public let lastKnownProgress: LessonCompletionProgress?
    /// Failed for a transient reason: keep the row, with its new attempt count and next attempt time.
    public let rescheduledLessonCompletions: [PendingLessonCompletion]
    /// Can never succeed (rejected by the server, or out of attempts): move out of the queue.
    public let deadLetteredLessonCompletions: [DeadLetter<PendingLessonCompletion>]
    /// Belong to another account: delete, never send.
    public let droppedForeignLessonCompletions: [PendingLessonCompletion]
    public let rescheduledReviewGrades: [PendingReviewGrade]
    public let deadLetteredReviewGrades: [DeadLetter<PendingReviewGrade>]
    public let droppedForeignReviewGrades: [PendingReviewGrade]

    public init(
        syncedLessonCompletions: [PendingLessonCompletion],
        syncedReviewGrades: [PendingReviewGrade],
        lastKnownProgress: LessonCompletionProgress?,
        rescheduledLessonCompletions: [PendingLessonCompletion] = [],
        deadLetteredLessonCompletions: [DeadLetter<PendingLessonCompletion>] = [],
        droppedForeignLessonCompletions: [PendingLessonCompletion] = [],
        rescheduledReviewGrades: [PendingReviewGrade] = [],
        deadLetteredReviewGrades: [DeadLetter<PendingReviewGrade>] = [],
        droppedForeignReviewGrades: [PendingReviewGrade] = []
    ) {
        self.syncedLessonCompletions = syncedLessonCompletions
        self.syncedReviewGrades = syncedReviewGrades
        self.lastKnownProgress = lastKnownProgress
        self.rescheduledLessonCompletions = rescheduledLessonCompletions
        self.deadLetteredLessonCompletions = deadLetteredLessonCompletions
        self.droppedForeignLessonCompletions = droppedForeignLessonCompletions
        self.rescheduledReviewGrades = rescheduledReviewGrades
        self.deadLetteredReviewGrades = deadLetteredReviewGrades
        self.droppedForeignReviewGrades = droppedForeignReviewGrades
    }
}
