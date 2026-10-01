package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.roundToInt

/** Vectors copied from src/lib/srs.test.ts. Do not edit a vector to make a port pass. */
class SrsEngineTest {
    private fun grade(correct: Boolean, ease: Double, interval: Int, reps: Int, lapses: Int, elapsed: Int) =
        computeReviewGrade(ReviewGradeInput(correct, ease, interval, reps, lapses, elapsed))

    @Test
    fun `halves repetitions on a wrong answer and records a lapse`() {
        val r = grade(false, 2.3, 6, 2, 1, 6)
        assertFalse(r.retired)
        assertEquals(2.1, r.ease, 1e-9)
        assertEquals(1, r.repetitions)
        assertEquals(3, r.intervalDays)
        assertEquals(2, r.lapses)
    }

    @Test
    fun `drops to a fresh restart when repetitions halves to zero`() {
        val r = grade(false, 2.3, 1, 1, 0, 1)
        assertEquals(0, r.repetitions)
        assertEquals(1, r.intervalDays)
    }

    @Test
    fun `scales the post-lapse interval off the prior interval`() {
        val established = grade(false, 2.6, 40, 3, 0, 40)
        val fresh = grade(false, 2.6, 3, 2, 0, 3)
        assertEquals(1, established.repetitions)
        assertEquals(1, fresh.repetitions)
        assertEquals(20, established.intervalDays)
        assertEquals(2, fresh.intervalDays)
    }

    @Test
    fun `floors ease at 1_3`() {
        assertEquals(1.3, grade(false, 1.35, 0, 0, 0, 0).ease, 1e-9)
    }

    @Test
    fun `first correct repetition is 1 day`() {
        val r = grade(true, 2.3, 0, 0, 0, 0)
        assertEquals(2.45, r.ease, 1e-9)
        assertEquals(1, r.intervalDays)
        assertEquals(1, r.repetitions)
        assertFalse(r.retired)
    }

    @Test
    fun `second correct repetition is 3 days`() {
        val r = grade(true, 2.45, 1, 1, 0, 1)
        assertEquals(3, r.intervalDays)
        assertEquals(2, r.repetitions)
    }

    @Test
    fun `third repetition grows by ease on schedule`() {
        val r = grade(true, 2.6, 3, 2, 0, 3)
        assertEquals(3, r.repetitions)
        assertEquals((3 * 2.75).roundToInt(), r.intervalDays)
    }

    @Test
    fun `overdue growth bonus caps at 1_5x`() {
        val onTime = grade(true, 2.6, 3, 2, 0, 3)
        val overdue = grade(true, 2.6, 3, 2, 0, 30)
        assertEquals((3 * 2.75 * 1.5).roundToInt(), overdue.intervalDays)
        assertTrue(overdue.intervalDays > onTime.intervalDays)
    }

    @Test
    fun `retires after 4 clean repetitions`() {
        val r = grade(true, 2.75, 8, 3, 0, 8)
        assertTrue(r.retired)
        assertEquals(4, r.repetitions)
    }

    @Test
    fun `caps ease at 2_8`() {
        assertEquals(2.8, grade(true, 2.75, 10, 1, 0, 10).ease, 1e-9)
    }

    @Test
    fun `falls back to 6 days when growth rounds to zero`() {
        assertEquals(6, grade(true, 1.3, 0, 2, 0, 0).intervalDays)
    }

    private val today = "2026-09-14"
    private val addDays = { d: Int -> "2026-09-%02d".format(14 + d) }

    @Test
    fun `outcome schedules a correct answer using the grown interval`() {
        val o = computeReviewOutcome(ReviewGradeInput(true, 2.3, 0, 0, 0, 0), today, addDays)
        o as ReviewOutcome.Rescheduled
        assertEquals("2026-09-15", o.dueOn)
        assertEquals(1, o.intervalDays)
        assertEquals(1, o.repetitions)
    }

    @Test
    fun `outcome keeps a wrong answer due today`() {
        val o = computeReviewOutcome(ReviewGradeInput(false, 2.3, 6, 2, 0, 6), today, addDays)
        o as ReviewOutcome.Rescheduled
        assertEquals(today, o.dueOn)
        assertEquals(1, o.lapses)
    }

    @Test
    fun `outcome retires with dueOn today`() {
        val o = computeReviewOutcome(ReviewGradeInput(true, 2.75, 8, 3, 0, 8), today, addDays)
        assertEquals(ReviewOutcome.Retired(today), o)
    }
}
