package com.obsidianmedia.learnwithalphonso.core.avatar

import com.obsidianmedia.learnwithalphonso.core.content.Course
import java.text.Normalizer

/**
 * A mouth shape of the talking Alphonso. [CLOSED] draws no mouth layer (the base art already shows the closed mouth);
 * every other case is one `mouth-*.webp` layer.
 *
 * The avatar package is a port of the iOS Kit's Avatar*.swift (and the web's src/lib/avatar). The three must agree
 * exactly: shared/avatar-parity.json holds inputs and expected outputs that all three test suites replay.
 */
enum class Viseme(val wire: String) { CLOSED("closed"), HALF("half"), TALK("talk"), AH("ah"), OH("oh"), EE("ee"), FV("fv") }

/** Letters to mouth shapes, per course language. Deliberately rough: vowels open, m/b/p close, f/v bite. */
object AvatarVisemes {
    /** The letters of a word, lower-cased and composed, so "e" plus an accent is one letter. */
    internal fun lettersOf(word: String): MutableList<String> {
        val composed = Normalizer.normalize(word.lowercase(), Normalizer.Form.NFC)
        val out = mutableListOf<String>()
        var i = 0
        while (i < composed.length) {
            val cp = composed.codePointAt(i)
            if (Character.isLetter(cp)) out.add(String(Character.toChars(cp)))
            i += Character.charCount(cp)
        }
        return out
    }

    /**
     * The shapes for one word, in order, never the same shape twice in a row. Anything that is not a letter is
     * ignored, so punctuation and digits produce nothing.
     */
    fun sequence(word: String, course: Course): List<Viseme> {
        val letters = lettersOf(word)
        // A final "e" after a consonant is silent in English and (mostly) French: "face", "être".
        if (course != Course.SPANISH && letters.size > 3 && letters.last() == "e") {
            val before = letters[letters.size - 2]
            if (!isVowel(before)) letters.removeAt(letters.size - 1)
        }
        val out = mutableListOf<Viseme>()
        fun add(shape: Viseme) { if (out.lastOrNull() != shape) out.add(shape) }
        var i = 0
        while (i < letters.size) {
            val c = letters[i]
            val next = letters.getOrNull(i + 1)
            val afterNext = letters.getOrNull(i + 2)
            if (c == "o" && next == "u") { add(Viseme.OH); i += 2; continue }
            if (c == "o" && next == "o" && course == Course.ENGLISH) { add(Viseme.OH); i += 2; continue }
            if (c == "p" && next == "h" && course != Course.SPANISH) { add(Viseme.FV); i += 2; continue }
            // "que", "qui" (and Spanish "gue", "gui"): the u is silent.
            if (next == "u" && afterNext != null && "eéèêií".contains(afterNext) &&
                ((c == "q" && course != Course.ENGLISH) || (c == "g" && course == Course.SPANISH))
            ) { add(Viseme.HALF); i += 2; continue }
            if (c == "h" && course != Course.ENGLISH) { i += 1; continue }
            add(shapeOf(c))
            i += 1
        }
        return out
    }

    private fun isVowel(c: String): Boolean = shapeOf(c).let { it == Viseme.AH || it == Viseme.EE || it == Viseme.OH }

    private fun shapeOf(c: String): Viseme = when (c) {
        "a", "á", "à", "â", "ä", "ã" -> Viseme.AH
        "e", "é", "è", "ê", "ë", "i", "í", "ì", "î", "ï", "y" -> Viseme.EE
        "o", "ó", "ò", "ô", "ö", "u", "ú", "ù", "û", "ü" -> Viseme.OH
        "f", "v" -> Viseme.FV
        "m", "b", "p" -> Viseme.CLOSED
        "t", "d", "n", "l", "s", "z", "r" -> Viseme.TALK
        else -> Viseme.HALF
    }
}
