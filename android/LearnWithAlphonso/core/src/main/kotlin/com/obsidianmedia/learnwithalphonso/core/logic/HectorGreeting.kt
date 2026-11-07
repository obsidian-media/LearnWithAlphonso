package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.WeaknessTrendEntry
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Hector speaks first (BACKLOG 0.0-bp): the short greeting he says when a Hector call opens. Built here from fixed
 * templates, with no LLM call, so it costs only its speech (/api/tts, through OpenerSpeechCache like Alphonso's openers).
 *
 * Port of src/lib/hector-greeting.ts and HectorGreeting.swift; keep the three in step. Nothing the learner typed is
 * ever spoken: the name must look like a first name, and the weak spot is only ever one of our own labels below,
 * looked up by its taxonomy key (WEAKNESS_TAXONOMY in src/lib/weakness-detection.server.ts).
 */
object HectorGreeting {
    /** French puts a no-break space before ! and ?. */
    private const val NB = " "

    fun build(course: Course, cefrLevel: String?, name: String?, weakSpot: String?): String {
        val hi = head(course, safeLearnerName(name))
        val level = cefrLevel?.trim()?.uppercase().orEmpty()
        val simple = level.isEmpty() || level == "A1" || level == "A2"
        val topic = topicLabel(course, weakSpot)
        if (topic != null) return when (course) {
            Course.ENGLISH -> if (simple) "$hi Last time you had trouble with $topic. Let's practise together. Ready?"
            else "$hi Last time $topic tripped you up. Want to practise that in conversation?"
            Course.FRENCH -> if (simple) "$hi La dernière fois, tu as eu du mal avec $topic. On s'entraîne ensemble$NB?"
            else "$hi La dernière fois, tu as eu du mal avec $topic. Tu veux t'entraîner en conversation$NB?"
            Course.SPANISH -> if (simple) "$hi La última vez tuviste problemas con $topic. ¿Practicamos juntos?"
            else "$hi La última vez tuviste dificultades con $topic. ¿Te animas a practicar conversando?"
        }
        return when (course) {
            Course.ENGLISH -> if (simple) "$hi I'm Hector. What do you want to talk about today?"
            else "$hi Good to see you. What's been happening lately? Tell me about it."
            Course.FRENCH -> if (simple) "$hi Moi, c'est Hector. De quoi tu veux parler aujourd'hui$NB?"
            else "$hi Content de te voir. Raconte-moi, quoi de neuf$NB?"
            Course.SPANISH -> if (simple) "$hi Soy Hector. ¿De qué quieres hablar hoy?"
            else "$hi Qué gusto verte. Cuéntame, ¿qué hay de nuevo?"
        }
    }

    private fun head(course: Course, name: String?): String = when (course) {
        Course.ENGLISH -> if (name != null) "Hi $name!" else "Hi!"
        Course.FRENCH -> if (name != null) "Salut $name$NB!" else "Salut$NB!"
        Course.SPANISH -> if (name != null) "¡Hola, $name!" else "¡Hola!"
    }

    /** Taxonomy keys are short; anything longer is not one of ours. */
    private const val MAX_CATEGORY_LENGTH = 40

    /** Our own words for a weakness category in this course, or null when it is not one of ours. */
    fun topicLabel(course: Course, category: String?): String? {
        if (category == null || category.length > MAX_CATEGORY_LENGTH) return null
        return TOPICS[course]?.get(category.trim().lowercase())
    }

    private val TOPICS: Map<Course, Map<String, String>> = mapOf(
        Course.ENGLISH to mapOf(
            "past-tense" to "the past tense", "articles" to "articles", "prepositions" to "prepositions",
            "subject-verb-agreement" to "subject-verb agreement", "plurals" to "plurals",
            "question-formation" to "asking questions", "modal-verbs" to "modal verbs", "word-order" to "word order",
            "pronouns" to "pronouns", "comparatives" to "comparing things", "conditionals" to "conditionals",
            "phrasal-verbs" to "phrasal verbs", "negation" to "negative sentences",
            "vocabulary-choice" to "choosing the right word", "spelling" to "spelling",
        ),
        // English-only grammar (phrasal verbs) is not named in French or Spanish.
        Course.FRENCH to mapOf(
            "past-tense" to "le passé", "articles" to "les articles", "prepositions" to "les prépositions",
            "subject-verb-agreement" to "l'accord du verbe", "plurals" to "le pluriel",
            "question-formation" to "les questions", "modal-verbs" to "les verbes comme pouvoir et devoir",
            "word-order" to "l'ordre des mots", "pronouns" to "les pronoms", "comparatives" to "les comparaisons",
            "conditionals" to "le conditionnel", "negation" to "la négation",
            "vocabulary-choice" to "le choix des mots", "spelling" to "l'orthographe",
        ),
        Course.SPANISH to mapOf(
            "past-tense" to "el pasado", "articles" to "los artículos", "prepositions" to "las preposiciones",
            "subject-verb-agreement" to "la concordancia del verbo", "plurals" to "el plural",
            "question-formation" to "las preguntas", "modal-verbs" to "verbos como poder y deber",
            "word-order" to "el orden de las palabras", "pronouns" to "los pronombres",
            "comparatives" to "las comparaciones", "conditionals" to "el condicional", "negation" to "la negación",
            "vocabulary-choice" to "la elección de palabras", "spelling" to "la ortografía",
        ),
    )

    private const val MAX_NAME_LENGTH = 20
    /** Letters, with an inner apostrophe or hyphen (O'Neil, Mary-Jane). */
    private val FIRST_NAME = Regex("^\\p{L}+(?:['’-]\\p{L}+)*$")

    /**
     * The first word of a name, when it looks like a first name; otherwise null and Hector greets without one. A
     * generated public handle ("Learner-4F2A") is not a name.
     */
    fun safeLearnerName(raw: String?): String? {
        val first = raw?.trim()?.split(Regex("\\s+"))?.firstOrNull().orEmpty()
        if (first.isEmpty() || first.length > MAX_NAME_LENGTH) return null
        if (first.lowercase().startsWith("learner-")) return null
        return if (FIRST_NAME.matches(first)) first else null
    }

    private const val RECENT_SECONDS = 30L * 86_400

    /** The open weakness seen most recently, if that was in the last 30 days. */
    fun recentWeakSpot(entries: List<WeaknessTrendEntry>, now: Instant = Instant.now()): String? =
        entries.asSequence()
            .filter { it.openCount > 0 }
            .mapNotNull { e -> parse(e.lastEventAt)?.let { e.category to it } }
            .filter { (_, at) -> now.epochSecond - at.epochSecond <= RECENT_SECONDS }
            .maxByOrNull { (_, at) -> at }
            ?.first

    private fun parse(raw: String): Instant? =
        runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull() ?: runCatching { Instant.parse(raw) }.getOrNull()
}
