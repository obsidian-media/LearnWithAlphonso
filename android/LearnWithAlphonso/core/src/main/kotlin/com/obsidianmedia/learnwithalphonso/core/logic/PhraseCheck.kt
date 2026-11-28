package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.SttWord
import java.text.Normalizer
import java.util.Locale

/**
 * Phrase mode ("Say it" in the phrasebook): how clearly a whole phrase came across. A one for one port of
 * src/lib/phrase-check.ts (the header there is the spec) and Pronunciation.swift's twin; the shared cases in
 * phrase-check-cases.json pin the three apps to the same answers. It never produces a pronunciation score: only
 * clear, mostly (with up to two words to listen to again) or not yet.
 */
object PhraseCheck {
    enum class Result { CLEAR, MOSTLY, NOT_YET }

    /** [listenAgain] holds at most [MAX_LISTEN_AGAIN] words in the EXPECTED phrase's own spelling, only for MOSTLY. */
    data class Outcome(val result: Result, val listenAgain: List<String>)

    /** A heard word with a known confidence STRICTLY below this counts as not clearly understood. */
    const val WORD_CONFIDENCE = 0.7

    /** "Mostly" names at most this many words, and never more than half of the phrase. */
    const val MAX_LISTEN_AGAIN = 2

    private val NOT_YET = Outcome(Result.NOT_YET, emptyList())

    private val DROPPED_FRAGMENTS = setOf("qu", "jusqu", "lorsqu", "puisqu", "quoiqu")
    private val GLUED_PREFIXES = setOf("l", "d", "j", "m", "t", "s", "n", "c") + DROPPED_FRAGMENTS

    private val NUMBER_WORDS: Map<String, Int> = mapOf(
        "zero" to 0, "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5, "six" to 6, "seven" to 7,
        "eight" to 8, "nine" to 9, "ten" to 10, "eleven" to 11, "twelve" to 12, "thirteen" to 13, "fourteen" to 14,
        "fifteen" to 15, "sixteen" to 16, "seventeen" to 17, "eighteen" to 18, "nineteen" to 19, "twenty" to 20,
        "thirty" to 30, "forty" to 40, "fifty" to 50, "sixty" to 60, "seventy" to 70, "eighty" to 80, "ninety" to 90,
        "hundred" to 100,
        "un" to 1, "une" to 1, "deux" to 2, "trois" to 3, "quatre" to 4, "cinq" to 5, "sept" to 7, "huit" to 8,
        "neuf" to 9, "dix" to 10, "onze" to 11, "douze" to 12, "treize" to 13, "quatorze" to 14, "quinze" to 15,
        "seize" to 16, "vingt" to 20, "trente" to 30, "quarante" to 40, "cinquante" to 50, "soixante" to 60,
        "cent" to 100,
        "cero" to 0, "uno" to 1, "una" to 1, "dos" to 2, "tres" to 3, "cuatro" to 4, "cinco" to 5, "seis" to 6,
        "siete" to 7, "ocho" to 8, "nueve" to 9, "diez" to 10, "once" to 11, "doce" to 12, "trece" to 13,
        "catorce" to 14, "quince" to 15, "dieciseis" to 16, "diecisiete" to 17, "dieciocho" to 18,
        "diecinueve" to 19, "veinte" to 20, "treinta" to 30, "cuarenta" to 40, "cincuenta" to 50, "sesenta" to 60,
        "setenta" to 70, "ochenta" to 80, "noventa" to 90, "cien" to 100,
    )

    private data class Token(val token: String, val elided: Boolean)

    private data class ExpectedWord(val shown: String, val tokens: List<Token>)

    private class Heard(val token: String, val confidence: Double?)

    /** The exact whitespace of rule 2 (Kotlin's `\s` is ASCII-only, so no built-in class is used). */
    private fun isSpecWhitespace(c: Char): Boolean = when (c.code) {
        in 0x0009..0x000D, 0x0020, 0x0085, 0x00A0, 0x1680, in 0x2000..0x200A, 0x2028, 0x2029, 0x202F, 0x205F,
        0x3000, 0xFEFF -> true
        else -> false
    }

    private val CONTRACTION = Regex("(?<=[a-z0-9])'(t|s|m|d|ll|re|ve)$")
    private val OUTER_NON_LETTERS = Regex("^[^\\p{L}\\p{N}\\p{M}]+|[^\\p{L}\\p{N}\\p{M}]+$")

    private fun allDigits(s: String): Boolean = s.isNotEmpty() && s.all { it in '0'..'9' }

