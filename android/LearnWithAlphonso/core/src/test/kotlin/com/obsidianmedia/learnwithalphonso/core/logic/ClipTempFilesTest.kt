package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.nio.file.Files

class ClipTempFilesTest {
    @Test fun sweepRemovesOnlyTheLeftoverClipFiles() {
        val dir = Files.createTempDirectory("sweep").toFile()
        try {
            val mine = listOf(ClipTempFiles.create(dir), ClipTempFiles.create(dir, "m4a"))
            val others = listOf(File(dir, "turn.m4a"), File(dir, "keep-sir-wave-x.mp3"))
            (mine + others).forEach { it.writeBytes(byteArrayOf(1)) }

            assertEquals(2, ClipTempFiles.sweep(dir))

            assertEquals(others.map { it.name }.toSet(), dir.listFiles()!!.map { it.name }.toSet())
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test fun sweepOfAMissingDirectoryIsZero() {
        assertEquals(0, ClipTempFiles.sweep(File("/no/such/dir-${System.nanoTime()}")))
    }

    @Test fun namesCarryThePrefix() {
        assertTrue(ClipTempFiles.create(File("x")).name.startsWith("sir-wave-"))
    }
}
