package com.obsidianmedia.learnwithalphonso.core.goal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.floor

/**
 * The learning-goal plan as `/api/learning-goal` returns it. The server computes it (planGoal in
 * src/lib/learning-goal.ts); the device only renders it and never recomputes it. The shared contract is
 * src/lib/learning-goal.fixtures.json, copied into this module's test resources.
 */
enum class GoalStatus {
    DONE, EXPIRED, JUST_STARTED, AHEAD, ON_TRACK, BEHIND,

    /** A status a newer server added. Rendered generically, never an error, so an old app keeps working. */
    UNKNOWN;

    companion object {
        fun fromWire(raw: String): GoalStatus = when (raw) {
            "done" -> DONE
            "expired" -> EXPIRED
            "just_started" -> JUST_STARTED
            "ahead" -> AHEAD
            "on_track" -> ON_TRACK
            "behind" -> BEHIND
            else -> UNKNOWN
        }
    }

    /** The server's spelling, for the offline cache. */
    val wire: String
        get() = when (this) {
            DONE -> "done"
            EXPIRED -> "expired"
            JUST_STARTED -> "just_started"
            AHEAD -> "ahead"
            ON_TRACK -> "on_track"
            BEHIND -> "behind"
            UNKNOWN -> "unknown"
        }
}

enum class GoalRealism {
    OK, AMBITIOUS, UNREALISTIC, UNKNOWN;

    companion object {
        fun fromWire(raw: String): GoalRealism = when (raw) {
            "ok" -> OK
            "ambitious" -> AMBITIOUS
            "unrealistic" -> UNREALISTIC
            else -> UNKNOWN
        }
    }

    val wire: String
        get() = when (this) {
            OK -> "ok"
            AMBITIOUS -> "ambitious"
            UNREALISTIC -> "unrealistic"
            UNKNOWN -> "unknown"
        }
}

data class GoalPlan(
    val currentLevel: String,
    val targetLevel: String,
    val targetDate: String,
    val lessonsInScope: Int,
    val lessonsRemaining: Int,
    val lessonsDoneLast7Days: Int,
    val requiredPerWeek: Int,
    val status: GoalStatus,
    val realism: GoalRealism,
    val suggestedDate: String?,
    val asOf: String,
)

/** `createdAt` is a plain string on purpose: strict date parsing would turn format drift into a failed card. */
data class StoredGoal(val course: String, val targetLevel: String, val targetDate: String, val createdAt: String)

data class LearningGoalState(
    val goal: StoredGoal?,
    /** Null with a goal present means the learner's level has passed the target: pick a new one. */
    val plan: GoalPlan?,
)

sealed class LearningGoalError(message: String) : Exception(message) {
    /** The server rejected the goal; [detail] is its own reason ("That level is below yours"). */
    class Invalid(val detail: String?) : LearningGoalError("invalid")
    object NotSignedIn : LearningGoalError("notSignedIn")
    object Unavailable : LearningGoalError("unavailable")
    object Offline : LearningGoalError("offline")

    /** Same wording as the web card (learning-goal-client.ts goalErrorMessage) and iOS. */
    val userMessage: String
        get() = when (this) {
            is Invalid -> detail ?: "That goal can't be saved. Check the level and date."
            NotSignedIn -> "Sign in again to use goals."
            Unavailable -> "Couldn't load your goal. Try again."
            Offline -> "You're offline. Showing your last saved plan."
        }
}

object LearningGoalDecoding {
    /**
     * Decodes `{ goal, plan }` (stored goal, save, or "none"). A required field that is missing or mistyped is
     * [LearningGoalError.Unavailable]: showing a half-read plan would be worse than an error.
     */
    fun state(text: String): LearningGoalState {
        val obj = parseObject(text)
        val goal = obj["goal"]?.takeUnless { it is JsonNull }?.let { storedGoal(it as? JsonObject ?: throw LearningGoalError.Unavailable) }
        return LearningGoalState(goal, optionalPlan(obj["plan"]))
    }

    /** Decodes the preview response `{ plan }`; a preview always has a plan. */
    fun plan(fromPreview: String): GoalPlan =
        optionalPlan(parseObject(fromPreview)["plan"]) ?: throw LearningGoalError.Unavailable

    private fun parseObject(text: String): JsonObject =
        try {
            ContentJson.json.parseToJsonElement(text) as? JsonObject ?: throw LearningGoalError.Unavailable
        } catch (e: LearningGoalError) {
            throw e
        } catch (e: Exception) {
            throw LearningGoalError.Unavailable
        }

    private fun optionalPlan(element: JsonElement?): GoalPlan? {
        if (element == null || element is JsonNull) return null
        return goalPlan(element as? JsonObject ?: throw LearningGoalError.Unavailable)
    }

    private fun storedGoal(obj: JsonObject) = StoredGoal(
        course = string(obj, "course"),
        targetLevel = string(obj, "targetLevel"),
        targetDate = string(obj, "targetDate"),
        createdAt = string(obj, "createdAt"),
    )

    private fun goalPlan(obj: JsonObject) = GoalPlan(
        currentLevel = string(obj, "currentLevel"),
        targetLevel = string(obj, "targetLevel"),
        targetDate = string(obj, "targetDate"),
        lessonsInScope = int(obj, "lessonsInScope"),
        lessonsRemaining = int(obj, "lessonsRemaining"),
        lessonsDoneLast7Days = int(obj, "lessonsDoneLast7Days"),
        requiredPerWeek = int(obj, "requiredPerWeek"),
        status = GoalStatus.fromWire(string(obj, "status")),
        realism = GoalRealism.fromWire(string(obj, "realism")),
        suggestedDate = obj["suggestedDate"]?.takeUnless { it is JsonNull }?.let { primitive(it)?.takeIf { p -> p.isString }?.content },
        asOf = string(obj, "asOf"),
    )

    private fun primitive(element: JsonElement?): JsonPrimitive? = element as? JsonPrimitive

    private fun string(obj: JsonObject, key: String): String {
        val p = primitive(obj[key])
        if (p == null || p is JsonNull || !p.isString) throw LearningGoalError.Unavailable
        return p.content
    }

    /** A JSON number only (a quoted "20" is a mistyped field); an integral double such as 12.0 is accepted. */
    private fun int(obj: JsonObject, key: String): Int {
        val p = primitive(obj[key])
        if (p == null || p is JsonNull || p.isString) throw LearningGoalError.Unavailable
        p.content.toIntOrNull()?.let { return it }
        val d = p.content.toDoubleOrNull() ?: throw LearningGoalError.Unavailable
        if (d.isNaN() || d.isInfinite() || d != floor(d) || d > Int.MAX_VALUE || d < Int.MIN_VALUE) throw LearningGoalError.Unavailable
        return d.toInt()
    }
}
