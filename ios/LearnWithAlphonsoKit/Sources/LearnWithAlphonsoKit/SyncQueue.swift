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
    public let missedQuestionIDs: [String]
    public let course: String
    public let queuedAt: Date
    public let optimisticXpEstimate: Int

    public init(lessonID: String, total: Int, missedQuestionIDs: [String], course: String, queuedAt: Date, optimisticXpEstimate: Int) {
        self.lessonID = lessonID
        self.total = total
        self.missedQuestionIDs = missedQuestionIDs
        self.course = course
        self.queuedAt = queuedAt
        self.optimisticXpEstimate = optimisticXpEstimate
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

    public init(itemKey: String, answer: String, course: String, queuedAt: Date) {
        self.itemKey = itemKey
        self.answer = answer
        self.course = course
        self.queuedAt = queuedAt
    }
}

/// What `SyncEngine.sync` actually managed to drain in one pass. Items not
/// present here (i.e. still present in whatever queue the caller fetched
/// them from) failed and should stay queued for the next sync attempt.
public struct SyncResult: Sendable, Equatable {
    public let syncedLessonCompletions: [PendingLessonCompletion]
    public let syncedReviewGrades: [PendingReviewGrade]
    /// The most recent real `LessonCompletionProgress` a synced lesson
    /// completion returned, if any completions synced this pass -- the
    /// caller should persist this as the new "last known progress" cache.
    public let lastKnownProgress: LessonCompletionProgress?

    public init(syncedLessonCompletions: [PendingLessonCompletion], syncedReviewGrades: [PendingReviewGrade], lastKnownProgress: LessonCompletionProgress?) {
        self.syncedLessonCompletions = syncedLessonCompletions
        self.syncedReviewGrades = syncedReviewGrades
        self.lastKnownProgress = lastKnownProgress
    }
}
