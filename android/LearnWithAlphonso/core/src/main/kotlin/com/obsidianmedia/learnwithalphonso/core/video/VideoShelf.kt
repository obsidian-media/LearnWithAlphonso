package com.obsidianmedia.learnwithalphonso.core.video

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.net.URLEncoder

/** The practice item a video points at (`videos.practice_kind` / `practice_id`): a lesson, a Talk scenario or a story campaign. */
data class VideoPractice(val kind: String, val id: String)

/** One Alphonso video as the Watch shelf draws it, with this learner's progress. Mirrors the web's LibraryVideo and iOS's. */
data class LibraryVideo(
    val id: String,
    val slug: String,
    val course: String,
    val title: String,
    val description: String? = null,
    val level: String? = null,
    val durationSeconds: Int,
    val videoUrl: String,
    val posterUrl: String? = null,
    /** WebVTT. Always present on a published video (the database refuses to publish without it). */
    val captionsUrl: String,
    val tags: List<String> = emptyList(),
    val practice: VideoPractice? = null,
    val sortOrder: Int = 0,
    val progressSeconds: Int = 0,
    val completedAt: String? = null,
)

enum class VideoState { NEW, IN_PROGRESS, DONE }

/** What the Watch shelf's "practice this" opens. The app maps it to its own routes. */
sealed interface VideoPracticeTarget {
    data class Lesson(val id: String) : VideoPracticeTarget
    data class Talk(val id: String) : VideoPracticeTarget
    data class Campaign(val id: String, val scene: Int = 0) : VideoPracticeTarget
}

/** The Watch shelf's rules (state, resume, speeds, the practice link), pure so they are tested. Same thresholds as web and iOS. */
object VideoShelf {
    /** Captions are ON when a video opens (accessibility, and viewing with the sound off). */
    const val CAPTIONS_DEFAULT_ON = true
    /** A restart is offered instead of a resume inside the last stretch of a video. */
    const val RESUME_END_GUARD_SECONDS = 3
    val SPEEDS = listOf(0.75, 1.0, 1.25, 1.5)
    /** Progress is saved at most this often while playing (and on pause, close and end). */
    const val SAVE_EVERY_SECONDS = 5.0
    const val BUCKET = "videos"

    fun state(video: LibraryVideo): VideoState = when {
        video.completedAt != null -> VideoState.DONE
        video.progressSeconds > 0 -> VideoState.IN_PROGRESS
        else -> VideoState.NEW
    }

    /** 0..1 watched. A finished video is 1 whatever its last position says. */
    fun fraction(video: LibraryVideo): Double = when {
        video.completedAt != null -> 1.0
        video.durationSeconds <= 0 -> 0.0
        else -> (video.progressSeconds.toDouble() / video.durationSeconds).coerceIn(0.0, 1.0)
    }

    /** Where playback starts: the saved position, or 0 for a finished video, a new one, or one saved at its very end. */
    fun resumeSeconds(video: LibraryVideo): Int = when {
        video.completedAt != null || video.progressSeconds <= 0 -> 0
        video.progressSeconds >= video.durationSeconds - RESUME_END_GUARD_SECONDS -> 0
        else -> video.progressSeconds
    }

    /** The Watch shelf for one course, in shelf order. Empty means the shelf is NOT drawn (no empty box). */
    fun shelf(videos: List<LibraryVideo>, course: String): List<LibraryVideo> =
        videos.filter { it.course == course }.sortedWith(compareBy({ it.sortOrder }, { it.title }))

    /** The next speed in the cycle; an unknown current speed restarts at normal speed. */
    fun nextSpeed(current: Double): Double {
        val index = SPEEDS.indexOf(current)
        return if (index < 0) 1.0 else SPEEDS[(index + 1) % SPEEDS.size]
    }

    fun speedLabel(speed: Double): String = if (speed == Math.rint(speed)) "${speed.toInt()}x" else "${speed}x"

