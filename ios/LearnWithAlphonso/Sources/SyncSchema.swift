import Foundation
import SwiftData
import os

// The offline store's schema history. Every shipped schema stays here, frozen, so an installed store always has a
// path to the current models. A store that fails to open used to drop silently to an in-memory container
// (LearnWithAlphonsoApp), i.e. lose the offline queue: an explicit migration plan is what prevents that.
//
// RULES
// - Never edit SyncSchemaV1: it is byte-for-byte what build 49 (e3004f5) stored. ios-learning-flow-guards pins
//   its property lists.
// - Never edit SyncSchemaV2 either: it is what builds 50 and 51 (a9da1dc) stored, frozen the same way.
// - SyncSchemaV3 is the current schema (the top-level models). Until the build that introduces V3 is live it may
//   still change. After that, any change to a model listed in it needs SyncSchemaV4 + a new MigrationStage
//   (PodcastDownloadRecord is in this container too).

enum SyncSchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [PendingLessonCompletionRecord.self, PendingReviewGradeRecord.self, CachedDueReviewRecord.self,
         AppSyncStateRecord.self, PodcastDownloadRecord.self]
    }

    @Model final class PendingLessonCompletionRecord {
        var lessonID: String
        var total: Int
        var answerQuestionIDs: [String]
        var answerTexts: [String]
        var course: String
        var queuedAt: Date
        var optimisticXpEstimate: Int
        init(lessonID: String, total: Int, answerQuestionIDs: [String], answerTexts: [String], course: String, queuedAt: Date, optimisticXpEstimate: Int) {
            self.lessonID = lessonID; self.total = total; self.answerQuestionIDs = answerQuestionIDs
            self.answerTexts = answerTexts; self.course = course; self.queuedAt = queuedAt
            self.optimisticXpEstimate = optimisticXpEstimate
        }
    }

    @Model final class PendingReviewGradeRecord {
        var itemKey: String
        var answer: String
        var course: String
        var queuedAt: Date
        init(itemKey: String, answer: String, course: String, queuedAt: Date) {
            self.itemKey = itemKey; self.answer = answer; self.course = course; self.queuedAt = queuedAt
        }
    }

    @Model final class CachedDueReviewRecord {
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
        init(itemKey: String, lessonId: String, level: String, ease: Double, intervalDays: Int, repetitions: Int, dueOn: String, source: String) {
            self.itemKey = itemKey; self.lessonId = lessonId; self.level = level; self.ease = ease
            self.intervalDays = intervalDays; self.repetitions = repetitions; self.dueOn = dueOn; self.source = source
        }
    }

    @Model final class AppSyncStateRecord {
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
    }

    @Model final class PodcastDownloadRecord {
        @Attribute(.unique) var episodeID: String
        var bytes: Int
        var etag: String?
        var storedDurationSeconds: Int
        var lastPlayed: Date?
        var downloadedAt: Date
        init(episodeID: String, bytes: Int, etag: String?, storedDurationSeconds: Int, lastPlayed: Date?, downloadedAt: Date) {
            self.episodeID = episodeID; self.bytes = bytes; self.etag = etag
            self.storedDurationSeconds = storedDurationSeconds; self.lastPlayed = lastPlayed; self.downloadedAt = downloadedAt
        }
    }
}

