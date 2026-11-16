package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant

/**
 * The after-call recap (POST /api/call-recap) and What Alphonso remembers (GET/DELETE /api/tutor-memory) as plain
 * values, twin of the iOS Kit's CallRecap.swift. The server decides everything that matters (who is Pro, whose call it
 * is, what the model may add); this file only reads its answers. A recap that is missing, empty or malformed parses to
 * null, and the result screen then shows its slip exactly as before.
 */
data class CallRecap(
    val corrections: List<Correction>,
    val phrase: Phrase?,
    /** Signed by the server; "Review these" sends it back. Null: the button is not shown. */
    val reviewToken: String?,
    /** True when this recap was kept in What Alphonso remembers (a Pro learner). */
    val saved: Boolean,
    val reviewCount: Int,
) {
    data class Correction(val said: String, val fixed: String, val why: String, val topic: String, val label: String?)
    data class Phrase(val text: String, val meaning: String)

    companion object {
        /** Calls shorter than this get no recap, and nothing is sent. */
        const val MIN_LEARNER_TURNS = 3

        fun qualifies(roles: List<String>): Boolean = roles.count { it == "user" } >= MIN_LEARNER_TURNS

        private val json = Json { ignoreUnknownKeys = true }

        /** The answer of /api/call-recap. Null for `{"recap": null}`, an empty recap or anything malformed. */
        fun parse(text: String): CallRecap? {
            val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            val recap = root["recap"] as? JsonObject ?: return null
            val corrections = (recap["corrections"] as? JsonArray).elements().mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val said = o.str("said"); val fixed = o.str("fixed"); val why = o.str("why"); val topic = o.str("topic")
                if (said.isNullOrEmpty() || fixed.isNullOrEmpty() || why == null || topic == null) null
                else Correction(said, fixed, why, topic, o.str("label"))
            }
            val p = recap["phrase"] as? JsonObject
            val phrase = p?.let { o ->
                val t = o.str("text"); val m = o.str("meaning")
                if (t.isNullOrEmpty() || m == null) null else Phrase(t, m)
            }
            if (corrections.isEmpty() && phrase == null) return null
            val token = recap.str("reviewToken")?.takeIf { it.isNotEmpty() }
            return CallRecap(
                corrections, phrase, token,
                saved = recap["saved"]?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() } ?: false,
                reviewCount = recap["reviewCount"]?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }
                    ?: (corrections.size + if (phrase == null) 0 else 1),
            )
        }
    }
}

