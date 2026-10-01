package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Question
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors from LessonReinforcementTests.swift; the FNV vector was computed independently. */
class LessonReinforcementTest {
    private fun mc(id: String) = Question.MultipleChoice(id, "p$id", listOf("a", "b"), 0, "e")

    @Test
    fun `fnv1a matches the reference value`() {
        assertEquals(0x1A47E90Bu, fnv1aHash("abc"))
    }

    @Test
    fun `draws from sibling questions by default`() {
        val q = pickReinforcementQuestion(listOf(mc("s1"), mc("s2")), listOf(mc("l1"), mc("l2")), false, "seed-1")
        assertTrue(q!!.id in setOf("s1", "s2"))
    }

    @Test
    fun `draws from level questions when doing well`() {
        val q = pickReinforcementQuestion(listOf(mc("s1"), mc("s2")), listOf(mc("l1"), mc("l2")), true, "seed-1")
        assertTrue(q!!.id in setOf("l1", "l2"))
    }

    @Test
    fun `falls back to the other pool when the primary is empty`() {
        assertEquals("l1", pickReinforcementQuestion(emptyList(), listOf(mc("l1")), false, "seed-1")!!.id)
        assertEquals("s1", pickReinforcementQuestion(listOf(mc("s1")), emptyList(), true, "seed-1")!!.id)
    }

    @Test
    fun `returns null when both pools are empty`() {
        assertNull(pickReinforcementQuestion(emptyList(), emptyList(), false, "seed-1"))
    }

    @Test
    fun `is deterministic for the same seed`() {
        val pool = listOf(mc("s1"), mc("s2"), mc("s3"))
        val a = pickReinforcementQuestion(pool, emptyList(), false, "same-seed")
        val b = pickReinforcementQuestion(pool, emptyList(), false, "same-seed")
        assertEquals(a, b)
        // fnv1a("same-seed") % 3 == 1, computed outside the port.
        assertEquals("s2", a!!.id)
    }
}
