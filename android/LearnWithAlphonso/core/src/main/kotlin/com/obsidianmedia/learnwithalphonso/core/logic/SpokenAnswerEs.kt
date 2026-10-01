package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Port of src/lib/spoken-answer-es.ts. Rules, order and their reasoning are
 * the TS file's; SpokenAnswerEsTest carries the same vectors.
 */
object SpokenAnswerEs {
    /** Spanish h is silent everywhere except inside the "ch" digraph. */
    private val silentH = Regex("(?<!c)h")

    private val filler = Regex("\\b(?:eh)\\b")

    // Unaccented on purpose: the fold runs before this list (see the TS comment).
    private val numberWords = SpokenNormalisation.words(
        "cero" to "0", "dos" to "2", "tres" to "3", "cuatro" to "4", "cinco" to "5", "seis" to "6",
        "siete" to "7", "ocho" to "8", "nueve" to "9", "diez" to "10", "once" to "11", "doce" to "12",
        "trece" to "13", "catorce" to "14", "quince" to "15", "dieciseis" to "16",
        "diecisiete" to "17", "dieciocho" to "18", "diecinueve" to "19", "veinte" to "20",
        "veintiuno" to "21", "veintidos" to "22", "veintitres" to "23", "veinticuatro" to "24",
        "veinticinco" to "25", "veintiseis" to "26", "veintisiete" to "27", "veintiocho" to "28",
        "veintinueve" to "29", "treinta" to "30", "cuarenta" to "40", "cincuenta" to "50",
        "sesenta" to "60", "setenta" to "70", "ochenta" to "80", "noventa" to "90",
        "cien" to "100", "mil" to "1000",
    )

    fun normalise(input: String): String {
        var s = SpokenNormalisation.fold(input)
        // Filler before the silent-h strip: "eh" is itself an h-word.
        s = filler.replace(s, " ")
        s = silentH.replace(s, "")
        s = SpokenNormalisation.apply(s, numberWords)
        return SpokenNormalisation.finish(s)
    }

    fun matches(transcript: String, expected: String): Boolean {
        val said = normalise(transcript)
        if (said.isEmpty()) return false
        return said == normalise(expected)
    }
}
