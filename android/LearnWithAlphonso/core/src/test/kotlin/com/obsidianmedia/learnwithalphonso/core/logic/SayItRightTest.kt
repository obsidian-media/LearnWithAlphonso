package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Say it right ("Talk with Alphonso"): the derived state behind the 1:1 lesson, mirroring src/lib/say-it-right.ts. */
class SayItRightTest {
    private fun words(n: Int): List<VocabItem> = (0 until n).map { VocabItem("word$it", "", "", null) }

    @Test
    fun `nextLineIndex never repeats the last and stays in range for every roll`() {
        for (size in listOf(2, 3, 5)) for (last in 0 until size) for (roll in listOf(0.0, 0.2, 0.5, 0.99, 1.0)) {
            val i = SayItRight.nextLineIndex(size, last, roll)
            assertNotEquals(last, i)
            assertTrue(i in 0 until size)
        }
        assertEquals(0, SayItRight.nextLineIndex(1, 0, 0.5))
        assertEquals(0, SayItRight.nextLineIndex(3, null, 0.0))
    }

    @Test
    fun `pose maps each state`() {
        assertEquals(SayItRightPose.EXPLAINING, SayItRightPose.of(PronunciationPhase.ASK, false, null, 0))
        assertEquals(SayItRightPose.LISTENING, SayItRightPose.of(PronunciationPhase.ASK, true, null, 0))
        assertEquals(SayItRightPose.THINKING, SayItRightPose.of(PronunciationPhase.RETRY, false, Pronunciation.Verdict.ALMOST, 0))
        assertEquals(SayItRightPose.CHEER, SayItRightPose.of(PronunciationPhase.RESULT, false, Pronunciation.Verdict.GREAT, 1))
        assertEquals(SayItRightPose.IMPRESSED, SayItRightPose.of(PronunciationPhase.RESULT, false, Pronunciation.Verdict.GREAT, 2))
        assertEquals(SayItRightPose.THINKING, SayItRightPose.of(PronunciationPhase.RESULT, false, Pronunciation.Verdict.AGAIN, 2))
    }

    @Test
    fun `great praise varies and never repeats in a row`() {
        var s = PronunciationSession(words(6))
        var previous: String? = null
        repeat(6) {
            s = s.submit(s.current!!.term, 0.95, Course.ENGLISH, roll = 0.0).first
            assertTrue(SayItRight.praise(Pronunciation.Verdict.GREAT).contains(s.line))
            assertNotEquals(previous, s.line)
            previous = s.line
            s = s.next()
        }
    }

    @Test
    fun `a miss thinks then moves on kindly`() {
        var s = PronunciationSession(words(2))
        s = s.submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first
        assertEquals(SayItRightPose.THINKING, s.pose(false))
        assertEquals(SayItRight.praise(Pronunciation.Verdict.AGAIN)[0], s.line)
        s = s.submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first
        assertEquals(PronunciationPhase.RESULT, s.phase)
        assertEquals(SayItRight.MOVE_ON, s.line)
        assertEquals(SayItRightPose.THINKING, s.pose(false))
    }

    @Test
    fun `wins alternate cheer and impressed and the wrap counts clearly`() {
        var s = PronunciationSession(words(3))
        s = s.submit("word0", 0.95, Course.ENGLISH, roll = 0.0).first
        assertEquals(SayItRightPose.CHEER, s.pose(false))
        s = s.next().submit("word1", 0.95, Course.ENGLISH, roll = 0.0).first
        assertEquals(SayItRightPose.IMPRESSED, s.pose(false))
        s = s.next().submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first
        s = s.submit("word2", 0.95, Course.ENGLISH, roll = 0.0).first.next()
        assertEquals(PronunciationPhase.DONE, s.phase)
        assertEquals("2 of 3 clearly", s.clearlyLine)
    }

    @Test
    fun `no line says wrong and the cap matches say the picture`() {
        for (v in Pronunciation.Verdict.entries) for (l in SayItRight.praise(v)) assertFalse(l.lowercase().contains("wrong"))
        assertEquals(6000, SayItRight.MAX_RECORD_MS)
    }
}
