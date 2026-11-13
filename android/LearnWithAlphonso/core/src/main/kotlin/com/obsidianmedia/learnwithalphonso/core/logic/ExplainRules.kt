package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

/**
 * "Explain in my language" (BACKLOG 0.0-bc), Android's copy of the pure rules in the web's src/lib/explain.ts and the
 * iOS Kit's ExplainRules.swift. The lesson stays wholly in the course language; only the WHY is offered in the learner's
 * own language, and only when asked.
 */
enum class ExplainDirection(val wire: String) {
    RTL("rtl"), LTR("ltr");

    companion object {
        fun parse(raw: String?): ExplainDirection? = entries.firstOrNull { it.wire == raw }
    }
}

/** How the learner wants help, kept in the learner profile as `explainMode`. Absent or unknown is [TAP]. */
enum class ExplainMode(val wire: String) {
    TAP("tap"), ALWAYS("always"), OFF("off");

    companion object {
        val DEFAULT = TAP
        fun parse(raw: String?): ExplainMode = entries.firstOrNull { it.wire == raw } ?: DEFAULT
    }
}

/** What a screen shows: a chip to tap, the explanation straight away, or nothing. */
enum class ExplainOffer { CHIP, AUTO, HIDDEN }

/** A piece of an explanation: [ltr] runs are quoted course-language phrases kept left to right inside right-to-left text. */
data class DirectionRun(val text: String, val ltr: Boolean)

enum class ExplainKind { WRONG_ANSWER, WORD, MESSAGE }

/** One item to explain. The language is NOT in it: the server reads it from the account. */
sealed class ExplainRequest {
    abstract val kind: ExplainKind
    abstract val course: String
    abstract fun toJson(): JsonObject
}

private class WrongAnswerRequest(override val course: String, val question: String, val wrongAnswer: String, val correctAnswer: String, val hector: Boolean) : ExplainRequest() {
    override val kind = ExplainKind.WRONG_ANSWER
    override fun toJson() = buildJsonObject {
        put("kind", "wrong-answer"); put("course", course)
        put("question", question); put("wrongAnswer", wrongAnswer); put("correctAnswer", correctAnswer)
        if (hector) put("surface", "hector")
    }
}

private class WordRequest(override val course: String, val word: String, val sentence: String?, val hector: Boolean) : ExplainRequest() {
    override val kind = ExplainKind.WORD
    override fun toJson() = buildJsonObject {
        put("kind", "word"); put("course", course); put("word", word)
        sentence?.let { put("sentence", it) }
        if (hector) put("surface", "hector")
    }
}

private class MessageRequest(override val course: String, val text: String, val hector: Boolean) : ExplainRequest() {
    override val kind = ExplainKind.MESSAGE
    override fun toJson() = buildJsonObject {
        put("kind", "message"); put("course", course); put("text", text)
        if (hector) put("surface", "hector")
    }
}

object ExplainRules {
    /** Its own daily budget, like `define`. Must agree with the server (EXPLAIN_DAILY_LIMIT in src/lib/explain.ts). */
    const val DAILY_LIMIT = 40

    const val WRONG_ANSWER_MAX = 400
    const val WORD_MAX = 80
    const val SENTENCE_MAX = 400
    const val MESSAGE_MAX = 1000

    private val COURSES = setOf("en", "fr", "es")

    /** Scripts written right to left among the languages a learner can choose. Kurdish "ku" stays left to right. */
    private val RTL_LANGUAGES = setOf("ar", "fa", "he", "ur", "ps")

    fun languageDirection(code: String): ExplainDirection = if (code in RTL_LANGUAGES) ExplainDirection.RTL else ExplainDirection.LTR

    /**
     * Nothing when the learner chose "Target language only", has no native language on file, or their native language
     * IS the course's.
     */
    fun offer(mode: ExplainMode, nativeLanguage: String?, course: String): ExplainOffer {
        if (mode == ExplainMode.OFF) return ExplainOffer.HIDDEN
        if (nativeLanguage.isNullOrEmpty() || nativeLanguage == course) return ExplainOffer.HIDDEN
        return if (mode == ExplainMode.ALWAYS) ExplainOffer.AUTO else ExplainOffer.CHIP
    }

    /** The language's name in English ("Persian"): the chip says "Explain in Persian". */
    fun languageName(code: String): String = Locale.forLanguageTag(code).getDisplayLanguage(Locale.ENGLISH).ifEmpty { code }

