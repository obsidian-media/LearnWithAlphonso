package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpMethod
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Port of the Plan 1 subset of ProgressSyncClient.swift. Request shapes are
 * identical to the iOS client's: RPCs are POST rest/v1/rpc/<name> with the
 * `_param` body, Edge Functions are POST functions/v1/<name>, reads are
 * PostgREST GETs under RLS. The server re-derives every gamification
 * outcome; nothing here is trusted beyond display.
 */
class ProgressSyncClient(
    private val http: SupabaseHttp,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    suspend fun loseHeart(): HeartsResult {
        val rows = rowsOf(http.rpc("lose_heart", buildJsonObject {}))
        val hearts = rows.firstOrNull()?.int("hearts") ?: throw ProgressSyncError.InvalidPayload()
        return HeartsResult(hearts)
    }

    suspend fun restoreHeartsIfDue(): HeartsRefillResult {
        val row = rowsOf(http.rpc("restore_hearts_if_due", buildJsonObject {})).firstOrNull()
            ?: throw ProgressSyncError.InvalidPayload()
        val hearts = row.int("hearts") ?: throw ProgressSyncError.InvalidPayload()
        return HeartsRefillResult(hearts, row.string("hearts_refill_at")?.let(::parsePostgresTimestampMillis))
    }

    suspend fun setCefrLevel(course: String, level: String) {
        http.requireSuccess(http.rpc("set_cefr_level", buildJsonObject { put("_language", course); put("_level", level) }))
    }

    suspend fun savePlacementResult(course: String, level: String, score: Int) {
        http.requireSuccess(
            http.rpc(
                "save_placement_result",
                buildJsonObject { put("_language", course); put("_level", level); put("_score", score) },
            ),
        )
    }

    /** The HMAC session token complete-lesson requires as proof the lesson was opened. */
    suspend fun startLessonSession(lessonId: String, course: String): String {
        val obj = objectOf(http.function("start-lesson-session", buildJsonObject { put("lessonId", lessonId); put("course", course) }))
        return obj.string("token") ?: throw ProgressSyncError.InvalidPayload()
    }

    suspend fun completeLesson(
        lessonId: String,
        total: Int,
        answers: List<LessonAnswer>,
        course: String,
        sessionToken: String,
    ): LessonCompletionResult {
        val body = buildJsonObject {
            put("lessonId", lessonId)
            put("total", total)
            putJsonArray("answers") {
                answers.forEach { add(buildJsonObject { put("questionId", it.questionId); put("answer", it.answer) }) }
            }
            put("course", course)
            put("sessionToken", sessionToken)
        }
        val text = http.requireSuccess(http.function("complete-lesson", body))
        return runCatching { http.json.decodeFromString(LessonCompletionResult.serializer(), text) }
            .getOrElse { throw ProgressSyncError.InvalidPayload() }
    }

    /** Items due today or overdue, oldest first, plus the exact total of this course's review items. */
    suspend fun fetchDueReviews(course: String): DueReviews {
        val today = com.obsidianmedia.learnwithalphonso.core.logic.utcDateString(nowMillis())
        val rows = rowsOf(
            http.rest(
                HttpMethod.Get, "review_items",
                mapOf(
                    "select" to "item_key,lesson_id,level,ease,interval_days,repetitions,due_on,source,weakness_display,prompt,choices,answer_index,explanation",
                    "language" to "eq.$course",
                    "due_on" to "lte.$today",
                    "order" to "due_on.asc",
                    "limit" to "20",
                ),
            ),
        )
        val due = rows.mapNotNull { row ->
            ReviewItem(
                itemKey = row.string("item_key") ?: return@mapNotNull null,
                lessonId = row.string("lesson_id") ?: return@mapNotNull null,
                level = row.string("level") ?: return@mapNotNull null,
                ease = row.double("ease") ?: return@mapNotNull null,
                intervalDays = row.int("interval_days") ?: return@mapNotNull null,
                repetitions = row.int("repetitions") ?: return@mapNotNull null,
                dueOn = row.string("due_on") ?: return@mapNotNull null,
                source = row.string("source") ?: "lesson",
                weaknessDisplay = row.string("weakness_display"),
                prompt = row.string("prompt"),
                choices = row["choices"]?.takeIf { it is JsonArray }?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull },
                answerIndex = row.int("answer_index"),
                explanation = row.string("explanation"),
            )
        }
        val count = http.rest(
            HttpMethod.Head, "review_items",
            mapOf("select" to "item_key", "language" to "eq.$course"),
            headers = mapOf("Prefer" to "count=exact"),
        )
        val total = count.headers["Content-Range"]?.substringAfterLast('/')?.toIntOrNull() ?: due.size
        return DueReviews(due, total)
    }

    suspend fun gradeReview(itemKey: String, answer: String, course: String): ReviewGradeOutcome {
        val obj = objectOf(http.function("grade-review", buildJsonObject { put("itemKey", itemKey); put("answer", answer); put("course", course) }))
        val retired = obj.bool("retired") ?: throw ProgressSyncError.InvalidPayload()
        val dueOn = obj.string("dueOn") ?: throw ProgressSyncError.InvalidPayload()
        // Nullable for a deployed function predating the field.
        return ReviewGradeOutcome(retired, dueOn, obj.bool("correct"))
    }

    suspend fun claimReviewClearBonus(course: String): ReviewClearBonus {
        val row = rowsOf(http.rpc("claim_review_clear_bonus", buildJsonObject { put("_course", course) })).firstOrNull()
            ?: throw ProgressSyncError.InvalidPayload()
        val granted = row.bool("granted") ?: throw ProgressSyncError.InvalidPayload()
        return ReviewClearBonus(granted, row.int("hearts"))
    }

    suspend fun fetchUnlockedAchievements(): List<UnlockedAchievement> =
        rowsOf(http.rest(HttpMethod.Get, "user_achievements", mapOf("select" to "achievement_id,progress"))).mapNotNull { row ->
            UnlockedAchievement(row.string("achievement_id") ?: return@mapNotNull null, row.int("progress") ?: return@mapNotNull null)
        }

    /**
     * Composes language_progress (xp, league of the most recently updated
     * course) with user_progress (streak, hearts). Null when the user has no
     * course row at all. Resolves an elapsed heart refill via the RPC, best
     * effort, so a learner who waited out the timer never sees 0 hearts.
     */
    suspend fun fetchProgress(): LessonCompletionProgress? {
        val languageRow = rowsOf(
            http.rest(HttpMethod.Get, "language_progress", mapOf("select" to "xp,league_tier", "order" to "updated_at.desc", "limit" to "1")),
        ).firstOrNull() ?: return null
        val userRow = rowsOf(
            http.rest(
                HttpMethod.Get, "user_progress",
                mapOf("select" to "streak,longest_streak,last_active_date,hearts,hearts_refill_at,streak_freezes"),
            ),
        ).firstOrNull() ?: JsonObject(emptyMap())

        val refillAt = userRow.string("hearts_refill_at")?.let(::parsePostgresTimestampMillis)
        // hearts defaults to 5 in the schema: a missing row is a full set, not zero.
        var hearts = userRow.int("hearts") ?: 5
        var resolvedRefillAt = refillAt
        if (refillAt != null && refillAt <= nowMillis().toDouble()) {
            runCatching { restoreHeartsIfDue() }.getOrNull()?.let {
                hearts = it.hearts
                resolvedRefillAt = it.heartsRefillAt
            }
        }
        return LessonCompletionProgress(
            xp = languageRow.int("xp") ?: 0,
            streak = userRow.int("streak") ?: 0,
            longestStreak = userRow.int("longest_streak") ?: 0,
            lastActiveDate = userRow.string("last_active_date") ?: "",
            hearts = hearts,
            heartsRefillAt = resolvedRefillAt,
            streakFreezes = userRow.int("streak_freezes") ?: 0,
            leagueTier = languageRow.string("league_tier") ?: "bronze",
        )
    }

    /** Most recently completed first, so the caller can scroll to where the learner left off. */
    suspend fun fetchCompletedLessonIds(course: String): List<String> =
        rowsOf(
            http.rest(
                HttpMethod.Get, "lesson_completions",
                mapOf("select" to "lesson_id", "language" to "eq.$course", "order" to "completed_at.desc"),
            ),
        ).mapNotNull { it.string("lesson_id") }

    suspend fun fetchCefrLevel(course: String): String? =
        rowsOf(http.rest(HttpMethod.Get, "language_progress", mapOf("select" to "cefr_level", "language" to "eq.$course")))
            .firstOrNull()?.string("cefr_level")

    /** Null means no row yet or a row whose placement was never taken; both read as "not placed". */
    suspend fun fetchPlacementTakenAt(course: String): String? =
        rowsOf(http.rest(HttpMethod.Get, "language_progress", mapOf("select" to "placement_taken_at", "language" to "eq.$course")))
            .firstOrNull()?.string("placement_taken_at")

    suspend fun fetchProfileTheme(userId: String): String? =
        rowsOf(http.rest(HttpMethod.Get, "profiles", mapOf("select" to "theme", "id" to "eq.$userId")))
            .firstOrNull()?.string("theme")

    suspend fun updateProfileTheme(theme: String, userId: String) {
        http.requireSuccess(
            http.rest(
                HttpMethod.Patch, "profiles", mapOf("id" to "eq.$userId"),
                body = buildJsonObject { put("theme", theme) },
                headers = mapOf("Prefer" to "return=minimal"),
            ),
        )
    }

    // ---- helpers ----

    private suspend fun rowsOf(response: HttpResponse): List<JsonObject> {
        val text = http.requireSuccess(response)
        val element = runCatching { http.json.parseToJsonElement(text) }.getOrElse { throw ProgressSyncError.InvalidPayload() }
        if (element !is JsonArray) throw ProgressSyncError.InvalidPayload()
        return element.map { it as? JsonObject ?: throw ProgressSyncError.InvalidPayload() }
    }

    private suspend fun objectOf(response: HttpResponse): JsonObject {
        val text = http.requireSuccess(response)
        return runCatching { http.json.parseToJsonElement(text).jsonObject }.getOrElse { throw ProgressSyncError.InvalidPayload() }
    }

    private fun JsonObject.field(key: String): JsonElement? = this[key]?.takeUnless { it is JsonNull }
    private fun JsonObject.string(key: String): String? = field(key)?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
    private fun JsonObject.int(key: String): Int? = field(key)?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }
    private fun JsonObject.double(key: String): Double? = field(key)?.let { runCatching { it.jsonPrimitive.doubleOrNull }.getOrNull() }
    private fun JsonObject.bool(key: String): Boolean? = field(key)?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() }

    companion object {
        /** PostgREST timestamptz, with or without fractional seconds, to epoch milliseconds. */
        fun parsePostgresTimestampMillis(value: String): Double? = try {
            OffsetDateTime.parse(value).toInstant().toEpochMilli().toDouble()
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
