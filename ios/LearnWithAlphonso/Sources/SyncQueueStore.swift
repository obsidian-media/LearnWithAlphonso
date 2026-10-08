import Foundation
import Observation
import SwiftData
import LearnWithAlphonsoKit

/// A lesson completion queued while offline. Mirrors `PendingLessonCompletion`
/// (Kit) field-for-field -- SwiftData is Apple-only and can't live in the
/// Kit (which needs to stay buildable/testable via plain SwiftPM on
/// Windows, this project's actual local dev environment), so the plain
/// Kit struct and this persisted record are kept as two separate types,
/// converted at the boundary.
///
/// `answers` (§0.1-d #6, `[LessonAnswer]` on the Kit side) is stored as two
/// parallel primitive arrays rather than an array of a nested struct --
/// same reasoning `AppSyncStateRecord` below already gives for flattening
/// `LessonCompletionProgress`: avoid depending on SwiftData's handling of
/// nested Codable value types across schema versions.
@Model
final class PendingLessonCompletionRecord {
    var lessonID: String
    var total: Int
    var answerQuestionIDs: [String]
    var answerTexts: [String]
    var course: String
    var queuedAt: Date
    var optimisticXpEstimate: Int
    // Schema V2 additions. All optional, so a lightweight migration needs no defaults.
    var ownerUserID: String?
    var sessionToken: String?
    var attemptCount: Int?
    var nextAttemptAt: Date?

    init(_ pending: PendingLessonCompletion) {
        lessonID = pending.lessonID
        total = pending.total
        answerQuestionIDs = pending.answers.map(\.questionId)
        answerTexts = pending.answers.map(\.answer)
        course = pending.course
        queuedAt = pending.queuedAt
        optimisticXpEstimate = pending.optimisticXpEstimate
        ownerUserID = pending.ownerUserID
        sessionToken = pending.sessionToken
        attemptCount = pending.attemptCount
        nextAttemptAt = pending.nextAttemptAt
    }

    var asPending: PendingLessonCompletion {
        PendingLessonCompletion(
            lessonID: lessonID,
            total: total,
            answers: zip(answerQuestionIDs, answerTexts).map { LessonAnswer(questionId: $0, answer: $1) },
            course: course,
            queuedAt: queuedAt,
            optimisticXpEstimate: optimisticXpEstimate,
            ownerUserID: ownerUserID,
            sessionToken: sessionToken,
            attemptCount: attemptCount ?? 0,
            nextAttemptAt: nextAttemptAt
        )
    }

    var queueIdentity: String { "\(lessonID)|\(course)|\(queuedAt.timeIntervalSince1970)" }

    func apply(_ pending: PendingLessonCompletion) {
        attemptCount = pending.attemptCount
        nextAttemptAt = pending.nextAttemptAt
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
    // Schema V2 additions (optional, like the lesson record's).
    var ownerUserID: String?
    var attemptCount: Int?
    var nextAttemptAt: Date?

    init(_ pending: PendingReviewGrade) {
        itemKey = pending.itemKey
        answer = pending.answer
        course = pending.course
        queuedAt = pending.queuedAt
        ownerUserID = pending.ownerUserID
        attemptCount = pending.attemptCount
        nextAttemptAt = pending.nextAttemptAt
    }

    var asPending: PendingReviewGrade {
        PendingReviewGrade(
            itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt,
            ownerUserID: ownerUserID, attemptCount: attemptCount ?? 0, nextAttemptAt: nextAttemptAt)
    }

    var queueIdentity: String { "\(itemKey)|\(course)|\(queuedAt.timeIntervalSince1970)" }

    func apply(_ pending: PendingReviewGrade) {
        attemptCount = pending.attemptCount
        nextAttemptAt = pending.nextAttemptAt
    }
}

/// One cached due `ReviewItem` per course, from the last successful `fetchDueReviews` -- shown instead of an
/// error screen when a later fetch fails or the device is offline. `review_items` is unique on (user, item_key,
/// language), so the previous cache, unique on item_key alone, merged two courses' rows and showed another
/// course's items offline. Mirrors ReviewItem's weakness-embedded-content fields too, so an offline-cached
/// weakness item renders and grades correctly without a network round trip -- see QuestionGrading.swift's
/// question(fromWeaknessItem:).
@Model
final class CachedCourseDueReviewRecord {
    @Attribute(.unique) var cacheKey: String
    var course: String
    var itemKey: String
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

    static func key(course: String, itemKey: String) -> String { "\(course)|\(itemKey)" }

