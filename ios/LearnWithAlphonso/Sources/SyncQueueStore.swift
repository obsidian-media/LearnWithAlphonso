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
    var expectedDueOn: String?
    var expectedLastReviewedAt: String?
    var ownerUserID: String?
    var attemptCount: Int?
    var nextAttemptAt: Date?

    init(_ pending: PendingReviewGrade) {
        itemKey = pending.itemKey
        answer = pending.answer
        course = pending.course
        queuedAt = pending.queuedAt
        expectedDueOn = pending.expectedDueOn
        expectedLastReviewedAt = pending.expectedLastReviewedAt
        ownerUserID = pending.ownerUserID
        attemptCount = pending.attemptCount
        nextAttemptAt = pending.nextAttemptAt
    }

    var asPending: PendingReviewGrade {
        PendingReviewGrade(
            itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt,
            expectedDueOn: expectedDueOn, expectedLastReviewedAt: expectedLastReviewedAt,
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
    // Schema V3 additions. A row migrated from V2 has hasReviewSnapshot == nil: its last review time is unknown,
    // which is not the same as "never reviewed", so it is graded without a freshness snapshot.
    var lastReviewedAt: String?
    var hasReviewSnapshot: Bool?

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
        lastReviewedAt = item.lastReviewedAt
        hasReviewSnapshot = item.hasReviewSnapshot
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
            lastReviewedAt: lastReviewedAt, hasReviewSnapshot: hasReviewSnapshot ?? false,
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
final class SyncQueueStore: SyncQueueBacking {
    @ObservationIgnored private let modelContext: ModelContext
    /// Whether the container is on disk (SyncStoreFactory). A row's own save outcome is reported per append.
    @ObservationIgnored private let isPersistent: Bool

    /// Bumped whenever the cached due-review list changes. SwiftUI cannot see
    /// a SwiftData `fetch` made inside `body`, so a view that reads the count
    /// through `lastKnownDueReviews()` never repaints when the cache changes:
    /// the Learn tab badge stayed at 2, then 3, after the queue was cleared
    /// (BACKLOG 0.0-z #5). Reading this through `dueReviewCount` is what makes
    /// the badge track the cache.
    private(set) var dueReviewRevision = 0

    /// Bumps whenever dead letters change, so the Learn-tab notice re-renders.
    private(set) var deadLetterRevision = 0

    /// Changes when something is queued and when a sync pass ends, so RootView can re-arm its retry wakeup.
    private(set) var queueRevision = 0

    /// True when queued work may not survive the app closing: the store opened in memory
    /// (SyncStoreFactory's last fallback), or a save to disk failed. The lesson player then stops saying
    /// "Saved" for a queued lesson (QueuedLessonPolicy.finishMessage).
    private(set) var isStorageDegraded: Bool

    /// The account the badge counts for: remembered from the last sync, because the active course is stored per
    /// account. Nil (never synced this launch) counts English.
    @ObservationIgnored private var badgeUserID: String?
    /// The pass in flight. Launch, foreground and reconnect each trigger a sync; two overlapping passes would send
    /// the same grades twice, so a second request waits for this one. A live finish waits for it too, instead of
    /// queueing behind it needlessly.
    @ObservationIgnored private var currentPass: Task<Void, Never>?
    @ObservationIgnored private var lastBadgeCourse = "en"
    @ObservationIgnored private var defaultsObserver: NSObjectProtocol?

    init(modelContext: ModelContext, isPersistent: Bool = true) {
        self.modelContext = modelContext
        self.isPersistent = isPersistent
        isStorageDegraded = !isPersistent
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

    /// Refuses a row with no owner (QueueAppendResult): it would be adopted by whoever syncs next. `onDisk` false
    /// means this row lives only in this process (in-memory store, or this save failed): it still syncs while the
    /// app stays open, but the learner must not be told it is saved.
    @discardableResult
    func appendLessonCompletion(_ pending: PendingLessonCompletion) -> QueueAppendResult {
        let result = QueueAppendResult.decide(owner: pending.ownerUserID, saved: {
            modelContext.insert(PendingLessonCompletionRecord(pending))
            return save("appendLessonCompletion")
        }, isPersistent: isPersistent)
        if result.isStored { queueRevision += 1 }
        return result
    }

    /// Saves, and records a failure as degraded storage instead of dropping it with `try?`.
    @discardableResult
    private func save(_ caller: String) -> Bool {
        do {
            try modelContext.save()
            return true
        } catch {
            print("[SyncQueueStore] \(caller) save failed: \(error)")
            isStorageDegraded = true
            return false
        }
    }

    func pendingLessonCompletions() -> [PendingLessonCompletion] {
        let records = (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? []
        return records.map(\.asPending)
    }

    // MARK: - Pending review grades

    @discardableResult
    func appendReviewGrade(_ pending: PendingReviewGrade) -> QueueAppendResult {
        let result = QueueAppendResult.decide(owner: pending.ownerUserID, saved: {
            modelContext.insert(PendingReviewGradeRecord(pending))
            return save("appendReviewGrade")
        }, isPersistent: isPersistent)
        if result.isStored { queueRevision += 1 }
        return result
    }

    func pendingReviewGrades() -> [PendingReviewGrade] {
        let records = (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? []
        return records.map(\.asPending)
    }

    /// How much is waiting for this account, for the Learn-tab line. Rows with no owner (queued by an older
    /// build) are synced as the current account's, so they count too.
    func pendingCounts(for userID: String?) -> (lessons: Int, reviewAnswers: Int) {
        guard let userID else { return (0, 0) }
        let mine: (String?) -> Bool = { $0 == nil || $0 == userID }
        return (
            pendingLessonCompletions().filter { mine($0.ownerUserID) }.count,
            pendingReviewGrades().filter { mine($0.ownerUserID) }.count
        )
    }

    /// When the next sync pass could send something for this account; nil means there is nothing to wake for.
    /// SyncEngine.nextWakeup: both queues go strictly oldest first, so only each queue's oldest row counts.
    func nextPendingAttempt(for userID: String, now: Date = Date()) -> Date? {
        SyncEngine.nextWakeup(lessons: pendingLessonCompletions(), grades: pendingReviewGrades(), userID: userID, now: now)
    }

    /// This account's lessons that ran out of automatic retries (SyncRetryPolicy.isParked), for the Learn-tab line.
    func parkedLessonCount(for userID: String?) -> Int {
        _ = queueRevision
        guard let userID else { return 0 }
        return pendingLessonCompletions().filter { ($0.ownerUserID == nil || $0.ownerUserID == userID) && SyncRetryPolicy.standard.isParked($0) }.count
    }

    /// The learner's "Try again" on parked lessons: one more automatic try each (SyncRetryPolicy.retryParked).
    func retryParkedLessons(for userID: String) {
        let policy = SyncRetryPolicy.standard
        for record in (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? [] {
            let row = record.asPending
            guard row.ownerUserID == nil || row.ownerUserID == userID, policy.isParked(row) else { continue }
            record.apply(policy.retryParked(row))
        }
        save("retryParkedLessons")
        queueRevision += 1
    }

    /// This account's queued lessons a live finish must wait behind (parked ones hold nothing up).
    func blockingLessonCount(for userID: String) -> Int {
        QueuedLessonPolicy.blockingLessons(pendingLessonCompletions(), userID: userID)
    }

    /// Review answers that will not be retried (refused, or out of retries), by identity, for the Learn-tab line
    /// (dismissed like the lesson one).
    var reviewDeadLetterIdentities: [String] {
        _ = deadLetterRevision
        let descriptor = FetchDescriptor<SyncDeadLetterRecord>(predicate: #Predicate { $0.kind == "grade" })
        return ((try? modelContext.fetch(descriptor)) ?? []).map(\.identity)
    }

    // MARK: - Last-known cache (for offline display)

    /// The day basis rides beside the frozen V3 row (AccountCacheKeys.streakDayBasis), since adding a column would
    /// need a new schema version.
    func lastKnownProgress() -> LessonCompletionProgress? {
        appSyncState()?.cachedProgress?.withDayBasis(UserDefaults.standard.string(forKey: AccountCacheKeys.streakDayBasis))
    }

    /// `synced` is true only for progress the server just returned. A local estimate (a heart spent on a wrong
    /// answer, a freeze bought, a lesson queued offline) must not move "last synced", or the Learn tab claimed a
    /// sync that never happened.
    func updateLastKnownProgress(_ progress: LessonCompletionProgress, synced: Bool = true) {
        let state = appSyncState() ?? insertAppSyncState()
        state.setProgress(progress)
        if let basis = progress.dayBasis { UserDefaults.standard.set(basis, forKey: AccountCacheKeys.streakDayBasis) }
        if synced { state.lastSyncedAt = Date() }
        save("updateLastKnownProgress")
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

    /// Drains the queue and refreshes the progress and per-course due caches (Kit SyncPass, where the ordering,
    /// the same-account guard and the progress merge are tested). `refreshAccessToken` must be bound to `userID`
    /// (Session.refresher(for:)), and `isCurrentAccount` is asked before every send. A pass already in flight is
    /// awaited instead of overlapped: two overlapping passes would send the same grades twice.
    func runSync(
        accessToken: String,
        userID: String,
        refreshAccessToken: @escaping @Sendable () async -> String?,
        isCurrentAccount: @escaping @MainActor () -> Bool
    ) async {
        if let currentPass {
            await currentPass.value
            return
        }
        await startPass(accessToken: accessToken, userID: userID, refreshAccessToken: refreshAccessToken,
                        isCurrentAccount: isCurrentAccount, lessonsOnly: false).value
    }

    /// A live finish's drain: only the lessons ahead of it, the head sent even inside its backoff, waiting at most
    /// `timeout`. A pass already in flight is waited for first (within the same timeout) rather than skipped.
    func drainLessonsBeforeLiveFinish(
        accessToken: String,
        userID: String,
        refreshAccessToken: @escaping @Sendable () async -> String?,
        isCurrentAccount: @escaping @MainActor () -> Bool,
        timeout: TimeInterval = 15
    ) async {
        _ = await SyncPass.waitAtMost(timeout) { [weak self] in
            guard let self else { return }
            if let running = self.currentPass { await running.value }
            guard self.blockingLessonCount(for: userID) > 0, isCurrentAccount() else { return }
            await self.startPass(accessToken: accessToken, userID: userID, refreshAccessToken: refreshAccessToken,
                                 isCurrentAccount: isCurrentAccount, lessonsOnly: true).value
        }
    }

    private func startPass(
        accessToken: String,
        userID: String,
        refreshAccessToken: @escaping @Sendable () async -> String?,
        isCurrentAccount: @escaping @MainActor () -> Bool,
        lessonsOnly: Bool
    ) -> Task<Void, Never> {
        if let currentPass { return currentPass }
        badgeUserID = userID
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let course = ActiveCoursePreference.load(for: userID).wireCode
        let pass = Task { @MainActor [weak self] in
            guard let self else { return }
            await SyncPass.run(
                backing: self, client: client, userID: userID, activeCourse: course,
                refreshAccessToken: refreshAccessToken, isCurrentAccount: isCurrentAccount, lessonsOnly: lessonsOnly)
            // The wakeup is re-armed only once the whole pass is over. Re-arming mid-pass let the new wakeup fire
            // into the in-flight guard, do nothing, and never be re-armed.
            self.currentPass = nil
            self.queueRevision += 1
        }
        currentPass = pass
        return pass
    }

    /// Writes one SyncEngine pass back: synced and dropped rows go, dead letters move to their own table,
    /// rescheduled rows keep their place with new attempt and backoff fields. Rows are matched by
    /// queueIdentity, which a retry never changes.
    /// Row by row through the Kit's own sets (SyncResult.lessonIdentitiesToRemove / lessonUpdates, the same
    /// ones SyncResult.applied uses in the Kit tests). Another account's rows are in no set, so they stay.
    func apply(_ result: SyncResult, now: Date = Date()) {
        let removeLessons = result.lessonIdentitiesToRemove, lessonUpdates = result.lessonUpdates
        for record in (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? [] {
            if removeLessons.contains(record.queueIdentity) {
                modelContext.delete(record)
            } else if let update = lessonUpdates[record.queueIdentity] {
                record.apply(update)
            }
        }
        for dead in result.deadLetteredLessonCompletions {
            modelContext.insert(SyncDeadLetterRecord(kind: "lesson", identity: dead.item.queueIdentity, reason: dead.reason, ownerUserID: dead.item.ownerUserID, failedAt: now))
        }

        let removeGrades = result.gradeIdentitiesToRemove, gradeUpdates = result.gradeUpdates
        for record in (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? [] {
            if removeGrades.contains(record.queueIdentity) {
                modelContext.delete(record)
            } else if let update = gradeUpdates[record.queueIdentity] {
                record.apply(update)
            }
        }
        for dead in result.deadLetteredReviewGrades {
            modelContext.insert(SyncDeadLetterRecord(kind: "grade", identity: dead.item.queueIdentity, reason: dead.reason, ownerUserID: dead.item.ownerUserID, failedAt: now))
        }

        trimDeadLetters(keeping: 50)
        save("apply")
        if !result.deadLetteredLessonCompletions.isEmpty || !result.deadLetteredReviewGrades.isEmpty {
            deadLetterRevision += 1
        }
    }

    /// Lesson completions the server permanently rejected (or that ran out of retries), newest first, for the
    /// Learn-tab notice. Review-grade dead letters get their own quieter line (reviewDeadLetterIdentities): a
    /// lost grade only reschedules a card.
    var lessonDeadLetters: [(identity: String, reason: String)] {
        _ = deadLetterRevision
        let descriptor = FetchDescriptor<SyncDeadLetterRecord>(
            predicate: #Predicate { $0.kind == "lesson" },
            sortBy: [SortDescriptor(\.failedAt, order: .reverse)]
        )
        return ((try? modelContext.fetch(descriptor)) ?? []).map { (identity: $0.identity, reason: $0.reason) }
    }

    private func trimDeadLetters(keeping limit: Int) {
        var descriptor = FetchDescriptor<SyncDeadLetterRecord>(sortBy: [SortDescriptor(\.failedAt, order: .reverse)])
        descriptor.fetchOffset = limit
        for record in (try? modelContext.fetch(descriptor)) ?? [] { modelContext.delete(record) }
    }

    // MARK: - Sign-out / account deletion (SessionLifecycle, AccountDataCleanup)

    /// Queued completions and grades belong to the account that played them. A sign-out keeps them (stamped
    /// with that account when they had no owner) for its next sign-in here; deletion removes the deleted
    /// account's. AccountQueueRetention decides; this applies it by queueIdentity.
    func applyRetention(_ plan: QueueRetentionPlan) {
        // Row by row through the plan's own dispositions (the same ones QueueRetentionPlan.applied uses in the Kit
        // tests).
        for record in (try? modelContext.fetch(FetchDescriptor<PendingLessonCompletionRecord>())) ?? [] {
            switch plan.lessonDisposition(record.queueIdentity) {
            case .keep: break
            case .delete: modelContext.delete(record)
            case let .stamp(owner): record.ownerUserID = owner
            }
        }
        for record in (try? modelContext.fetch(FetchDescriptor<PendingReviewGradeRecord>())) ?? [] {
            switch plan.gradeDisposition(record.queueIdentity) {
            case .keep: break
            case .delete: modelContext.delete(record)
            case let .stamp(owner): record.ownerUserID = owner
            }
        }
        save("applyRetention")
        queueRevision += 1
    }

    /// Everything else in this store is a cached copy of the signed-in account's server state: dead letters,
    /// the due-review cache and the last-known progress row. The next account on this device must start with
    /// none of it. The widget is cleared by its own lifecycle handler.
    func clearCachedAccountState() {
        deleteAll(CachedCourseDueReviewRecord.self)
        deleteAll(SyncDeadLetterRecord.self)
        deleteAll(AppSyncStateRecord.self)
        save("clearCachedAccountState")
        dueReviewRevision += 1
        deadLetterRevision += 1
        queueRevision += 1
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
