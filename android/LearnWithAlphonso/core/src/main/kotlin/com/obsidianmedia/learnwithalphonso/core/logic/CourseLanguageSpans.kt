package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Question
import java.text.Normalizer

/**
 * Which parts of a lesson explanation are in the course's language, for the French and Spanish courses, where an
 * explanation is English with course text quoted inside it. Only text the QUESTION itself proves is course-language is
 * offered for saving; nothing is guessed from a dictionary. Twin of src/lib/course-language-spans.ts and
 * CourseLanguageSpans.swift: keep the rules and tests the same (both are checked against save-word-spans.fixtures.json).
 *
 * Proven course-language text, by question type:
 * - translate: the acceptable answers; listening: the audio text; speak: the answer. (Reorder is left out: neither course
 *   has one, so it is unverified.)
 * - multiple choice and fill: the correct answer, but ONLY when the prompt states that the answer is in the course
 *   language ("... in French?", "The French word for ..."). "The idiom X means..." has an English answer, so it offers
 *   nothing.
 *
 * A candidate counts only where the explanation quotes it ("...") or puts it right after an arrow ("hello → Salut."), so
 * the same letters inside an English word, or in unquoted English prose, never match.
 */
object CourseLanguageSpans {
    /** A piece of an explanation: plain, or course-language text that is safe to offer for saving. */
    data class Piece(val text: String, val isCourseLanguage: Boolean)

    private const val LANGUAGE = "(?:French|Spanish)"

    // The prompt says the ANSWER is in the course language.
    private val ANSWER_IN_COURSE_LANGUAGE = listOf(
        Regex("^how do you say .* in $LANGUAGE[?]", RegexOption.IGNORE_CASE),
        Regex("^the $LANGUAGE(?: word)? for ", RegexOption.IGNORE_CASE),
        Regex("^the opposite of .* in $LANGUAGE is", RegexOption.IGNORE_CASE),
    )

    private fun namesTheAnswerLanguage(prompt: String): Boolean {
        val trimmed = prompt.trim()
        return ANSWER_IN_COURSE_LANGUAGE.any { it.containsMatchIn(trimmed) }
    }

    private fun candidates(q: Question): List<String> = when (q) {
        is Question.Translate -> q.acceptableAnswers
        is Question.Listening -> listOf(q.audioText)
        is Question.Speak -> listOf(q.answer)
        is Question.Reorder -> emptyList()
        is Question.MultipleChoice ->
            if (namesTheAnswerLanguage(q.prompt)) listOfNotNull(q.choices.getOrNull(q.answer)) else emptyList()
        is Question.FillInBlank -> if (namesTheAnswerLanguage(q.prompt)) listOf(q.answer) else emptyList()
    }

    private fun nfc(s: String) = Normalizer.normalize(s, Normalizer.Form.NFC)

    /** Where the explanation quotes `text` or puts it right after an arrow, as UTF-16 ranges (end exclusive). */
    private fun hits(explanation: String, text: String): List<IntRange> {
        val found = ArrayList<IntRange>()
        val quoted = "\"$text\""
        var at = explanation.indexOf(quoted)
        while (at >= 0) {
            found.add((at + 1) until (at + 1 + text.length))
            at = explanation.indexOf(quoted, at + 1)
        }
        val arrow = "→ $text"
        at = explanation.indexOf(arrow)
        while (at >= 0) {
            val end = at + arrow.length
            if (!(explanation.getOrNull(end)?.isLetter() ?: false)) found.add((at + 2) until end)
            at = explanation.indexOf(arrow, at + 1)
        }
        return found
    }

    /** The course-language strings the explanation contains, each safe to offer for saving. */
    fun spans(question: Question, explanation: String): List<String> {
        val body = nfc(explanation)
        val out = ArrayList<String>()
        for (raw in candidates(question)) {
            val text = nfc(raw.trim())
            if (text.isNotEmpty() && text !in out && hits(body, text).isNotEmpty()) out.add(text)
        }
        return out
    }

    /** The explanation cut into plain and course-language pieces, in order. */
    fun split(explanation: String, spans: List<String>): List<Piece> {
        val text = nfc(explanation)
        val ranges = spans.flatMap { hits(text, it) }.sortedBy { it.first }
        val pieces = ArrayList<Piece>()
        var cursor = 0
        for (r in ranges) {
            if (r.first < cursor) continue
            if (r.first > cursor) pieces.add(Piece(text.substring(cursor, r.first), false))
            pieces.add(Piece(text.substring(r.first, r.last + 1), true))
            cursor = r.last + 1
        }
        if (cursor < text.length) pieces.add(Piece(text.substring(cursor), false))
        return pieces
    }
}
