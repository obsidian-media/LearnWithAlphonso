package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The lesson flow's rules, with the same vectors as the web's lesson-xp/lesson-time/lesson-stage/confetti tests. */
class LessonFlowTest {
    private fun resource(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/$name")) { "missing test resource $name" }.bufferedReader().readText()

    @Test
    fun `a first try shows 10 on every right answer`() {
        for (right in 1..8) assertEquals(10, LessonXp.answerChip(right, LessonPreviousBest.FirstTry))
    }

    @Test
    fun `a replay shows nothing until the learner passes their best`() {
        assertNull(LessonXp.answerChip(5, LessonPreviousBest.Best(6)))
        assertNull(LessonXp.answerChip(6, LessonPreviousBest.Best(6)))
        assertEquals(10, LessonXp.answerChip(7, LessonPreviousBest.Best(6)))
        assertNull(LessonXp.answerChip(8, LessonPreviousBest.Best(8)))
    }

    @Test
    fun `unknown history never promises XP`() {
        assertNull(LessonXp.answerChip(1, LessonPreviousBest.Unknown))
    }

    @Test
    fun `over every pattern and earlier best the chips add up to the award's per-answer part`() {
        val total = 6
        for (best in -1..total) {
            val existing = if (best < 0) null else best to computeXpGain(best, total)
            val previous = if (best < 0) LessonPreviousBest.FirstTry else LessonPreviousBest.Best(best)
            for (mask in 0 until (1 shl total)) {
                var right = 0
                var shown = 0
                for (i in 0 until total) {
                    if (mask and (1 shl i) == 0) continue
                    right++
                    shown += LessonXp.answerChip(right, previous) ?: 0
                }
                val awarded = computeLessonReplayXp(existing, right, total).xpGain
                val perfectPaid = if (right == total && (existing?.first ?: -1) < total) LessonXp.PERFECT_BONUS else 0
                assertEquals(awarded - perfectPaid, shown, "best $best, mask $mask")
            }
        }
    }

    @Test
    fun `a queued completion never promises more than the replay pays`() {
        val total = 8
        for (best in 0..total) for (correct in 0..total) {
            val paid = computeLessonReplayXp(best to computeXpGain(best, total), correct, total).xpGain
            assertEquals(paid, LessonXp.queuedEstimate(correct, total, LessonPreviousBest.Best(best)), "best $best, correct $correct")
        }
        // A perfect best: a queued replay pays nothing, so it promises nothing.
        assertEquals(0, LessonXp.queuedEstimate(8, 8, LessonPreviousBest.Best(8)))
        assertEquals(70, LessonXp.queuedEstimate(7, 8, LessonPreviousBest.FirstTry))
        assertEquals(70, LessonXp.queuedEstimate(7, 8, LessonPreviousBest.Unknown))
    }

    @Test
    fun `the XP lines add up to the server's award and name each part`() {
        val cases = listOf(
            Triple(null, 7, 8), Triple(null, 8, 8), Triple(null, 0, 8), Triple(5 to 50, 8, 8),
            Triple(8 to 100, 6, 8), Triple(6 to 60, 6, 8), Triple(7 to 0, 2, 8),
        )
        for ((existing, correct, total) in cases) {
            val awarded = computeLessonReplayXp(existing, correct, total).xpGain
            val lines = LessonXp.breakdown(correct, total, awarded)
            assertEquals(awarded, lines.sumOf { it.xp })
            assertEquals(LessonXp.Line(LessonXp.Kind.ANSWERS, "$correct right answer${if (correct == 1) "" else "s"}", correct * 10), lines[0])
            if (existing == null) {
                val kinds = if (correct == total) listOf(LessonXp.Kind.ANSWERS, LessonXp.Kind.PERFECT) else listOf(LessonXp.Kind.ANSWERS)
                assertEquals(kinds, lines.map { it.kind })
            }
        }
        assertEquals(
            listOf(LessonXp.Line(LessonXp.Kind.ANSWERS, "6 right answers", 60), LessonXp.Line(LessonXp.Kind.EARLIER, "Already earned on an earlier try", -60)),
            LessonXp.breakdown(6, 8, 0),
        )
        assertEquals(LessonXp.Line(LessonXp.Kind.REGRADED, "Topped up to your best score", 50), LessonXp.breakdown(2, 8, 70).last())
        assertEquals("Already earned on an earlier try −60", LessonXp.breakdown(6, 8, 0)[1].text)
        assertEquals(100, LessonXp.maxXp(8))
    }

    @Test
    fun `the complete headline follows the score, as on iOS`() {
        assertEquals("Nice work!", LessonFinishCopy.headline(7, 8))
        assertEquals("Good progress!", LessonFinishCopy.headline(4, 8))
        assertEquals("Good try. Keep going!", LessonFinishCopy.headline(0, 8))
        assertEquals("Nice work!", LessonFinishCopy.headline(0, 0))
    }

    @Test
    fun `finish runs only once`() {
        val gate = FinishGate()
        assertTrue(gate.begin())
        assertFalse(gate.begin())
        gate.reset()
        assertTrue(gate.begin())
    }

    @Test
    fun `the bundled timing matches the web rules and the first lesson is about 4 minutes`() {
        val timing = LessonTiming.fromJson(resource("content/lesson-timing.json"))
        assertEquals(mapOf("mc" to 20, "listening" to 25, "fill" to 25, "reorder" to 30, "speak" to 30, "translate" to 45), timing.secondsPerQuestion)
        assertEquals(8, timing.secondsPerNewWord)
        assertEquals(3, timing.estimateMinutes(listOf("mc", "mc", "fill", "translate"), 3))
        assertEquals(1, timing.estimateMinutes(emptyList(), 0))
        val store = ContentStore(::resource)
        val lesson = checkNotNull(store.findLesson("u1l1", Course.ENGLISH)).second
        val words = deriveVocab(lesson, store.vocabImages).size
        assertEquals(4, timing.estimateMinutes(lesson.questions.map { it.typeKey }, words))
    }

    @Test
    fun `the timer leaves out paused time`() {
        val t = ActiveTimer(100)
        assertEquals(30, t.elapsedMs(130))
        t.pause(130)
        assertEquals(30, t.elapsedMs(500))
        t.pause(600)
        t.resume(1000)
        t.resume(1005)
        assertEquals(40, t.elapsedMs(1010))
    }

    @Test
    fun `format elapsed`() {
        assertEquals("0:00", formatElapsed(0))
        assertEquals("0:10", formatElapsed(9_600))
        assertEquals("3:05", formatElapsed(185_000))
        assertEquals("62:05", formatElapsed(3_725_000))
        assertEquals("0:00", formatElapsed(-4_000))
    }

    @Test
    fun `stage expressions, room sizes, ears below the HUD and the unit's room`() {
        assertEquals(LessonExpression.TALK, LessonStage.expression(false, null))
        assertEquals(LessonExpression.NEUTRAL, LessonStage.expression(true, null))
        assertEquals(LessonExpression.HAPPY, LessonStage.expression(true, true))
        assertEquals(LessonExpression.HMM, LessonStage.expression(true, false))
        assertEquals(LessonStage.RoomLayout(LessonStage.Size.FULL, 380, 315), LessonStage.layout(852, "Short?"))
        assertEquals(LessonStage.RoomLayout(LessonStage.Size.LONG, 300, 255), LessonStage.layout(852, "x".repeat(61)))
        assertEquals(LessonStage.RoomLayout(LessonStage.Size.SMALL, 248, 205), LessonStage.layout(667, "x".repeat(61)))
        assertEquals(LessonStage.Size.FULL, LessonStage.layout(852, "x".repeat(60)).size)
        for (l in listOf(LessonStage.layout(852, ""), LessonStage.layout(852, "x".repeat(61)), LessonStage.layout(600, ""))) {
            val top = l.roomHeight + LessonStage.ALPHONSO_SINK - l.alphonsoWidth
            assertTrue(top + l.alphonsoWidth * LessonStage.EAR_TOP >= LessonStage.HUD_BOTTOM, "$l")
        }
        val units = UnitRooms.fromJson(resource("content/unit-rooms.json"))
        val (unit, room) = units.entries.first()
        assertEquals(room, LessonStage.roomId(unit, units))
        assertEquals("room-light", LessonStage.roomId("no-such-unit", units))
        assertEquals("room-light", LessonStage.roomId(null, units))
    }

    @Test
    fun `answer states`() {
        assertEquals(LessonAnswerState.IDLE, LessonAnswerState.of(false, false, true))
        assertEquals(LessonAnswerState.SELECTED, LessonAnswerState.of(false, true, false))
        assertEquals(LessonAnswerState.CORRECT, LessonAnswerState.of(true, true, true))
        assertEquals(LessonAnswerState.CORRECT, LessonAnswerState.of(true, false, true))
        assertEquals(LessonAnswerState.INCORRECT, LessonAnswerState.of(true, true, false))
        assertEquals(LessonAnswerState.DIMMED, LessonAnswerState.of(true, false, false))
    }

    @Test
    fun `confetti is deterministic, in the robe's colours, and falls under gravity`() {
        val a = Confetti.pieces(7, 393.0)
        assertEquals(90, a.size)
        assertEquals(a, Confetti.pieces(7, 393.0))
        assertNotEquals(a, Confetti.pieces(8, 393.0))
        assertEquals(10, a.count { it.star })
        assertEquals(Confetti.Colour.entries.toSet(), a.map { it.colour }.toSet())
        assertEquals((117_649.0 / 2_147_483_647 - 0.5) * 340, a[0].vx, 1e-9)
        assertTrue(a.all { it.restX in 0.0..393.0 && it.restY in 20.0..320.0 })
        val p = a[3]
        assertEquals(70.0, Confetti.position(p, 0.0).y)
        assertEquals(70 + p.vy * 2 + 420 * 4, Confetti.position(p, 2.0).y, 1e-9)
    }
}