private fun JsonObject.str(key: String): String? = this[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
private fun JsonArray?.elements(): List<kotlinx.serialization.json.JsonElement> = this?.toList() ?: emptyList()

/** What Alphonso remembers about a Pro learner, as the server listed it. */
data class TutorMemory(val mistakes: List<Mistake>, val phrases: List<Phrase>, val goals: Goals) {
    data class Mistake(val id: String, val topic: String, val label: String, val seenCount: Int, val lastSeenAt: Instant) {
        /** "Seen in 4 calls, last 2 days ago". */
        fun note(now: Instant = Instant.now()): String {
            val calls = if (seenCount == 1) "1 call" else "$seenCount calls"
            val ago = agoLabel(lastSeenAt, now)
            val whenText = if (ago.startsWith("last")) ago else "last $ago"
            return "Seen in $calls, $whenText"
        }
    }

    data class Phrase(val id: String, val course: String, val text: String, val meaning: String)
    data class Goals(val goal: String?, val dailyMinutes: Int?, val interests: List<String>)

    /** One goal line: which answer it clears when removed. */
    data class GoalLine(val key: String, val title: String, val note: String)

    val goalLines: List<GoalLine>
        get() {
            val out = mutableListOf<GoalLine>()
            goals.goal?.let { g -> GOAL_LABELS[g]?.let { out += GoalLine("goal", it, "You chose this when you started") } }
            goals.dailyMinutes?.takeIf { it in DAILY_MINUTE_CHOICES }?.let {
                out += GoalLine("dailyMinutes", "$it minutes a day", "You chose this when you started")
            }
            val names = goals.interests.mapNotNull { INTEREST_LABELS[it] }
            if (names.isNotEmpty()) {
                val words = names.mapIndexed { i, n -> if (i == 0) n else n.lowercase() }
                val title = if (words.size == 1) words[0] else words.dropLast(1).joinToString(", ") + " and " + words.last()
                out += GoalLine("interests", title, "Topics you picked")
            }
            return out
        }

    val isEmpty: Boolean get() = mistakes.isEmpty() && phrases.isEmpty() && goalLines.isEmpty()

    /** "3 mistakes, 4 phrases, 3 goals." */
    val summary: String
        get() {
            fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"
            return "${plural(mistakes.size, "mistake", "mistakes")}, ${plural(phrases.size, "phrase", "phrases")}, ${plural(goalLines.size, "goal", "goals")}."
        }

    companion object {
        val GOAL_LABELS = mapOf("travel" to "Travel", "work" to "Work", "school" to "School", "family" to "Family", "exam" to "An exam", "fun" to "Just for fun")
        val INTEREST_LABELS = mapOf(
            "food" to "Food", "travel" to "Travel", "sport" to "Sport", "music" to "Music", "movies" to "Movies and TV",
            "business" to "Business", "tech" to "Tech", "nature" to "Nature", "art" to "Art", "family" to "Family",
        )
        val DAILY_MINUTE_CHOICES = listOf(5, 10, 15, 20)
        val GOAL_CHOICES = listOf("travel", "work", "school", "family", "exam", "fun")
        val INTEREST_CHOICES = listOf("food", "travel", "sport", "music", "movies", "business", "tech", "nature", "art", "family")

        /** "today", "yesterday", "2 days ago", "last week", "3 weeks ago", "2 months ago". */
        fun agoLabel(date: Instant, now: Instant = Instant.now()): String {
            val days = ((now.epochSecond - date.epochSecond) / 86_400).toInt()
            return when {
                days <= 0 -> "today"
                days == 1 -> "yesterday"
                days < 7 -> "$days days ago"
                days < 14 -> "last week"
                days < 60 -> "${days / 7} weeks ago"
                else -> "${days / 30} months ago"
            }
        }

        private val json = Json { ignoreUnknownKeys = true }

        /** GET /api/tutor-memory's body. */
        fun parse(text: String): TutorMemory? {
            val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            val mistakes = (root["mistakes"] as? JsonArray).elements().mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val id = o.str("id"); val topic = o.str("topic"); val label = o.str("label")
                val seen = o["seenCount"]?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }
                val last = o.str("lastSeenAt")?.let { runCatching { Instant.parse(it) }.getOrNull() }
                if (id == null || topic == null || label == null || seen == null || last == null) null
                else Mistake(id, topic, label, seen, last)
            }
            val phrases = (root["phrases"] as? JsonArray).elements().mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val id = o.str("id"); val text0 = o.str("text") ?: return@mapNotNull null
                if (id == null) null else Phrase(id, o.str("course") ?: "en", text0, o.str("meaning") ?: "")
            }
            val g = root["goals"] as? JsonObject
            val goals = Goals(
                goal = g?.str("goal"),
                dailyMinutes = g?.get("dailyMinutes")?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() },
                interests = (g?.get("interests") as? JsonArray).elements().mapNotNull { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() },
            )
            return TutorMemory(mistakes, phrases, goals)
        }
    }
}

/** What opening What Alphonso remembers found out. */
sealed interface TutorMemoryLoad {
    data class Ready(val memory: TutorMemory) : TutorMemoryLoad
    /** Not a Pro learner: the page is shown locked. */
    data object Locked : TutorMemoryLoad
    data object Failed : TutorMemoryLoad
}