    /** Rule 1, with the elision marks kept. */
    private fun tokenise(text: String): List<Token> {
        val stripped = Normalizer.normalize(text, Normalizer.Form.NFD).filter { it.code !in 0x0300..0x036F }
        val normalised = buildString {
            for (c in stripped.lowercase(Locale.ROOT)) {
                when (c) {
                    '’', '‘', 'ʼ', '`', '´' -> append('\'')
                    'œ' -> append("oe")
                    'æ' -> append("ae")
                    in 'a'..'z', in '0'..'9', '\'' -> append(c)
                    else -> append(' ')
                }
            }
        }
        val out = ArrayList<Token>()
        for (raw in normalised.split(' ')) {
            if (raw.isEmpty()) continue
            val piece = CONTRACTION.replaceFirst(raw, "$1")
            val parts = piece.split('\'')
            var elided = false
            parts.forEachIndexed { i, part ->
                val before = i < parts.size - 1
                if (before && (part.length == 1 || part in DROPPED_FRAGMENTS)) {
                    elided = true
                    return@forEachIndexed
                }
                if (part.length >= 2 || allDigits(part)) out.add(Token(part, elided))
                elided = false
            }
        }
        return out
    }

    /** Rule 1: the comparing tokens of a text. */
    fun tokens(text: String): List<String> = tokenise(text).map { it.token }

    private fun isNumeral(s: String): Boolean = s.length <= 3 && allDigits(s)

    private fun numberMatches(a: String, b: String): Boolean = when {
        isNumeral(a) && !isNumeral(b) -> NUMBER_WORDS[b] == a.toInt()
        isNumeral(b) && !isNumeral(a) -> NUMBER_WORDS[a] == b.toInt()
        else -> false
    }

    private fun claims(expected: Token, heard: String): Boolean {
        if (expected.token == heard) return true
        if (expected.elided && heard.length > expected.token.length && heard.endsWith(expected.token) &&
            heard.substring(0, heard.length - expected.token.length) in GLUED_PREFIXES
        ) {
            return true
        }
        return numberMatches(expected.token, heard)
    }

    /** Rule 2: the words of the expected phrase, each with the original spelling to show and its tokens. */
    private fun expectedWords(expected: String): List<ExpectedWord> {
        val chunks = ArrayList<String>()
        val cur = StringBuilder()
        for (c in expected) {
            if (isSpecWhitespace(c)) {
                chunks.add(cur.toString())
                cur.setLength(0)
            } else {
                cur.append(c)
            }
        }
        chunks.add(cur.toString())
        return chunks.mapNotNull { chunk ->
            val tokens = tokenise(chunk)
            if (tokens.isEmpty()) null else ExpectedWord(OUTER_NON_LETTERS.replace(chunk, ""), tokens)
        }
    }

    /** How clearly [heard] conveyed [expected], given the recogniser's per-word confidences (rules 1 to 7). */
    fun check(expected: String, heard: String, words: List<SttWord>?): Outcome {
        val want = expectedWords(expected)
        val said = tokens(heard)
        if (want.isEmpty() || said.isEmpty()) return NOT_YET

        val queued = HashMap<String, ArrayDeque<Double>>()
        for (w in words.orEmpty()) {
            if (!w.confidence.isFinite()) continue
            for (token in tokens(w.word)) queued.getOrPut(token) { ArrayDeque() }.addLast(w.confidence)
        }
        val unclaimed = said.mapTo(ArrayList()) { Heard(it, queued[it]?.removeFirstOrNull()) }

        fun unclear(c: Double?) = c != null && c < WORD_CONFIDENCE
        val flagged = ArrayList<String>()
        for ((shown, tokens) in want) {
            var bad = false
            val joined = if (tokens.size >= 2) tokens.joinToString("") { it.token } else null
            val whole = if (joined == null) -1 else unclaimed.indexOfFirst { it.token == joined }
            if (whole >= 0) {
                bad = unclear(unclaimed.removeAt(whole).confidence)
            } else {
                for (token in tokens) {
                    val at = unclaimed.indexOfFirst { claims(token, it.token) }
                    if (at < 0) {
                        bad = true
                        continue
                    }
                    if (unclear(unclaimed.removeAt(at).confidence)) bad = true
                }
            }
            if (bad) flagged.add(shown)
        }

        return when {
            flagged.isEmpty() -> Outcome(Result.CLEAR, emptyList())
            flagged.size <= MAX_LISTEN_AGAIN && flagged.size * 2 <= want.size -> Outcome(Result.MOSTLY, flagged)
            else -> NOT_YET
        }
    }
}