    init(_ item: ReviewItem, course: String) {
        cacheKey = Self.key(course: course, itemKey: item.itemKey)
        self.course = course
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

/// A queued item that can never succeed (rejected by the server, or failed too many times). Moved here so it
/// stops blocking the queue. Kept (newest 50) for diagnosis; cleared on sign-out.
@Model
final class SyncDeadLetterRecord {
    var kind: String          // "lesson" | "grade"
    var identity: String
    var reason: String
    var ownerUserID: String?
    var failedAt: Date

    init(kind: String, identity: String, reason: String, ownerUserID: String?, failedAt: Date) {
        self.kind = kind
        self.identity = identity
        self.reason = reason
        self.ownerUserID = ownerUserID
        self.failedAt = failedAt
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
@Observable
final class SyncQueueStore: AccountScopedQueue {
    @ObservationIgnored private let modelContext: ModelContext

    /// Bumped whenever the cached due-review list changes. SwiftUI cannot see
    /// a SwiftData `fetch` made inside `body`, so a view that reads the count
    /// through `lastKnownDueReviews()` never repaints when the cache changes:
    /// the Learn tab badge stayed at 2, then 3, after the queue was cleared
    /// (BACKLOG 0.0-z #5). Reading this through `dueReviewCount` is what makes
    /// the badge track the cache.
    private(set) var dueReviewRevision = 0

    /// The account the badge counts for: remembered from the last sync, because the active course is stored per
    /// account. Nil (never synced this launch) counts English.
    @ObservationIgnored private var badgeUserID: String?
    /// Launch, foreground and reconnect each trigger a sync; two overlapping passes would send the same grades twice.
    @ObservationIgnored private var isSyncing = false
    @ObservationIgnored private var lastBadgeCourse = "en"
    @ObservationIgnored private var defaultsObserver: NSObjectProtocol?

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        // The badge counts the ACTIVE course; repaint it when the learner switches course.
        defaultsObserver = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                let current = self.badgeCourse
                if current != self.lastBadgeCourse {
                    self.lastBadgeCourse = current
                    self.dueReviewRevision += 1
                }
            }
        }
    }

    private var badgeCourse: String {
        ActiveCoursePreference.load(for: badgeUserID).wireCode
    }

    /// Due reviews in the offline cache for the active course, observable: depends on `dueReviewRevision`, so a
    /// view reading it re-renders on every change.
    var dueReviewCount: Int {
        _ = dueReviewRevision
        return lastKnownDueReviews(course: badgeCourse).count
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

    // MARK: - Pending review grades

    func appendReviewGrade(_ pending: PendingReviewGrade) {
        modelContext.insert(PendingReviewGradeRecord(pending))
        try? modelContext.save()
    }

    func pendingReviewGrades() -> [PendingReviewGrade] {
        let records = (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? []
        return records.map(\.asPending)
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
        // Every caller of this function (LessonPlayerView after a
        // completion, RootView after a sync) is exactly the set of moments
        // the home-screen streak widget also needs to refresh -- see
        // WidgetProgressPublisher's doc comment.
        WidgetProgressPublisher.publish(progress)
    }

    var lastSyncedAt: Date? {
        appSyncState()?.lastSyncedAt
    }

    func markSyncedNow() {
        let state = appSyncState() ?? insertAppSyncState()
        state.lastSyncedAt = Date()
        try? modelContext.save()
    }

    func lastKnownDueReviews(course: String) -> [ReviewItem] {
        let descriptor = FetchDescriptor<CachedCourseDueReviewRecord>(predicate: #Predicate { $0.course == course })
        return ((try? modelContext.fetch(descriptor)) ?? []).map(\.asReviewItem)
    }

    /// Replaces ONE course's cache with a complete, authoritative online snapshot of that course (unlike the
    /// single-item removal below, which is a local, provisional guess made while still offline).
    func replaceLastKnownDueReviews(_ items: [ReviewItem], course: String) {
        let descriptor = FetchDescriptor<CachedCourseDueReviewRecord>(predicate: #Predicate { $0.course == course })
        for record in (try? modelContext.fetch(descriptor)) ?? [] { modelContext.delete(record) }
        for item in items { modelContext.insert(CachedCourseDueReviewRecord(item, course: course)) }
        try? modelContext.save()
        dueReviewRevision += 1
    }

    /// Removes one item from a course's cache after it's been graded offline and is no longer due today -- see
    /// ReviewQueueView's offline grading path for why this only happens for a subset of offline grades (a
    /// wrong answer keeps the item due today, same as the real server behavior).
    func removeCachedDueReview(itemKey: String, course: String) {
        let key = CachedCourseDueReviewRecord.key(course: course, itemKey: itemKey)
        let descriptor = FetchDescriptor<CachedCourseDueReviewRecord>(predicate: #Predicate { $0.cacheKey == key })
        guard let record = try? modelContext.fetch(descriptor).first else { return }
        modelContext.delete(record)
        try? modelContext.save()
        dueReviewRevision += 1
    }

    // MARK: - Sync

    /// Drains the queue and refreshes the progress and per-course due caches. `isCurrentAccount` is the
    /// same-account guard: a sign-out (or another sign-in) while this was in flight means the results belong to
    /// the previous account, whose data the session lifecycle already cleared, so nothing is written back.
    func runSync(
        accessToken: String,
        userID: String,
        refreshAccessToken: @escaping @Sendable () async -> String?,
        isCurrentAccount: () -> Bool
    ) async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        badgeUserID = userID
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let result = await SyncEngine.sync(
            pendingLessonCompletions: pendingLessonCompletions(),
            pendingReviewGrades: pendingReviewGrades(),
            client: client,
            currentUserID: userID,
            refreshAccessToken: refreshAccessToken)
        guard isCurrentAccount() else { return }
        apply(result)

        if let lastKnownProgress = result.lastKnownProgress {
            updateLastKnownProgress(lastKnownProgress)
        } else if let fetched = try? await client.fetchProgress() {
            // SyncEngine only learns progress as a side effect of pushing a completion; with an empty queue
            // read it directly so the header reflects the server. Best-effort: a failure keeps the old cache.
            guard isCurrentAccount() else { return }
            updateLastKnownProgress(fetched)
        } else {
            markSyncedNow()
        }

        // Every course's due list, so the badge and an offline Review match the course on screen. A course
        // whose fetch fails is absent, so its last good cache stays.
        let due = await SyncEngine.refreshDueReviews { course in try await client.fetchDueReviews(course: course) }
        guard isCurrentAccount() else { return }
        for (course, items) in due { replaceLastKnownDueReviews(items, course: course) }
    }

    /// Writes one SyncEngine pass back: synced and dropped rows go, dead letters move to their own table,
    /// rescheduled rows keep their place with new attempt and backoff fields. Rows are matched by
    /// queueIdentity, which a retry never changes.
    func apply(_ result: SyncResult, now: Date = Date()) {
        let lessonRecords = (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? []
        let byLesson = Dictionary(lessonRecords.map { ($0.queueIdentity, $0) }, uniquingKeysWith: { a, _ in a })
        for item in result.syncedLessonCompletions + result.droppedForeignLessonCompletions {
            if let record = byLesson[item.queueIdentity] { modelContext.delete(record) }
        }
        for dead in result.deadLetteredLessonCompletions {
            if let record = byLesson[dead.item.queueIdentity] { modelContext.delete(record) }
            modelContext.insert(SyncDeadLetterRecord(kind: "lesson", identity: dead.item.queueIdentity, reason: dead.reason, ownerUserID: dead.item.ownerUserID, failedAt: now))
        }
        for item in result.rescheduledLessonCompletions { byLesson[item.queueIdentity]?.apply(item) }

        let gradeRecords = (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? []
        let byGrade = Dictionary(gradeRecords.map { ($0.queueIdentity, $0) }, uniquingKeysWith: { a, _ in a })
        for item in result.syncedReviewGrades + result.droppedForeignReviewGrades {
            if let record = byGrade[item.queueIdentity] { modelContext.delete(record) }
        }
        for dead in result.deadLetteredReviewGrades {
            if let record = byGrade[dead.item.queueIdentity] { modelContext.delete(record) }
            modelContext.insert(SyncDeadLetterRecord(kind: "grade", identity: dead.item.queueIdentity, reason: dead.reason, ownerUserID: dead.item.ownerUserID, failedAt: now))
        }
        for item in result.rescheduledReviewGrades { byGrade[item.queueIdentity]?.apply(item) }

        trimDeadLetters(keeping: 50)
        do { try modelContext.save() } catch { print("[SyncQueueStore] apply save failed: \(error)") }
    }

    private func trimDeadLetters(keeping limit: Int) {
        var descriptor = FetchDescriptor<SyncDeadLetterRecord>(sortBy: [SortDescriptor(\.failedAt, order: .reverse)])
        descriptor.fetchOffset = limit
        for record in (try? modelContext.fetch(descriptor)) ?? [] { modelContext.delete(record) }
    }

    // MARK: - Sign-out / account deletion (SessionLifecycle, AccountDataCleanup)

    /// Everything in this store belongs to the account that was signed in: queued
    /// completions and grades, dead letters, the due-review cache and the last-known progress row. The
    /// next account on this device must start with none of it. The widget is cleared by
    /// its own lifecycle handler.
    func clearAll() {
        deleteAll(PendingLessonCompletionRecord.self)
        deleteAll(PendingReviewGradeRecord.self)
        deleteAll(CachedCourseDueReviewRecord.self)
        deleteAll(SyncDeadLetterRecord.self)
        deleteAll(AppSyncStateRecord.self)
        do {
            try modelContext.save()
        } catch {
            print("[SyncQueueStore] clearAll save failed: \(error)")
        }
        dueReviewRevision += 1
    }

    private func deleteAll<Model: PersistentModel>(_ type: Model.Type) {
        let records = (try? modelContext.fetch(FetchDescriptor<Model>())) ?? []
        for record in records {
            modelContext.delete(record)
        }
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
