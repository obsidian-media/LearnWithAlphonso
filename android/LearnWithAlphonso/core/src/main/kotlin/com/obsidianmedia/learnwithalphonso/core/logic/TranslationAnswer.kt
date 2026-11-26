package com.obsidianmedia.learnwithalphonso.core.logic

import java.text.Normalizer

/**
 * Port of src/lib/translation-answer.ts: the local, free half of translate
 * grading. A `true` here is final; a `false` is where the server's AI grader
 * gets asked. Delegates to the spoken normaliser so a phrasing accepted when
 * said is never rejected when typed.
 */
object TranslationAnswer {
    /** A letters-only stand-in for "ñ" that survives the spoken normaliser's accent fold and punctuation strip. */
    private const val ENYE = "xqenyeqx"

    /**
     * The spoken normaliser folds every accent, right for a transcript but wrong for typed Spanish: "ano" and "año" are
     * different words. The enye is protected through the fold and restored; speech keeps its tolerance.
     */
    fun normalise(input: String): String {
        val protectedInput = Normalizer.normalize(input, Normalizer.Form.NFC).replace("ñ", ENYE).replace("Ñ", ENYE)
        return SpokenAnswer.normalise(protectedInput).replace(ENYE, "ñ")
    }

    /** Fails closed on an empty submission and on an empty acceptable list. */
    fun matches(submission: String, acceptable: List<String>): Boolean {
        val written = normalise(submission)
        if (written.isEmpty()) return false
        return acceptable.any { normalise(it) == written }
    }
}
