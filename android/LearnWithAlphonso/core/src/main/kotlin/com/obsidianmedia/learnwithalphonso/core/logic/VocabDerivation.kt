package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef

/**
 * Port of VocabDerivation.swift / src/data/vocab.ts: vocabulary is derived
 * from a lesson's own questions rather than shipped as separate content.
 * `meaning` is always "": a quiz explanation is not a gloss of the word.
 */
data class VocabItem(val term: String, val meaning: String, val example: String, val image: VocabImageRef?)

/** Only mc and fill questions name a single term; every other type is a whole sentence. */
private fun answerOf(question: Question): String = when (question) {
    is Question.MultipleChoice ->
        if (question.answer in question.choices.indices) question.choices[question.answer] else ""
    is Question.FillInBlank -> question.answer
    is Question.Reorder, is Question.Listening, is Question.Speak, is Question.Translate -> ""
}

/** Quiz instructions and pair-drill stems. Mirrors the web's STEM in src/data/vocab.ts. */
private val STEM = Regex(
    "^(choose|which|select|complete|fill|plural of|opposite of|past (simple )?of|female form|male form|comparative|superlative|what is|what does|match)\\b",
    RegexOption.IGNORE_CASE,
)

/**
 * A model sentence for the card, or "" when there is none. Mirrors the web's exampleOf:
 * only a cloze sentence with the answer put back in the blank counts; a quiz stem is
 * not an example.
 */
private fun exampleOf(question: Question): String {
    val prompt = when (question) {
        is Question.FillInBlank -> question.prompt
        is Question.MultipleChoice -> question.prompt
        else -> return ""
    }
    val answer = answerOf(question)
    val blank = prompt.indexOf("___")
    if (blank < 0 || answer.isEmpty() || STEM.containsMatchIn(prompt.trim())) return ""
    val last = prompt.substring(0, blank).trim().lastOrNull()
    if (last != null && last in ":?…\"“") return ""
    // Tidy the join, same steps as the web: drop every bracket hint after the blank,
    // drop the space the data leaves between the blank and its punctuation ("taken ?"),
    // and capitalise the first letter.
    val after = prompt.substring(blank + 3)
        .replace(Regex("\\s*\\([^)]*\\)"), "")
        .replace(Regex("^\\s+(?=[?!.,;:])"), "")
    val sentence = prompt.substring(0, blank) + answer + after
    return sentence.replaceFirstChar { it.uppercaseChar() }
}

/** Dedupes by term, case-insensitively, in question order. `images` is keyed by the lowercased term. */
fun deriveVocab(lesson: Lesson, images: Map<String, VocabImageRef>): List<VocabItem> {
    val seen = HashSet<String>()
    val items = ArrayList<VocabItem>()
    for (question in lesson.questions) {
        val term = answerOf(question).trim()
        if (term.isEmpty()) continue
        val key = term.lowercase()
        if (!seen.add(key)) continue
        items.add(VocabItem(term, "", exampleOf(question), images[key]))
    }
    return items
}
