package com.obsidianmedia.learnwithalphonso.core.logic

import java.text.Normalizer

/** A run of text that is either one word or the text between words. `start` is a UTF-16 offset into the NFC-normalised text. */
data class TextSegment(val text: String, val isWord: Boolean, val start: Int)

/**
 * Splits displayed text into words and the text between them, for tap-to-save. A port of src/lib/word-segmenter.ts (the
 * web twin; iOS has WordSegmenter.swift). The token rule is the SAME one the server's validator uses (letters, with an
 * apostrophe, straight or typographic, or a hyphen only BETWEEN letters), so a word found here is a word the server
 * accepts. Offsets are UTF-16 code units into the NFC-normalised text, which is what the server measures its limits in
 * and what it stores, and what Kotlin strings count in.
 */
object WordSegmenter {
    private val TOKEN = Regex("""\p{L}(?:\p{L}|['’-](?=\p{L}))*""")
    private val TERMINATORS = setOf('.', '!', '?', '\n', '…')

    // Words after which a full stop does not end the sentence. Lower-case, no dot.
    private val ABBREVIATIONS = setOf("mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "eg", "ie", "no", "approx")

    private fun nfc(raw: String) = Normalizer.normalize(raw, Normalizer.Form.NFC)

    /** Concatenating every segment's text rebuilds the NFC form of `raw` exactly. */
    fun segments(raw: String): List<TextSegment> {
        // NFC first: \p{L} does not match a combining accent, so a decomposed "e" + U+0301 would end the word early.
        val text = nfc(raw)
        val out = ArrayList<TextSegment>()
        var cursor = 0
        for (match in TOKEN.findAll(text)) {
            val start = match.range.first
            if (start > cursor) out.add(TextSegment(text.substring(cursor, start), isWord = false, start = cursor))
            out.add(TextSegment(match.value, isWord = true, start = start))
            cursor = match.range.last + 1
        }
        if (cursor < text.length) out.add(TextSegment(text.substring(cursor), isWord = false, start = cursor))
        return out
    }

    /** The server accepts 1 to 40 UTF-16 units; anything longer is not worth a link. */
    fun isSavable(word: String): Boolean = nfc(word).length in 1..SavedWordRules.WORD_MAX

    /** The letters immediately before index `dot`. */
    private fun wordBefore(text: String, dot: Int): String {
        var i = dot
        while (i > 0 && Character.isLetter(text[i - 1])) i -= 1
        return text.substring(i, dot)
    }

    private fun endsSentence(text: String, i: Int): Boolean {
        val ch = text[i]
        if (ch != '.') return ch in TERMINATORS
        // A full stop only ends a sentence when whitespace (or the end) follows it: "3.14", "e.g" and "U.S.A" are not boundaries.
        val next = text.getOrNull(i + 1)
        if (next != null && !next.isWhitespace()) return false
        val before = wordBefore(text, i)
        if (before.lowercase() in ABBREVIATIONS) return false
        // The tail of a dotted abbreviation: "e.g.", "i.e.", "U.S.".
        if (before.length == 1 && text.getOrNull(i - 2) == '.') return false
        // A single capital initial ("J. Smith"), but not "I" or "A", which end sentences.
        if (before.length == 1 && before != "I" && before != "A" && before == before.uppercase()) return false
        return true
    }

    private data class Sentence(val text: String, val start: Int)

    private fun splitSentences(text: String): List<Sentence> {
        val sentences = ArrayList<Sentence>()
        var start = 0
        for (i in text.indices) {
            if (endsSentence(text, i)) {
                sentences.add(Sentence(text.substring(start, i + 1), start))
                start = i + 1
            }
        }
        if (start < text.length) sentences.add(Sentence(text.substring(start), start))
        return sentences
    }

    /**
     * Trims the sentence to at most 300 UTF-16 units, keeping the tapped word (at `wordStart`, `wordLength` units long,
     * both relative to `sentence`) and as much of its surroundings as fits. Works in code points so a surrogate pair is
     * never cut in half, and anchors on the tapped occurrence rather than the first one.
     */
    private fun fit(sentence: String, wordStart: Int, wordLength: Int): String {
        val trimmed = sentence.trim()
        if (trimmed.length <= SavedWordRules.SENTENCE_MAX) return trimmed

        val chars = sentence.codePoints().toArray()
        val unitStart = IntArray(chars.size + 1)
        var units = 0
        for ((i, cp) in chars.withIndex()) {
            unitStart[i] = units
            units += Character.charCount(cp)
        }
        unitStart[chars.size] = units

        var lo = unitStart.indexOf(wordStart)
        var hi = unitStart.indexOf(wordStart + wordLength)
        if (lo < 0 || hi < 0) return trimmed.take(SavedWordRules.SENTENCE_MAX)
        var used = unitStart[hi] - unitStart[lo]

        var grew = true
        while (grew) {
            grew = false
            if (lo > 0 && used + Character.charCount(chars[lo - 1]) <= SavedWordRules.SENTENCE_MAX) {
                lo -= 1
                used += Character.charCount(chars[lo])
                grew = true
            }
            if (hi < chars.size && used + Character.charCount(chars[hi]) <= SavedWordRules.SENTENCE_MAX) {
                used += Character.charCount(chars[hi])
                hi += 1
                grew = true
            }
        }
        val sb = StringBuilder()
        for (i in lo until hi) sb.appendCodePoint(chars[i])
        return sb.toString().trim()
    }

    /**
     * The request for saving `segment` out of `text`: the word, the sentence it was TAPPED in (chosen by position, so the
     * same word in two sentences is two different saves), and the course. `text` is the string `segments` was given.
     */
    fun requestFor(text: String, segment: TextSegment, course: String): SaveWordRequest {
        val normalised = nfc(text)
        val sentences = splitSentences(normalised)
        val containing = sentences.firstOrNull { segment.start >= it.start && segment.start < it.start + it.text.length } ?: Sentence(normalised, 0)
        val sentence = fit(containing.text, segment.start - containing.start, segment.text.length)
        return SaveWordRequest(segment.text, sentence, course)
    }
}
