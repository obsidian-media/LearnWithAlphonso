package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef

/**
 * Port of VocabDerivation.swift / src/data/vocab.ts: vocabulary is derived
 * from a lesson's own questions rather than shipped as separate content.
 */
data class VocabItem(val term: String, val meaning: String, val example: String, val image: VocabImageRef?)

/** Only mc and fill questions name a single term; every other type is a whole sentence. */
private fun answerOf(question: Question): String = when (question) {
    is Question.MultipleChoice ->
        if (question.answer in question.choices.indices) question.choices[question.answer] else ""
    is Question.FillInBlank -> question.answer
    is Question.Reorder, is Question.Listening, is Question.Speak, is Question.Translate -> ""
}

/** Mirrors the web's prompt.replace(/[:：]\s*$/, ""). */
private fun stripTrailingColon(prompt: String): String {
    val trimmed = prompt.trimEnd()
    return if (trimmed.endsWith(":") || trimmed.endsWith("：")) trimmed.dropLast(1) else trimmed
}

private fun exampleOf(question: Question): String {
    val answer = answerOf(question)
    return when (question) {
        is Question.FillInBlank -> {
            val filled = question.prompt.replace("___", answer)
            if (filled == question.prompt) "${question.prompt} $answer" else filled
        }
        is Question.MultipleChoice -> "${stripTrailingColon(question.prompt)} → $answer"
        else -> ""
    }
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
        items.add(VocabItem(term, question.explanation, exampleOf(question), images[key]))
    }
    return items
}