    /** 49 -> "0:49", 372.4 -> "6:12". Negative and non-finite values read as 0:00. */
    fun clock(seconds: Double): String {
        val total = if (seconds.isFinite()) Math.round(seconds).coerceAtLeast(0L).toInt() else 0
        return "%d:%02d".format(total / 60, total % 60)
    }

    /** Where the one-tap "practice this" after a video goes, or null when the video names no practice (or a kind this app does not know). */
    fun practiceTarget(practice: VideoPractice?): VideoPracticeTarget? {
        if (practice == null || practice.id.isEmpty()) return null
        return when (practice.kind) {
            "lesson" -> VideoPracticeTarget.Lesson(practice.id)
            "talk" -> VideoPracticeTarget.Talk(practice.id)
            "campaign" -> VideoPracticeTarget.Campaign(practice.id, 0)
            else -> null
        }
    }

    fun practiceLabel(practice: VideoPractice): String = when (practice.kind) {
        "lesson" -> "Practice this in a lesson"
        "talk" -> "Practice this with Alphonso"
        else -> "Practice this in a story"
    }

    /** The public URL of an object in the `videos` bucket, or null for an empty path. Segment by segment, so a space in a file name is encoded. */
    fun publicUrl(supabaseUrl: String, path: String): String? {
        val segments = path.split("/").filter { it.isNotEmpty() }
        if (segments.isEmpty()) return null
        val encoded = segments.joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        return "${supabaseUrl.trimEnd('/')}/storage/v1/object/public/$BUCKET/$encoded"
    }

    private fun JsonObject.str(key: String): String? =
        this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }

    private fun JsonObject.int(key: String): Int? =
        this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }

    /**
     * Builds the shelf's rows from the two PostgREST answers. A row the app cannot play (an unknown course, no captions, no
     * video path) is dropped: showing it would break the captions-on promise. A failed progress read is an empty [watchRows].
     */
    fun videos(videoRows: List<JsonObject>, watchRows: List<JsonObject>, supabaseUrl: String): List<LibraryVideo> {
        val watches = HashMap<String, Pair<Int, String?>>()
        for (row in watchRows) {
            val id = row.str("video_id") ?: continue
            watches[id] = (row.int("progress_seconds") ?: 0) to row.str("completed_at")
        }
        return videoRows.mapNotNull { row ->
            val id = row.str("id") ?: return@mapNotNull null
            val course = row.str("course")?.takeIf { it in listOf("en", "fr", "es") } ?: return@mapNotNull null
            val duration = row.int("duration_seconds")?.takeIf { it > 0 } ?: return@mapNotNull null
            val videoUrl = publicUrl(supabaseUrl, row.str("video_path") ?: return@mapNotNull null) ?: return@mapNotNull null
            val captionsUrl = publicUrl(supabaseUrl, row.str("captions_path") ?: return@mapNotNull null) ?: return@mapNotNull null
            val kind = row.str("practice_kind")
            val practiceId = row.str("practice_id")
            val practice = if (kind != null && practiceId != null && practiceId.isNotEmpty() && kind in listOf("lesson", "talk", "campaign")) VideoPractice(kind, practiceId) else null
            val watch = watches[id]
            LibraryVideo(
                id = id,
                slug = row.str("slug") ?: return@mapNotNull null,
                course = course,
                title = row.str("title") ?: return@mapNotNull null,
                description = row.str("description"),
                level = row.str("level_id"),
                durationSeconds = duration,
                videoUrl = videoUrl,
                posterUrl = row.str("poster_path")?.let { publicUrl(supabaseUrl, it) },
                captionsUrl = captionsUrl,
                tags = (row["tags"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList(),
                practice = practice,
                sortOrder = row.int("sort_order") ?: 0,
                progressSeconds = watch?.first ?: 0,
                completedAt = watch?.second,
            )
        }
    }
}
