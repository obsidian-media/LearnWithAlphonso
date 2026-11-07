package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LearnFoldTest {
    private fun mk(n: Int) = (1..n).map { FoldUnit("u$it", "Unit $it", "T$it", listOf("u${it}l1", "u${it}l2")) }
    private fun all(vararg us: Int) = us.flatMap { listOf("u${it}l1", "u${it}l2") }.toSet()
    private fun shape(rows: List<FoldRow>) = rows.map { r ->
        when (r) { is FoldRow.DoneRun -> "done-run"; is FoldRow.UnitRow -> if (r.current) "unit:current" else "unit:ahead" }
    }

    @Test
    fun `folds an unbroken done run into one row, opens the current unit, folds the rest`() {
        val rows = LearnFold.foldLearn(mk(6), all(1, 2, 3))
        assertEquals(listOf("done-run", "unit:current", "unit:ahead", "unit:ahead", "unit:ahead"), shape(rows))
        val run = rows[0] as FoldRow.DoneRun
        assertEquals(listOf("u1", "u2", "u3"), run.unitIds)
        assertEquals("Units 1-3", LearnFold.runLabel(run))
        assertEquals(6 to 6, run.done to run.total)
    }

    @Test
    fun `a partly-done unit is the current one, never folded`() {
        val rows = LearnFold.foldLearn(mk(3), setOf("u1l1", "u1l2", "u2l1"))
        val u = rows[1] as FoldRow.UnitRow
        assertTrue(u.current)
        assertEquals(1 to 2, u.done to u.total)
    }

    @Test
    fun `a fresh learner has no done run and exactly one current unit`() {
        val rows = LearnFold.foldLearn(mk(4), emptySet())
        assertEquals(0, rows.count { it is FoldRow.DoneRun })
        assertEquals(1, rows.count { it is FoldRow.UnitRow && it.current })
    }

    @Test
    fun `a done unit after the current one is not merged into a run before it`() {
        val rows = LearnFold.foldLearn(mk(4), all(1, 3))
        assertEquals(listOf("done-run", "unit:current", "done-run", "unit:ahead"), shape(rows))
    }

    @Test
    fun `two runs split by an unfinished unit stay two rows`() {
        val rows = LearnFold.foldLearn(mk(5), all(1, 2, 4, 5))
        assertEquals(listOf("done-run", "unit:current", "done-run"), shape(rows))
        assertEquals("Units 1-2", LearnFold.runLabel(rows[0] as FoldRow.DoneRun))
        assertEquals("Units 4-5", LearnFold.runLabel(rows[2] as FoldRow.DoneRun))
    }

    @Test
    fun `everything done folds to a single row with no current unit`() {
        val rows = LearnFold.foldLearn(mk(3), all(1, 2, 3))
        assertEquals(1, rows.size)
        assertTrue(rows[0] is FoldRow.DoneRun)
    }

    @Test
    fun `an empty unit is never counted as done`() {
        val rows = LearnFold.foldLearn(listOf(FoldUnit("x", "Unit 1", "x", emptyList())), emptySet())
        assertTrue(rows[0] is FoldRow.UnitRow)
    }

    @Test
    fun `a single done unit labels as just its name`() {
        assertEquals("Unit 1", LearnFold.runLabel(LearnFold.foldLearn(mk(2), all(1))[0] as FoldRow.DoneRun))
    }

    @Test
    fun `currentUnitOf is the first undone lesson, 1-based within the whole course`() {
        assertEquals(CurrentUnit(3, 5, "u3", "u3l1"), LearnFold.currentUnitOf(mk(5), all(1, 2)))
        assertNull(LearnFold.currentUnitOf(mk(2), all(1, 2)))
    }

    @Test
    fun `roomArtFor wraps and never throws`() {
        val list = LearnFold.ROOM_ART
        assertEquals(list.first(), LearnFold.roomArtFor(0))
        assertEquals(list.first(), LearnFold.roomArtFor(list.size))
        assertEquals(list.last(), LearnFold.roomArtFor(-1))
        assertEquals("Tech Shop", LearnFold.roomName("techshop"))
        assertEquals("Library", LearnFold.roomName("library"))
    }
}