    /** Trimmed, then cut to [max] code points (never in the middle of an emoji). Empty stays empty. */
    internal fun cut(text: String, max: Int): String {
        val t = text.trim()
        if (t.codePointCount(0, t.length) <= max) return t
        return t.substring(0, t.offsetByCodePoints(0, max))
    }

    /** The item for a missed question, or null when there is nothing to explain or the course is unknown. */
    fun wrongAnswer(question: String, wrongAnswer: String, correctAnswer: String, course: String, hector: Boolean = false): ExplainRequest? {
        if (course !in COURSES) return null
        val q = cut(question, WRONG_ANSWER_MAX)
        val w = cut(wrongAnswer, WRONG_ANSWER_MAX)
        val c = cut(correctAnswer, WRONG_ANSWER_MAX)
        if (q.isEmpty() || w.isEmpty() || c.isEmpty()) return null
        return WrongAnswerRequest(course, q, w, c, hector)
    }

    /** The item for a word on its card; an empty or missing sentence is left out. */
    fun word(word: String, sentence: String?, course: String, hector: Boolean = false): ExplainRequest? {
        if (course !in COURSES) return null
        val w = cut(word, WORD_MAX)
        if (w.isEmpty()) return null
        return WordRequest(course, w, sentence?.let { cut(it, SENTENCE_MAX) }?.takeIf { it.isNotEmpty() }, hector)
    }

    /** The item for a tutor's chat message ("Say that in Persian"). [hector] spends Hector's own Pro allowance. */
    fun message(text: String, course: String, hector: Boolean = false): ExplainRequest? {
        if (course !in COURSES) return null
        val t = cut(text, MESSAGE_MAX)
        if (t.isEmpty()) return null
        return MessageRequest(course, t, hector)
    }

    private val LATIN_RUN = Regex("""\p{IsLatin}[\p{IsLatin}\p{N}'’]*(?:[ ,.!?'’-]+\p{IsLatin}[\p{IsLatin}\p{N}'’]*)*[.!?]?""")

    /**
     * A right-to-left explanation quotes the course language ("I live here."). Those quotes must stay left to right and
     * isolated from the surrounding sentence, so the learner sees the pattern whole. The pieces always join back to
     * exactly the input.
     */
    fun splitDirectionRuns(text: String): List<DirectionRun> {
        val runs = ArrayList<DirectionRun>()
        var last = 0
        for (m in LATIN_RUN.findAll(text)) {
            val at = m.range.first
            if (at > last) runs.add(DirectionRun(text.substring(last, at), false))
            runs.add(DirectionRun(m.value, true))
            last = m.range.last + 1
        }
        if (last < text.length) runs.add(DirectionRun(text.substring(last), false))
        return runs
    }
}

/** Wording for Settings and the chips, the same as the web and iOS. */
object ExplainCopy {
    const val SETTINGS_TITLE = "Explain in my language"
    const val MY_LANGUAGE = "My language"
    const val FROM_FIRST_RUN = "From your first-run answers."
    const val TAP_TITLE = "Tap to explain"
    const val ALWAYS_TITLE = "Always show"
    const val OFF_TITLE = "Target language only"
    const val DEFAULT_BADGE = "Default"
    const val ABOUT_HEADING = "About these explanations."
    const val SAVE_FAILED = "Couldn't save that. Try again."
    const val NOT_CLEAR = "Not clear?"
    const val SHOW_IN_ENGLISH = "Show in English"
    const val HIDE = "Hide"
    const val EXPLAINING = "Explaining..."
    const val ALPHONSO_EXPLAINS = "Alphonso explains"
    const val RETRY = "Try again"

    fun tapBody(language: String) = "A small \"Explain in $language\" button appears when you are stuck. Nothing is translated until you tap."
    fun alwaysBody(language: String) = "Mistakes and new words show the $language explanation straight away. Good for the first weeks. Uses your daily explanation allowance faster."
    const val OFF_BODY = "No translated help anywhere. Alphonso keeps everything in the language you are learning."

    /** The note under the section: the AI caveat, the free allowance and Hector's own. */
    val ABOUT_NOTE = "Written by AI (Alphonso), so they can be wrong. You can report one. Free: ${ExplainRules.DAILY_LIMIT} a day. Pro learners talking to Hector use Hector's own allowance."

    fun chip(language: String) = "Explain in $language"
    fun sayThat(language: String) = "Say that in $language"
    fun inLanguage(language: String) = "IN ${language.uppercase(Locale.ENGLISH)}"
    fun aiLabel(language: String?) = if (language.isNullOrEmpty()) "AI" else "AI - $language"
}
