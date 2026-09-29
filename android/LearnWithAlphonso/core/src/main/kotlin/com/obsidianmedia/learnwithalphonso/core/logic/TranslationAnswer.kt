package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Port of src/lib/translation-answer.ts: the local, free half of translate
 * grading. A `true` here is final; a `false` is where the server's AI grader
 * gets asked. Delegates to the spoken normaliser so a phrasing accepted when
 * said is never rejected when typed.
 */
object TranslationAnswer {
    fun normalise(input: String): String = SpokenAnswer.normalise(input)

    /** Fails closed on an empty submission and on an empty acceptable list. */
    fun matches(submission: String, acceptable: List<String>): Boolean {
        val written = normalise(submission)
        if (written.isEmpty()) return false
        return acceptable.any { normalise(it) == written }
    }
}
