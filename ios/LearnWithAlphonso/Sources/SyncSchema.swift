import Foundation
import SwiftData

// The offline store's schema history. Every shipped schema stays here, frozen, so an installed store always has a
// path to the current models. A store that fails to open used to drop silently to an in-memory container
// (LearnWithAlphonsoApp), i.e. lose the offline queue: an explicit migration plan is what prevents that.
//
// RULES
// - Never edit SyncSchemaV1: it is byte-for-byte what build 49 (e3004f5) stored. ios-learning-flow-guards pins
//   its property lists.
// - Until the build that introduces V2 is live, SyncSchemaV2 may still change. After that, any change to a model
//   listed below needs SyncSchemaV3 + a new MigrationStage (PodcastDownloadRecord is in this container too).

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
}

enum SyncMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [SyncSchemaV1.self, SyncSchemaV2.self] }
    /// V1 -> V2 is additive except CachedDueReviewRecord, which is dropped. It is a cache of the server's
    /// due list and is refilled per course on the next sync, so nothing durable is lost.
    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: SyncSchemaV1.self, toVersion: SyncSchemaV2.self)]
    }
}
