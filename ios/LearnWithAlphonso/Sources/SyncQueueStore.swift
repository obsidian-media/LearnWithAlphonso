import Foundation
import SwiftData
import LearnWithAlphonsoKit

/// A lesson completion queued while offline. Mirrors `PendingLessonCompletion`
/// (Kit) field-for-field -- SwiftData is Apple-only and can't live in the
/// Kit (which needs to stay buildable/testable via plain SwiftPM on
/// Windows, this project's actual local dev environment), so the plain
/// Kit struct and this persisted record are kept as two separate types,
/// converted at the boundary.
@Model
final class PendingLessonCompletionRecord {
    var lessonID: String
    var total: Int
    var missedQuestionIDs: [String]
    var course: String
    var queuedAt: Date
    var optimisticXpEstimate: Int

    init(_ pending: PendingLessonCompletion) {
        lessonID = pending.lessonID
        total = pending.total
        missedQuestionIDs = pending.missedQuestionIDs
        course = pending.course
        queuedAt = pending.queuedAt
        optimisticXpEstimate = pending.optimisticXpEstimate
    }

    var asPending: PendingLessonCompletion {
        PendingLessonCompletion(lessonID: lessonID, total: total, missedQuestionIDs: missedQuestionIDs, course: course, queuedAt: queuedAt, optimisticXpEstimate: optimisticXpEstimate)
    }
}

/// A review grade queued while offline. Same Kit/record split reasoning
/// as `PendingLessonCompletionRecord` above.
@Model
final class PendingReviewGradeRecord {
    var itemKey: String
    var answer: String
    var course: String
    var queuedAt: Date

    init(_ pending: PendingReviewGrade) {
        itemKey = pending.itemKey
        answer = pending.answer
        course = pending.course
        queuedAt = pending.queuedAt
    }

    var asPending: PendingReviewGrade {
        PendingReviewGrade(itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt)
    }
}

/// One cached `ReviewItem` from the last successful `fetchDueReviews` --
/// shown instead of an error screen when a later fetch fails or the device
/// is offline. Mirrors ReviewItem's weakness-embedded-content fields too,
/// so an offline-cached weakness item renders and grades correctly
/// without a network round trip -- see QuestionGrading.swift's
/// question(fromWeaknessItem:).
@Model
final class CachedDueReviewRecord {
    @Attribute(.unique) var itemKey: String
    var lessonId: String
    var level: String
    var ease: Double
    var intervalDays: Int
    var repetitions: Int
    var dueOn: String
    var source: String
    var weaknessDisplay: String?
    var prompt: String?
    var choices: [String]?
    var answerIndex: Int?
    var explanation: String?

    init(_ item: ReviewItem) {
        itemKey = item.itemKey
        lessonId = item.lessonId
        level = item.level
        ease = item.ease
        intervalDays = item.intervalDays
        repetitions = item.repetitions
        dueOn = item.dueOn
        source = item.source
        weaknessDisplay = item.weaknessDisplay
        prompt = item.prompt
        choices = item.choices
        answerIndex = item.answerIndex
        explanation = item.explanation
    }

    var asReviewItem: ReviewItem {
        ReviewItem(
            itemKey: itemKey, lessonId: lessonId, level: level, ease: ease,
            intervalDays: intervalDays, repetitions: repetitions, dueOn: dueOn,
            source: source, weaknessDisplay: weaknessDisplay, prompt: prompt,
            choices: choices, answerIndex: answerIndex, explanation: explanation
        )
    }
}

/// Singleton row (at most one ever exists) holding the last-known
/// account-wide progress and the last successful sync timestamp. Fields
/// are flattened rather than embedding `LessonCompletionProgress` directly
/// as a stored property, to avoid depending on SwiftData's handling of
/// nested Codable value types across schema versions -- a small amount of
/// boilerplate for a type that only ever has one row.
@Model
final class AppSyncStateRecord {
    var lastSyncedAt: Date?
    var progressXp: Int?
    var progressStreak: Int?
    var progressLongestStreak: Int?
    var progressLastActiveDate: String?
    var progressHearts: Int?
    var progressHeartsRefillAt: Double?
    var progressStreakFreezes: Int?
    var progressLeagueTier: String?

    init() {}

    var cachedProgress: LessonCompletionProgress? {
        guard let progressXp, let progressStreak, let progressLongestStreak,
              let progressLastActiveDate, let progressHearts,
              let progressStreakFreezes, let progressLeagueTier else {
            return nil
        }
        return LessonCompletionProgress(
            xp: progressXp, streak: progressStreak, longestStreak: progressLongestStreak,
            lastActiveDate: progressLastActiveDate, hearts: progressHearts,
            heartsRefillAt: progressHeartsRefillAt, streakFreezes: progressStreakFreezes,
            leagueTier: progressLeagueTier
        )
    }

