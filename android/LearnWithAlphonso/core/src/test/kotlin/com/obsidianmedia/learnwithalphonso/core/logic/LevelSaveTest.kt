package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LevelSaveTest {
    @Test
    fun `a save that fails twice then lands is retried and reports saved`() = runTest {
        var tries = 0
        val pauses = mutableListOf<Int>()
        val saved = LevelSave.run(pause = { pauses += it }) { if (++tries < 3) error("offline") }
        assertTrue(saved)
        assertEquals(3, tries)
        assertEquals(listOf(1, 2), pauses)
    }

    @Test
    fun `a save that never lands stops after three tries and reports not saved`() = runTest {
        var tries = 0
        val pauses = mutableListOf<Int>()
        assertFalse(LevelSave.run(pause = { pauses += it }) { tries++; error("offline") })
        assertEquals(LevelSave.ATTEMPTS, tries)
        assertEquals(listOf(1, 2), pauses, "no pause after the last try")
    }

    @Test
    fun `a save that lands first time is tried once`() = runTest {
        var tries = 0
        assertTrue(LevelSave.run(pause = { error("no pause expected") }) { tries++ })
        assertEquals(1, tries)
    }
}
