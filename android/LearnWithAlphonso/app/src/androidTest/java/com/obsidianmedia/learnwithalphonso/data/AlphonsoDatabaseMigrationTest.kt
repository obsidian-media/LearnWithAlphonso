package com.obsidianmedia.learnwithalphonso.data

import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Replays the exported schemas through each migration ([AlphonsoDatabase.MIGRATION_2_3], [AlphonsoDatabase.MIGRATION_3_4]) and checks what an upgrade keeps. */
@RunWith(AndroidJUnit4::class)
class AlphonsoDatabaseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AlphonsoDatabase::class.java,
        emptyList(),
        FrameworkSQLiteOpenHelperFactory(),
    )

    @Test
    fun migrating_2_to_3_keeps_queued_rows_and_adds_the_retry_and_owner_columns() {
        helper.createDatabase(NAME, 2).apply {
            execSQL(
                "INSERT INTO pending_lesson_completions (lessonId, total, answersJson, course, queuedAt, optimisticXpEstimate) " +
                    "VALUES ('u1l1', 5, '[]', 'en', 1000, 50)",
            )
            execSQL("INSERT INTO pending_review_grades (itemKey, answer, course, queuedAt) VALUES ('en:l1:q1', 'cat', 'en', 2000)")
            execSQL("INSERT INTO app_sync_state (id, lastSyncedAt, progressJson) VALUES (1, 3000, NULL)")
            close()
        }

        val db = helper.runMigrationsAndValidate(NAME, 3, true, AlphonsoDatabase.MIGRATION_2_3)

        db.query("SELECT lessonId, ownerUserId, sessionToken, attemptCount, nextAttemptAt FROM pending_lesson_completions").use {
            it.moveToFirst()
            assertEquals("u1l1", it.getString(0))
            assertNull("an old row has no owner until it is adopted", it.getString(1))
            assertNull(it.getString(2))
            assertEquals(0, it.getInt(3))
            assertEquals(true, it.isNull(4))
        }
        db.query("SELECT itemKey, ownerUserId, attemptCount FROM pending_review_grades").use {
            it.moveToFirst()
            assertEquals("en:l1:q1", it.getString(0))
            assertNull(it.getString(1))
            assertEquals(0, it.getInt(2))
        }
        db.query("SELECT lastSyncedAt, orphansResolved FROM app_sync_state").use {
            it.moveToFirst()
            assertEquals(3000L, it.getLong(0))
            assertEquals("old rows have not been adopted yet", 0, it.getInt(1))
        }
        db.execSQL("INSERT INTO dead_letters (kind, identity, reason, deadAt, ownerUserId) VALUES ('lesson', 'x', 'rejected', 1, 'u1')")
        db.query("SELECT COUNT(*) FROM dead_letters").use {
            it.moveToFirst()
            assertEquals(1, it.getInt(0))
        }
    }

    @Test
    fun migrating_3_to_4_keeps_queued_grades_and_adds_an_empty_review_snapshot() {
        helper.createDatabase(NAME, 3).apply {
            execSQL(
                "INSERT INTO pending_review_grades (itemKey, answer, course, queuedAt, ownerUserId, attemptCount) " +
                    "VALUES ('en:l1:q1', 'cat', 'en', 2000, 'u1', 1)",
            )
            execSQL("INSERT INTO cached_due_reviews (itemKey, json) VALUES ('en:l1:q1', '{}')")
            close()
        }

        val db = helper.runMigrationsAndValidate(NAME, 4, true, AlphonsoDatabase.MIGRATION_3_4)

        db.query("SELECT itemKey, ownerUserId, attemptCount, expectedDueOn, expectedLastReviewedAt FROM pending_review_grades").use {
            it.moveToFirst()
            assertEquals("en:l1:q1", it.getString(0))
            assertEquals("u1", it.getString(1))
            assertEquals(1, it.getInt(2))
            // No snapshot: the grade replays exactly as it did before freshness checks existed.
            assertEquals(true, it.isNull(3))
            assertEquals(true, it.isNull(4))
        }
        db.query("SELECT COUNT(*) FROM cached_due_reviews").use {
            it.moveToFirst()
            assertEquals(1, it.getInt(0))
        }
    }

    private companion object {
        const val NAME = "migration-test"
    }
}
