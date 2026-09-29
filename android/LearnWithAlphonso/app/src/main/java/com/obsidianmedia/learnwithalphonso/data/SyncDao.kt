package com.obsidianmedia.learnwithalphonso.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.Query
import androidx.room.RoomDatabase
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

    @Query("SELECT * FROM pending_review_grades ORDER BY queuedAt ASC")
    suspend fun pendingReviewGrades(): List<PendingReviewGradeRecord>

    @Insert
    suspend fun insertReviewGrade(record: PendingReviewGradeRecord)

    @Query("DELETE FROM pending_review_grades WHERE itemKey = :itemKey AND queuedAt = :queuedAt")
    suspend fun deleteReviewGrade(itemKey: String, queuedAt: Long)

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
    entities = [PendingLessonCompletionRecord::class, PendingReviewGradeRecord::class, CachedDueReviewRecord::class, AppSyncStateRecord::class],
    version = 1,
    exportSchema = false,
)
abstract class AlphonsoDatabase : RoomDatabase() {
    abstract fun syncDao(): SyncDao
}
