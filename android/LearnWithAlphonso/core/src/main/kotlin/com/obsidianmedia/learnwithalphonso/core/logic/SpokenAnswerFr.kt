package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Port of src/lib/spoken-answer-fr.ts. Rules, order and their reasoning are
 * the TS file's; SpokenAnswerFrTest carries the same vectors.
 */
object SpokenAnswerFr {
    private val elidable = listOf("j", "m", "t", "s", "l", "d", "n", "c", "qu", "jusqu", "lorsqu", "puisqu", "quoiqu")
    private const val VOWEL_OR_MUTE_H = "aeiouyàâäéèêëïîôöùûüh"

    private val elisionSpaceJoins: List<Pair<Regex, String>> =
        elidable.map { clitic -> Regex("\\b$clitic (?=[$VOWEL_OR_MUTE_H])") to clitic }

    /** `si` elides only before il/ils. */
    private val siElision: List<Pair<Regex, String>> = listOf(Regex("\\bsi (ils?)\\b") to "s $1")

    private val filler = Regex("\\b(?:euh|hum)\\b")

    private val numberWords = SpokenNormalisation.words(
        "zéro" to "0", "deux" to "2", "trois" to "3", "quatre" to "4", "cinq" to "5", "six" to "6",
        "sept" to "7", "huit" to "8", "neuf" to "9", "dix" to "10", "onze" to "11", "douze" to "12",
        "treize" to "13", "quatorze" to "14", "quinze" to "15", "seize" to "16", "vingt" to "20",
        "trente" to "30", "quarante" to "40", "cinquante" to "50", "soixante" to "60",
        "cent" to "100", "mille" to "1000",
    )

    fun normalise(input: String): String {
        var s = SpokenNormalisation.fold(input)
        s = SpokenNormalisation.apply(s, siElision)
        s = SpokenNormalisation.apply(s, elisionSpaceJoins)
        s = SpokenNormalisation.stripApostrophes(s)
        s = filler.replace(s, " ")
        s = SpokenNormalisation.apply(s, numberWords)
        return SpokenNormalisation.finish(s)
    }

    fun matches(transcript: String, expected: String): Boolean {
        val said = normalise(transcript)
        if (said.isEmpty()) return false
        return said == normalise(expected)
    }
}
