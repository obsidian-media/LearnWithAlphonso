package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Same values as src/lib/listen-library.test.ts and ListenShelfTests.swift. */
class ListenShelfTest {
    private fun folder(id: String, parent: String?, slug: String, course: String? = null) =
        PodcastFolder(id, parent, slug, slug, null, 0, course)

    private fun ep(id: String, folderId: String, dur: Int = 600) =
        PodcastEpisode(id, folderId, id, id, null, "https://x.test/a.mp3", dur, 0, null)

    private fun prog(id: String, pos: Int, at: String, done: Boolean = false) = ListenProgress(id, pos, if (done) "x" else null, at)

    private val folders = listOf(
        folder("en", null, "en", "en"), folder("a2", "en", "a2"), folder("shop", "a2", "bookshop"),
        folder("fr", null, "fr", "fr"), folder("frq", "fr", "mystery"),
    )
    private val eps = listOf(ep("e1", "shop"), ep("e2", "shop"), ep("e3", "shop"), ep("f1", "frq"))

    @Test
    fun `state and fraction`() {
        assertEquals(ListenEpisodeState.New, ListenShelf.state(null))
        assertEquals(ListenEpisodeState.New, ListenShelf.state(prog("e1", 0, "t")))
        assertEquals(ListenEpisodeState.InProgress, ListenShelf.state(prog("e1", 5, "t")))
        assertEquals(ListenEpisodeState.Done, ListenShelf.state(prog("e1", 5, "t", done = true)))
        assertEquals(0.5, ListenShelf.fraction(eps[0], prog("e1", 300, "t")))
        assertEquals(1.0, ListenShelf.fraction(eps[0], prog("e1", 9999, "t")))
        assertEquals(1.0, ListenShelf.fraction(eps[0], prog("e1", 10, "t", done = true)))
        assertEquals(370, ListenShelf.secondsLeft(eps[0], prog("e1", 230, "t")))
    }

    @Test
    fun `formatting`() {
        assertEquals("6:10", ListenShelf.clock(370))
        assertEquals("3 h 20 m", ListenShelf.hoursMinutes(12000))
        assertEquals("0 m", ListenShelf.hoursMinutes(0))
        assertEquals(2_000_000_000, ListenShelf.wirePosition(Int.MAX_VALUE))
        assertEquals(0, ListenShelf.wirePosition(-4))
    }

    @Test
    fun `levels course and percent`() {
        assertEquals("A2", ListenShelf.level("shop", folders))
        assertNull(ListenShelf.level("frq", folders))
        val en = ListenShelf.shelves(folders, eps, emptyList(), "en")
        assertEquals(listOf("shop"), en.map { it.folder.id })
        assertEquals(listOf("A2"), ListenShelf.levels(en))
        assertEquals(listOf("frq"), ListenShelf.shelves(folders, eps, emptyList(), "fr").map { it.folder.id })
        assertTrue(ListenShelf.shelves(folders, eps, emptyList(), "es").isEmpty())
        val half = ListenShelf.shelves(folders, eps, listOf(prog("e1", 0, "t", true), prog("e2", 300, "t")), "en")
        assertEquals(1, half[0].doneCount)
        assertEquals(50, half[0].percent)
        val all = listOf("e1", "e2", "e3").map { prog(it, 0, "t", true) }
        assertEquals(100, ListenShelf.shelves(folders, eps, all, "en")[0].percent)
    }

    @Test
    fun `a room is by subject else stable`() {
        assertEquals("library", ListenShelf.room(folder("x", null, "bookshop")))
        assertEquals(ListenShelf.room(folder("x", null, "zzz")), ListenShelf.room(folder("y", null, "zzz")))
    }

    @Test
    fun `continue listening`() {
        val shelves = ListenShelf.shelves(folders, eps, emptyList(), "en")
        assertNull(ListenShelf.continueListening(shelves, emptyList()))
        val recent = ListenShelf.continueListening(shelves, listOf(prog("e1", 100, "2026-01-01"), prog("e2", 50, "2026-01-02")))
        assertEquals("e2", recent?.episode?.id)
        val after = ListenShelf.continueListening(shelves, listOf(prog("e1", 0, "2026-01-02", true)))
        assertEquals("e2", after?.episode?.id)
        assertNull(after?.progress)
        val finished = listOf("e1", "e2", "e3").map { prog(it, 0, "2026-01-01", true) }
        assertNull(ListenShelf.continueListening(shelves, finished))
    }
}
