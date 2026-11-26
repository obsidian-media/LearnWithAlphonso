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

    /** Spanish words whose tilde-less spelling is itself a different real word; keep in step with translation-answer.ts. */
    private val ENYE_TWINS = setOf("año", "años", "peña", "peñas", "caña", "cañas", "sueño", "sueños", "uña", "uñas", "cuña", "cuñas", "moño", "moños", "ceño", "maña", "cañón")
    private val ENYE_WORD = Regex("\\p{L}*[ñÑ]\\p{L}*")

    /**
     * The spoken normaliser folds every accent, so a missing tilde is a forgivable slip ("espanol" for "español").
     * The exception: a word whose tilde-less spelling is a different real word ("ano" for "año", "una" for "uña")
     * keeps its enye through the fold. Speech keeps its tolerance.
     */
    fun normalise(input: String): String {
        val protectedInput = ENYE_WORD.replace(Normalizer.normalize(input, Normalizer.Form.NFC)) { m ->
            if (m.value.lowercase() in ENYE_TWINS) m.value.replace("ñ", ENYE).replace("Ñ", ENYE) else m.value
        }
        return SpokenAnswer.normalise(protectedInput).replace(ENYE, "ñ")
    }

    /** Fails closed on an empty submission and on an empty acceptable list. */
    fun matches(submission: String, acceptable: List<String>): Boolean {
        val written = normalise(submission)
        if (written.isEmpty()) return false
        return acceptable.any { normalise(it) == written }
    }
}
