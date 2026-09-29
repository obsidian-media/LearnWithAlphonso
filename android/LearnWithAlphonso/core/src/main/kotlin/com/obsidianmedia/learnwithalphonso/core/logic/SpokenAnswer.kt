package com.obsidianmedia.learnwithalphonso.core.logic

import java.text.Normalizer

/** Shared pieces of the three spoken-answer normalisers. */
internal object SpokenNormalisation {
    private val combiningMarks = Regex("[\\u0300-\\u036F]")
    private val apostrophes = Regex("['’]")
    private val nonAlnum = Regex("[^a-z0-9\\s]")
    private val whitespace = Regex("\\s+")

    /** NFD fold so accented letters keep their base letter, then lowercase. */
    fun fold(input: String): String =
        combiningMarks.replace(Normalizer.normalize(input, Normalizer.Form.NFD), "").lowercase()

    fun stripApostrophes(s: String): String = apostrophes.replace(s, "")

    fun finish(s: String): String = whitespace.replace(nonAlnum.replace(s, " "), " ").trim()

    fun words(vararg pairs: Pair<String, String>): List<Pair<Regex, String>> =
        pairs.map { (word, replacement) -> Regex("\\b$word\\b") to replacement }

    fun apply(s: String, rules: List<Pair<Regex, String>>): String =
        rules.fold(s) { acc, (pattern, replacement) -> pattern.replace(acc, replacement) }
}

/**
 * Port of src/lib/spoken-answer.ts (English). The rules and their order are
 * the TS file's; the comments explaining each trap live there.
 * SpokenAnswerTest carries the same vectors as spoken-answer.test.ts.
 */
object SpokenAnswer {
    private val contractions: List<Pair<Regex, String>> = listOf(
        Regex("\\bcan't\\b") to "can not",
        Regex("\\bcannot\\b") to "can not",
        Regex("\\bwon't\\b") to "will not",
        Regex("\\blet's\\b") to "let us",
        // Unanchored on the left on purpose: "o" before "n't" is a word char.
        Regex("n't\\b") to " not",
        Regex("\\b'll\\b") to " will",
        Regex("\\b're\\b") to " are",
        Regex("\\b've\\b") to " have",
        Regex("\\b'd\\b") to " would",
        Regex("\\b's\\b") to " is",
        Regex("\\b'm\\b") to " am",
    )

    private val apostropheLess = SpokenNormalisation.words(
        "cant" to "can not", "wont" to "will not", "dont" to "do not", "doesnt" to "does not",
        "didnt" to "did not", "isnt" to "is not", "arent" to "are not", "wasnt" to "was not",
        "werent" to "were not", "hasnt" to "has not", "havent" to "have not", "hadnt" to "had not",
        "couldnt" to "could not", "wouldnt" to "would not", "shouldnt" to "should not",
        "shes" to "she is", "hes" to "he is", "theres" to "there is", "thats" to "that is",
        "whats" to "what is", "lets" to "let us", "im" to "i am", "ive" to "i have",
        "youre" to "you are", "theyre" to "they are", "youve" to "you have", "weve" to "we have",
    )

    private val filler = Regex("\\b(?:um|uh|erm|er|ah)\\b")

    private val numberWords = SpokenNormalisation.words(
        "zero" to "0", "one" to "1", "two" to "2", "three" to "3", "four" to "4", "five" to "5",
        "six" to "6", "seven" to "7", "eight" to "8", "nine" to "9", "ten" to "10",
        "eleven" to "11", "twelve" to "12", "thirteen" to "13", "fourteen" to "14",
        "fifteen" to "15", "sixteen" to "16", "seventeen" to "17", "eighteen" to "18",
        "nineteen" to "19", "twenty" to "20", "thirty" to "30", "forty" to "40", "fifty" to "50",
        "sixty" to "60", "seventy" to "70", "eighty" to "80", "ninety" to "90",
    )

    fun normalise(input: String): String {
        var s = SpokenNormalisation.fold(input)
        s = SpokenNormalisation.apply(s, contractions)
        s = SpokenNormalisation.stripApostrophes(s)
        s = SpokenNormalisation.apply(s, apostropheLess)
        s = filler.replace(s, " ")
        s = SpokenNormalisation.apply(s, numberWords)
        return SpokenNormalisation.finish(s)
    }

    /** An empty transcript is "nothing captured", never "wrong": callers must not spend a heart on it. */
    fun matches(transcript: String, expected: String): Boolean {
        val said = normalise(transcript)
        if (said.isEmpty()) return false
        return said == normalise(expected)
    }
}