    func setProgress(_ progress: LessonCompletionProgress) {
        progressXp = progress.xp
        progressStreak = progress.streak
        progressLongestStreak = progress.longestStreak
        progressLastActiveDate = progress.lastActiveDate
        progressHearts = progress.hearts
        progressHeartsRefillAt = progress.heartsRefillAt
        progressStreakFreezes = progress.streakFreezes
        progressLeagueTier = progress.leagueTier
    }
}

/// SwiftData-backed persistence for the offline sync queue (docs/
/// v2-kickoffs/01-offline-first.md). Owns all CRUD against the four
/// record types above; every caller (LessonPlayerView, ReviewQueueView,
/// RootView's sync trigger) goes through this rather than touching
/// `ModelContext` directly.
@MainActor
final class SyncQueueStore {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Pending lesson completions

    func appendLessonCompletion(_ pending: PendingLessonCompletion) {
        modelContext.insert(PendingLessonCompletionRecord(pending))
        try? modelContext.save()
    }

    func pendingLessonCompletions() -> [PendingLessonCompletion] {
        let records = (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? []
        return records.map(\.asPending)
    }

    func removeSyncedLessonCompletions(_ synced: [PendingLessonCompletion]) {
        guard !synced.isEmpty else { return }
        let records = (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? []
        for record in records where synced.contains(record.asPending) {
            modelContext.delete(record)
        }
        try? modelContext.save()
    }

    // MARK: - Pending review grades

    func appendReviewGrade(_ pending: PendingReviewGrade) {
        modelContext.insert(PendingReviewGradeRecord(pending))
        try? modelContext.save()
    }

    func pendingReviewGrades() -> [PendingReviewGrade] {
        let records = (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? []
        return records.map(\.asPending)
    }

    func removeSyncedReviewGrades(_ synced: [PendingReviewGrade]) {
        guard !synced.isEmpty else { return }
        let records = (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? []
        for record in records where synced.contains(record.asPending) {
            modelContext.delete(record)
        }
        try? modelContext.save()
    }

    // MARK: - Last-known cache (for offline display)

    func lastKnownProgress() -> LessonCompletionProgress? {
        appSyncState()?.cachedProgress
    }

    func updateLastKnownProgress(_ progress: LessonCompletionProgress) {
        let state = appSyncState() ?? insertAppSyncState()
        state.setProgress(progress)
        state.lastSyncedAt = Date()
        try? modelContext.save()
    }

    var lastSyncedAt: Date? {
        appSyncState()?.lastSyncedAt
    }

    func markSyncedNow() {
        let state = appSyncState() ?? insertAppSyncState()
        state.lastSyncedAt = Date()
        try? modelContext.save()
    }

    func lastKnownDueReviews() -> [ReviewItem] {
        let records = (try? modelContext.fetch(FetchDescriptor<CachedDueReviewRecord>())) ?? []
        return records.map(\.asReviewItem)
    }

    /// Replaces the entire cache with `items` -- called after a successful
    /// online fetch, which is always a complete, authoritative snapshot
    /// (unlike the single-item removal below, which is a local, provisional
    /// guess made while still offline).
    func replaceLastKnownDueReviews(_ items: [ReviewItem]) {
        let existing = (try? modelContext.fetch(FetchDescriptor<CachedDueReviewRecord>())) ?? []
        for record in existing {
            modelContext.delete(record)
        }
        for item in items {
            modelContext.insert(CachedDueReviewRecord(item))
        }
        try? modelContext.save()
    }

    /// Removes one item from the cache after it's been graded offline and
    /// is no longer due today -- see ReviewQueueView's offline grading path
    /// for why this only happens for a subset of offline grades (a wrong
    /// answer keeps the item due today, same as the real server behavior).
    func removeCachedDueReview(itemKey: String) {
        let descriptor = FetchDescriptor<CachedDueReviewRecord>(predicate: #Predicate { $0.itemKey == itemKey })
        guard let record = try? modelContext.fetch(descriptor).first else { return }
        modelContext.delete(record)
        try? modelContext.save()
    }

    private func appSyncState() -> AppSyncStateRecord? {
        (try? modelContext.fetch(FetchDescriptor<AppSyncStateRecord>()))?.first
    }

    private func insertAppSyncState() -> AppSyncStateRecord {
        let state = AppSyncStateRecord()
        modelContext.insert(state)
        return state
    }
}
