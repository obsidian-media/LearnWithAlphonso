package com.obsidianmedia.learnwithalphonso.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.obsidianmedia.learnwithalphonso.podcast.PodcastDownloadDao
import com.obsidianmedia.learnwithalphonso.podcast.PodcastDownloadRecord
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncDao {
    @Query("SELECT * FROM pending_lesson_completions ORDER BY queuedAt ASC")
    suspend fun pendingLessonCompletions(): List<PendingLessonCompletionRecord>

    @Insert
    suspend fun insertLessonCompletion(record: PendingLessonCompletionRecord)

    @Query("DELETE FROM pending_lesson_completions WHERE lessonId = :lessonId AND queuedAt = :queuedAt")
    suspend fun deleteLessonCompletion(lessonId: String, queuedAt: Long)

    @Query("UPDATE pending_lesson_completions SET attemptCount = :attemptCount, nextAttemptAt = :nextAttemptAt WHERE lessonId = :lessonId AND course = :course AND queuedAt = :queuedAt")
    suspend fun rescheduleLessonCompletion(lessonId: String, course: String, queuedAt: Long, attemptCount: Int, nextAttemptAt: Long)

    @Query("UPDATE pending_lesson_completions SET ownerUserId = :userId WHERE ownerUserId IS NULL")
    suspend fun adoptLessonCompletions(userId: String)

    @Query("SELECT COUNT(*) FROM pending_lesson_completions")
    fun pendingLessonCompletionCount(): Flow<Int>

    @Query("SELECT * FROM pending_review_grades ORDER BY queuedAt ASC")
    suspend fun pendingReviewGrades(): List<PendingReviewGradeRecord>

    @Insert
    suspend fun insertReviewGrade(record: PendingReviewGradeRecord)

    @Query("DELETE FROM pending_review_grades WHERE itemKey = :itemKey AND queuedAt = :queuedAt")
    suspend fun deleteReviewGrade(itemKey: String, queuedAt: Long)

    @Query("UPDATE pending_review_grades SET attemptCount = :attemptCount, nextAttemptAt = :nextAttemptAt WHERE itemKey = :itemKey AND course = :course AND queuedAt = :queuedAt")
    suspend fun rescheduleReviewGrade(itemKey: String, course: String, queuedAt: Long, attemptCount: Int, nextAttemptAt: Long)

    @Query("UPDATE pending_review_grades SET ownerUserId = :userId WHERE ownerUserId IS NULL")
    suspend fun adoptReviewGrades(userId: String)

    @Query("SELECT COUNT(*) FROM pending_review_grades")
    fun pendingReviewGradeCount(): Flow<Int>

    @Insert
    suspend fun insertDeadLetter(record: DeadLetterRecord)

    @Query("SELECT * FROM dead_letters ORDER BY deadAt ASC")
    fun deadLetters(): Flow<List<DeadLetterRecord>>

    @Query("DELETE FROM dead_letters")
    suspend fun clearDeadLetters()

    @Query("SELECT * FROM cached_due_reviews")
    suspend fun cachedDueReviews(): List<CachedDueReviewRecord>

    @Query("SELECT COUNT(*) FROM cached_due_reviews")
    fun cachedDueReviewCount(): Flow<Int>

    @Query("DELETE FROM cached_due_reviews")
    suspend fun clearCachedDueReviews()

    @Insert
    suspend fun insertCachedDueReviews(records: List<CachedDueReviewRecord>)

    @Query("DELETE FROM cached_due_reviews WHERE itemKey = :itemKey")
    suspend fun deleteCachedDueReview(itemKey: String)

    @Query("SELECT * FROM app_sync_state WHERE id = 1")
    suspend fun syncState(): AppSyncStateRecord?

    @Query("SELECT * FROM app_sync_state WHERE id = 1")
    fun syncStateFlow(): Flow<AppSyncStateRecord?>

    @Upsert
    suspend fun upsertSyncState(record: AppSyncStateRecord)
}

@Database(
    entities = [PendingLessonCompletionRecord::class, PendingReviewGradeRecord::class, CachedDueReviewRecord::class, AppSyncStateRecord::class, PodcastDownloadRecord::class, DeadLetterRecord::class],
    version = 3,
    exportSchema = false,
)
abstract class AlphonsoDatabase : RoomDatabase() {
    abstract fun syncDao(): SyncDao
    abstract fun podcastDownloadDao(): PodcastDownloadDao

    companion object {
        /**
         * Offline-sync reliability (iOS SyncSchemaV2): who queued each row, the session token held when the lesson
         * opened, retry bookkeeping, and the dead-letter table. Rows written before this have no owner; the first
         * account that syncs adopts them.
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `pending_lesson_completions` ADD COLUMN `ownerUserId` TEXT")
                db.execSQL("ALTER TABLE `pending_lesson_completions` ADD COLUMN `sessionToken` TEXT")
                db.execSQL("ALTER TABLE `pending_lesson_completions` ADD COLUMN `attemptCount` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `pending_lesson_completions` ADD COLUMN `nextAttemptAt` INTEGER")
                db.execSQL("ALTER TABLE `pending_review_grades` ADD COLUMN `ownerUserId` TEXT")
                db.execSQL("ALTER TABLE `pending_review_grades` ADD COLUMN `attemptCount` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `pending_review_grades` ADD COLUMN `nextAttemptAt` INTEGER")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `dead_letters` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `kind` TEXT NOT NULL, " +
                        "`identity` TEXT NOT NULL, `reason` TEXT NOT NULL, `deadAt` INTEGER NOT NULL)",
                )
            }
        }

        /** Plan 4: offline podcast downloads share the container rather than opening a second store. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `podcast_downloads` (`episodeId` TEXT NOT NULL, `bytes` INTEGER NOT NULL, `etag` TEXT, " +
                        "`storedDurationSeconds` INTEGER NOT NULL, `lastPlayed` INTEGER, `downloadedAt` INTEGER NOT NULL, PRIMARY KEY(`episodeId`))",
                )
            }
        }
    }
}
