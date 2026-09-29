package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem

/**
 * Port of QuestionGrading.swift. Client-side only, for instant feedback and
 * offline-optimistic grading; complete-lesson and grade-review re-derive
 * correctness on the server and remain the source of truth.
 *
 * For reorder, `picked` is the tapped tokens joined by single spaces.
 * For speak, `picked` is a speech-to-text transcript and the course selects
 * which tolerant normaliser applies.
 */
fun isAnswerCorrect(question: Question, picked: String?, course: Course = Course.ENGLISH): Boolean {
    if (picked == null) return false
    return when (question) {
        is Question.MultipleChoice ->
            question.answer in question.choices.indices && question.choices[question.answer] == picked
        is Question.FillInBlank -> looseEquals(picked, question.answer)
        is Question.Reorder -> looseEquals(picked, question.answer)
        is Question.Listening -> looseEquals(picked, question.answer)
        is Question.Translate -> TranslationAnswer.matches(picked, question.acceptableAnswers)
        is Question.Speak -> when (course) {
            Course.FRENCH -> SpokenAnswerFr.matches(picked, question.answer)
            Course.SPANISH -> SpokenAnswerEs.matches(picked, question.answer)
            Course.ENGLISH -> SpokenAnswer.matches(picked, question.answer)
        }
    }
}

private fun looseEquals(a: String, b: String): Boolean = a.trim().lowercase() == b.trim().lowercase()

/**
 * Builds a multiple-choice question from a weakness-sourced review row's
 * embedded content. Null when the row is not a weakness item or lacks a
 * field: a malformed row is skipped, never a crash.
 */
fun questionFromWeaknessItem(item: ReviewItem): Question? {
    if (item.source != "weakness") return null
    val prompt = item.prompt ?: return null
    val choices = item.choices ?: return null
    val answerIndex = item.answerIndex ?: return null
    val explanation = item.explanation ?: return null
    return Question.MultipleChoice(
        id = item.itemKey,
        prompt = prompt,
        choices = choices,
        answer = answerIndex,
        explanation = explanation,
    )
}
