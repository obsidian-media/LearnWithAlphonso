package com.obsidianmedia.learnwithalphonso.core.path

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * The learning path as `/api/learning-path` returns it (docs/superpowers/specs/2026-11-12-learning-path-design.md).
 * The server computes it once (planPath in src/lib/path-plan.ts); the device only renders it and never recomputes it,
 * so web, iOS and Android always show the same plan. The shared contract is src/lib/learning-path.fixtures.json,
 * copied into this module's test resources (guarded by src/lib/learning-path-native-fixtures.test.ts).
 *
 * Types and states stay plain strings on the wire: a type a newer server adds (videos, later) decodes fine and is
 * drawn generically by [PathKind.UNKNOWN], never an error.
 */
enum class PathKind(val wire: String, val label: String, val noun: String) {
    LESSON("lesson", "Lessons", "Lesson"),
    PODCAST("podcast", "Podcasts", "Podcast"),
    TALK("talk", "Talk", "Talk to Alphonso"),
    CAMPAIGN("campaign", "Campaigns", "Story campaign"),
    UNKNOWN("unknown", "Activity", "Activity");

    companion object {
        fun fromWire(raw: String?): PathKind = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN

        /** The types a learner may switch off (lessons are the backbone). */
        val optional: List<PathKind> = listOf(PODCAST, TALK, CAMPAIGN)
    }
}

@Serializable
data class PathItemRef(val kind: String, val id: String, val sceneIndex: Int? = null)

@Serializable
data class PathItem(
    val type: String,
    val id: String,
    val title: String,
    val subtitle: String,
    val minutes: Int,
    /** "done", "next" or "todo". */
    val state: String,
    val ref: PathItemRef? = null,
) {
    val kind: PathKind get() = PathKind.fromWire(type)
}

@Serializable
data class PathMixEntry(val type: String, val minutes: Int, val share: Int, val count: Int) {
    val kind: PathKind get() = PathKind.fromWire(type)
}

@Serializable
data class PathDay(
    val day: String,
    val label: String,
    /** "done", "missed", "today", "upcoming" or "rest". */
    val state: String,
    val minutes: Int,
    val items: List<PathItem>,
)

@Serializable
data class PathWhy(val type: String, val headline: String, val detail: String, val source: String) {
    val kind: PathKind get() = PathKind.fromWire(type)
}

@Serializable
data class PathRecovery(
    /** "lessons_first", "move_date" or "add_minutes". */
    val id: String,
    val title: String,
    val detail: String,
    val suggested: Boolean,
    val date: String? = null,
    val dailyMinutes: Int? = null,
    val lessonsPerWeek: Int? = null,
    val mix: List<PathMixEntry>? = null,
)

@Serializable
data class PathStop(
    /** "level", "item", "unit" or "goal". */
    val kind: String,
    val type: String? = null,
    val title: String,
    val subtitle: String,
    val note: String,
    /** "done", "current" or "upcoming". */
    val state: String,
    val estDate: String? = null,
    val ref: PathItemRef? = null,
) {
    val pathKind: PathKind? get() = type?.let { PathKind.fromWire(it) }
}

@Serializable
data class PathStreak(val type: String, val days: Int, val weekMinutes: Int) {
    val kind: PathKind get() = PathKind.fromWire(type)
}

@Serializable
data class PathProgress(
    val lessonsDone: Int,
    val lessonsInScope: Int,
    val requiredPerWeek: Int,
    val doneLast7Days: Int,
    val targetLevel: String,
    val targetDate: String,
    val suggestedDate: String? = null,
)

@Serializable
data class PathToday(val day: String, val targetMinutes: Int, val minutesLeft: Int, val items: List<PathItem>)

@Serializable
data class LearningPath(
    val asOf: String,
    val course: String,
    val goalLabel: String,
    /** The goal planner's status ("on_track", "behind", ...). The words are in [statusLine]. */
    val status: String,
    val statusLine: String,
    val statusDetail: String,
    val progress: PathProgress,
    val dailyMinutes: Int,
    /** The rest day as planned: 0 (Sunday) to 6, or [PathRestDay.NONE] (-1) for seven study days. An older server omits it: Sunday. */
    val restDay: Int = PathRestDay.SUNDAY,
    val weekMinutes: Int,
    val weekDoneMinutes: Int,
    val trimmed: Boolean,
    val trimUntil: String? = null,
    val off: List<String>,
    val mix: List<PathMixEntry>,
    val today: PathToday,
    val week: List<PathDay>,
    val road: List<PathStop>,
    val recovery: List<PathRecovery>,
    val why: List<PathWhy>,
    val streaks: List<PathStreak>,
) {
    /** Share of the lessons in scope that are done, 0..1, for the progress bar. */
    val lessonFraction: Float get() = progress.lessonsDone.toFloat() / maxOf(progress.lessonsInScope, 1)

    /** Share of this week's minutes that are done, 0..1. */
    val weekFraction: Float get() = minOf(1f, weekDoneMinutes.toFloat() / maxOf(weekMinutes, 1))
}

sealed class LearningPathError(message: String) : Exception(message) {
    object NotSignedIn : LearningPathError("Sign in again to see your path.")
    object Unavailable : LearningPathError("Couldn't load your path.")
    object Offline : LearningPathError("You are offline. Connect to load your path.")

    val userMessage: String get() = message ?: "Couldn't load your path."
}

object LearningPathDecoding {
    /**
     * Decodes `{ path }`; null is "no goal yet". A path missing a required part is [LearningPathError.Unavailable]:
     * a half-read plan would be worse than an error.
     */
    fun path(text: String): LearningPath? {
        val root: JsonObject = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }
            .getOrElse { throw LearningPathError.Unavailable }
        if (!root.containsKey("path")) throw LearningPathError.Unavailable
        val inner = root.getValue("path")
        if (inner is JsonNull) return null
        return runCatching { ContentJson.json.decodeFromJsonElement(LearningPath.serializer(), inner) }
            .getOrElse { throw LearningPathError.Unavailable }
    }
}

/** One change the learner can make, sent as `PUT /api/learning-path`. */
sealed interface LearningPathChange {
    data class SetOff(val off: List<PathKind>) : LearningPathChange
    object LessonsFirst : LearningPathChange
    object Resume : LearningPathChange
    data class SetDailyMinutes(val minutes: Int) : LearningPathChange

    /** 0 (Sunday) to 6, or [PathRestDay.NONE] for no rest day. */
    data class SetRestDay(val day: Int) : LearningPathChange
}

/** The rest-day choices in "Build my path", shared by the three platforms (weekday 0 = Sunday, -1 = none). */
object PathRestDay {
    const val SUNDAY = 0
    const val NONE = -1
    val WEEKDAY_LABELS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

    /** Every choice in the order they are shown: the seven weekdays, then "No rest day". */
    val CHOICES: List<Pair<Int, String>> = WEEKDAY_LABELS.mapIndexed { i, label -> i to label } + (NONE to "No rest day")

    /** Study days a week with this rest day: six, or seven with none. */
    fun studyDays(restDay: Int): Int = if (restDay == NONE) 7 else 6
}

/** What the screens need from the server; [com.obsidianmedia.learnwithalphonso.core.net.LearningPathClient] implements it. */
interface PathApi {
    suspend fun fetch(course: String): LearningPath?
    suspend fun change(course: String, change: LearningPathChange): LearningPath?
}
