package com.obsidianmedia.learnwithalphonso.core.rehearsal

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * "How you spoke": the counts the rehearsal debrief shows under What went well. They sit at the TOP level of the
 * POST /api/call-recap body as `rehearsalSpeaking`, next to `recap`, so they can arrive when the recap itself is null.
 * Absent for any call that is not a rehearsal run. The server orders the notes and caps them at three; this file never
 * re-sorts. A kind this build does not know is dropped. There is no score, percentage or grade anywhere in it: only
 * counts, and a trend against the learner's own last run.
 */
enum class SpeakingKind(val wire: String) {
    FULL_REPLIES("full_replies"),
    ENGLISH_FALLBACK("english_fallback"),
    KEY_PHRASES("key_phrases");

    companion object {
        fun fromWire(raw: String?): SpeakingKind? = entries.firstOrNull { it.wire == raw }
    }
}

data class SpeakingNote(val kind: SpeakingKind, val count: Int, val total: Int, val previous: Int?)

data class RehearsalSpeaking(val notes: List<SpeakingNote>) {
    companion object {
        const val MAX_NOTES = 3
        const val TITLE = "How you spoke"

        private val json = Json { ignoreUnknownKeys = true }

        /** The body of /api/call-recap. Null when `rehearsalSpeaking` is absent, malformed, or holds no known note. */
        fun parse(text: String): RehearsalSpeaking? {
            val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            return fromElement(root["rehearsalSpeaking"])
        }

        fun fromElement(el: kotlinx.serialization.json.JsonElement?): RehearsalSpeaking? {
            val o = el as? JsonObject ?: return null
            val arr = o["notes"] as? JsonArray ?: return null
            val notes = arr.mapNotNull { n ->
                val no = n as? JsonObject ?: return@mapNotNull null
                val kind = SpeakingKind.fromWire(no.str("kind")) ?: return@mapNotNull null
                val count = no.int("count") ?: return@mapNotNull null
                val total = no.int("total") ?: return@mapNotNull null
                SpeakingNote(kind, count, total, no.int("previous"))
            }.take(MAX_NOTES)
            return if (notes.isEmpty()) null else RehearsalSpeaking(notes)
        }

        private fun JsonObject.str(key: String): String? = this[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
        private fun JsonObject.int(key: String): Int? = this[key]?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }
    }
}

/** Which way a count moved against last time. [improved] is true when that move is the better one for its kind. */
data class SpeakingTrend(val direction: Direction, val improved: Boolean) {
    enum class Direction { UP, DOWN, SAME, NONE }
}

object SpeakingRules {
    private val languageNames = mapOf("en" to "English", "fr" to "French", "es" to "Spanish")

    /** "Spanish" for "es"; an unknown code reads as "the language". */
    fun languageName(courseCode: String): String = languageNames[courseCode] ?: "the language"

    private fun times(n: Int) = when (n) { 1 -> "once"; 2 -> "twice"; else -> "$n times" }

    /** ", up from 4 last time", ", down from 4 last time", ", the same as last time", or "" with no earlier run. */
    private fun suffix(count: Int, previous: Int?): String = when {
        previous == null -> ""
        count > previous -> ", up from $previous last time"
        count < previous -> ", down from $previous last time"
        else -> ", the same as last time"
    }

    /** The full sentence TalkBack reads (and the card shows), ending in a full stop. */
    fun sentence(note: SpeakingNote, language: String): String = when (note.kind) {
        SpeakingKind.FULL_REPLIES -> "You answered in full sentences ${note.count} of ${note.total} times${suffix(note.count, note.previous)}."
        SpeakingKind.ENGLISH_FALLBACK ->
            if (note.count == 0) "You stayed in $language the whole time."
            else "You switched to English ${times(note.count)}${suffix(note.count, note.previous)}."
        SpeakingKind.KEY_PHRASES -> "You used ${note.count} of your ${note.total} key phrases${suffix(note.count, note.previous)}."
    }

    /** The small trend mark. Lower is better for switching to English; higher is better for the other two. */
    fun trend(note: SpeakingNote): SpeakingTrend {
        val prev = note.previous ?: return SpeakingTrend(SpeakingTrend.Direction.NONE, false)
        val lowerIsBetter = note.kind == SpeakingKind.ENGLISH_FALLBACK
        return when {
            note.count > prev -> SpeakingTrend(SpeakingTrend.Direction.UP, !lowerIsBetter)
            note.count < prev -> SpeakingTrend(SpeakingTrend.Direction.DOWN, lowerIsBetter)
            else -> SpeakingTrend(SpeakingTrend.Direction.SAME, false)
        }
    }
}