enum SyncSchemaV2: VersionedSchema {
    static let versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] {
        [PendingLessonCompletionRecord.self, PendingReviewGradeRecord.self, CachedCourseDueReviewRecord.self,
         AppSyncStateRecord.self, PodcastDownloadRecord.self, SyncDeadLetterRecord.self]
    }

    @Model final class PendingLessonCompletionRecord {
        var lessonID: String
        var total: Int
        var answerQuestionIDs: [String]
        var answerTexts: [String]
        var course: String
        var queuedAt: Date
        var optimisticXpEstimate: Int
        var ownerUserID: String?
        var sessionToken: String?
        var attemptCount: Int?
        var nextAttemptAt: Date?
        init(lessonID: String, total: Int, answerQuestionIDs: [String], answerTexts: [String], course: String, queuedAt: Date, optimisticXpEstimate: Int) {
            self.lessonID = lessonID; self.total = total; self.answerQuestionIDs = answerQuestionIDs
            self.answerTexts = answerTexts; self.course = course; self.queuedAt = queuedAt
            self.optimisticXpEstimate = optimisticXpEstimate
        }
    }

    @Model final class PendingReviewGradeRecord {
        var itemKey: String
        var answer: String
        var course: String
        var queuedAt: Date
        var ownerUserID: String?
        var attemptCount: Int?
        var nextAttemptAt: Date?
        init(itemKey: String, answer: String, course: String, queuedAt: Date) {
            self.itemKey = itemKey; self.answer = answer; self.course = course; self.queuedAt = queuedAt
        }
    }

    @Model final class CachedCourseDueReviewRecord {
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
        init(cacheKey: String, course: String, itemKey: String, lessonId: String, level: String, ease: Double, intervalDays: Int, repetitions: Int, dueOn: String, source: String) {
            self.cacheKey = cacheKey; self.course = course; self.itemKey = itemKey; self.lessonId = lessonId
            self.level = level; self.ease = ease; self.intervalDays = intervalDays; self.repetitions = repetitions
            self.dueOn = dueOn; self.source = source
        }
    }

    @Model final class AppSyncStateRecord {
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
    }

    @Model final class PodcastDownloadRecord {
        @Attribute(.unique) var episodeID: String
        var bytes: Int
        var etag: String?
        var storedDurationSeconds: Int
        var lastPlayed: Date?
        var downloadedAt: Date
        init(episodeID: String, bytes: Int, etag: String?, storedDurationSeconds: Int, lastPlayed: Date?, downloadedAt: Date) {
            self.episodeID = episodeID; self.bytes = bytes; self.etag = etag
            self.storedDurationSeconds = storedDurationSeconds; self.lastPlayed = lastPlayed; self.downloadedAt = downloadedAt
        }
    }

    @Model final class SyncDeadLetterRecord {
        var kind: String
        var identity: String
        var reason: String
        var ownerUserID: String?
        var failedAt: Date
        init(kind: String, identity: String, reason: String, ownerUserID: String?, failedAt: Date) {
            self.kind = kind; self.identity = identity; self.reason = reason
            self.ownerUserID = ownerUserID; self.failedAt = failedAt
        }
    }
}

/// Current schema: the top-level models. V2 -> V3 adds the review-freshness snapshot (expectedDueOn,
/// expectedLastReviewedAt) to queued grades and lastReviewedAt to the cached due list. All optional.
enum SyncSchemaV3: VersionedSchema {
    static let versionIdentifier = Schema.Version(3, 0, 0)
    static var models: [any PersistentModel.Type] {
        [PendingLessonCompletionRecord.self, PendingReviewGradeRecord.self, CachedCourseDueReviewRecord.self,
         AppSyncStateRecord.self, PodcastDownloadRecord.self, SyncDeadLetterRecord.self]
    }
}

enum SyncMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [SyncSchemaV1.self, SyncSchemaV2.self, SyncSchemaV3.self] }
    /// V1 -> V2 is additive except CachedDueReviewRecord, which is dropped. It is a cache of the server's
    /// due list and is refilled per course on the next sync, so nothing durable is lost.
    /// V2 -> V3 only adds optional columns.
    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: SyncSchemaV1.self, toVersion: SyncSchemaV2.self),
         .lightweight(fromVersion: SyncSchemaV2.self, toVersion: SyncSchemaV3.self)]
    }
}

/// Opens the offline store. Three steps, in order, and each fallback is logged (never just printed):
/// 1. the versioned schema with the migration plan (a store written by build 49 or a later one);
/// 2. the same models with NO plan, so SwiftData's lightweight inference can rescue an older compatible store
///    that matches no versioned schema (for example one written before offline podcast downloads existed);
/// 3. an in-memory store, so the app still opens. The offline queue then does not persist across launches.
enum SyncStoreFactory {
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "LearnWithAlphonso", category: "sync")

    static func makeContainer() -> ModelContainer {
        let schema = Schema(versionedSchema: SyncSchemaV3.self)
        let persistent = ModelConfiguration(schema: schema)
        do {
            return try ModelContainer(for: schema, migrationPlan: SyncMigrationPlan.self, configurations: [persistent])
        } catch {
            log.error("Migration plan failed, retrying without it: \(String(describing: error), privacy: .public)")
        }
        do {
            return try ModelContainer(for: schema, configurations: [persistent])
        } catch {
            log.fault("Persistent store failed to open, using memory (the offline queue will not persist): \(String(describing: error), privacy: .public)")
        }
        return try! ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)])
    }
}
