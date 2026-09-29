package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class QuestionGradingTest {
    private val mc = Question.MultipleChoice("q1", "Pick", listOf("a", "b", "c"), 1, "e")
    private val fill = Question.FillInBlank("q2", "I ___ tea", listOf("drink"), "drink", "e")
    private val reorder = Question.Reorder("q3", "Order", listOf("I", "am", "here"), "I am here", "e")
    private val listening = Question.Listening("q4", "Listen", "Good morning", listOf("Good morning", "Good night"), "Good morning", "e")
    private val translate = Question.Translate("q5", "Translate", listOf("I don't understand.", "I do not understand."), "e")
    private val speakFr = Question.Speak("q6", "Say it", "J'ai faim.", "e")
    private val speakEn = Question.Speak("q7", "Say it", "She's a doctor.", "e")

    @Test
    fun `a null pick is never correct`() {
        assertFalse(isAnswerCorrect(mc, null))
        assertFalse(isAnswerCorrect(fill, null))
    }

    @Test
    fun `multiple choice needs the exact choice text`() {
        assertTrue(isAnswerCorrect(mc, "b"))
        assertFalse(isAnswerCorrect(mc, "B"))
        assertFalse(isAnswerCorrect(mc, "a"))
    }

    @Test
    fun `fill reorder and listening compare case-insensitively and trimmed`() {
        assertTrue(isAnswerCorrect(fill, " Drink "))
        assertTrue(isAnswerCorrect(reorder, "i am HERE"))
        assertFalse(isAnswerCorrect(reorder, "am I here"))
        assertTrue(isAnswerCorrect(listening, "good morning"))
    }

    @Test
    fun `translate uses the written normaliser`() {
        assertTrue(isAnswerCorrect(translate, "i dont understand"))
        assertFalse(isAnswerCorrect(translate, "i understand"))
    }

    @Test
    fun `speak selects the normaliser by course`() {
        assertTrue(isAnswerCorrect(speakFr, "j ai faim", Course.FRENCH))
        assertFalse(isAnswerCorrect(speakFr, "j ai faim", Course.ENGLISH))
        assertTrue(isAnswerCorrect(speakEn, "um she is a doctor"))
        assertFalse(isAnswerCorrect(speakEn, ""))
    }

    @Test
    fun `weakness review rows become multiple choice questions and malformed rows are skipped`() {
        val row = ReviewItem(
            itemKey = "w1", lessonId = "u1l1", level = "A1", ease = 2.5, intervalDays = 1, repetitions = 0,
            dueOn = "2026-09-14", source = "weakness", prompt = "p", choices = listOf("x", "y"),
            answerIndex = 1, explanation = "because",
        )
        val q = questionFromWeaknessItem(row) as Question.MultipleChoice
        assertEquals("w1", q.id)
        assertEquals(1, q.answer)
        assertNull(questionFromWeaknessItem(row.copy(choices = null)))
        assertNull(questionFromWeaknessItem(row.copy(source = "lesson")))
    }
}
