package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Ported from PodcastTreeTests.swift and src/lib/podcast-tree.test.ts, same values. */
class PodcastTreeTest {
    private fun folder(id: String, parent: String?, slug: String, sort: Int = 0) = PodcastFolder(id, parent, slug, slug, null, sort)

    @Test
    fun `children are ordered by sortOrder then slug`() {
        val all = listOf(folder("b", "a", "b1", 2), folder("a", null, "en"), folder("c", "a", "c1", 1))
        assertEquals(listOf("c1", "b1"), PodcastTree.children("a", all).map { it.slug })
    }

    @Test
    fun `roots are folders with no parent and an orphan is dropped not promoted`() {
        val all = listOf(folder("a", null, "en"), folder("orphan", "gone", "lost"))
        assertEquals(listOf("en"), PodcastTree.children(null, all).map { it.slug })
    }

    @Test
    fun `resolve walks a slug path by parent and slug`() {
        val all = listOf(folder("a", null, "en"), folder("b", "a", "a1"), folder("c", "b", "cafe"))
        assertEquals("c", PodcastTree.resolve(listOf("en", "a1", "cafe"), all)?.id)
        assertNull(PodcastTree.resolve(listOf("en", "nope"), all))
        assertNull(PodcastTree.resolve(listOf("en", "cafe"), all), "cafe lives under a1, not en")
    }

    @Test
    fun `cycles are detected and children terminates on a cyclic tree`() {
        val cycle = PodcastTree.findCycle(listOf(folder("a", "b", "en"), folder("b", "a", "a1")))
        assertEquals(setOf("a", "b"), cycle?.toSet())
        assertEquals(listOf("a"), PodcastTree.findCycle(listOf(folder("a", "a", "en"))))
        assertNull(PodcastTree.findCycle(listOf(folder("a", null, "en"), folder("b", "a", "a1"))))
        assertEquals(0, PodcastTree.children(null, listOf(folder("a", "b", "en"), folder("b", "a", "a1"))).size)
    }

    @Test
    fun `slugs are validated like the web`() {
        assertTrue(PodcastTree.isValidSlug("cafe-orders-a1"))
        for (bad in listOf("Cafe", "a b", "a/b", "", "-lead", "trail-", "a--b", "é")) assertFalse(PodcastTree.isValidSlug(bad), bad)
    }
}

/** Ported from PodcastSearchTests.swift and src/lib/podcast-search.test.ts. */
class PodcastSearchTest {
    @Test
    fun `normalizeQuery trims collapses caps and rejects short`() {
        assertEquals("ordering coffee", PodcastSearch.normalizeQuery("  ordering   coffee  "))
        assertNull(PodcastSearch.normalizeQuery(""))
        assertNull(PodcastSearch.normalizeQuery("   "))
        assertNull(PodcastSearch.normalizeQuery("\n\t"))
        assertNull(PodcastSearch.normalizeQuery("a"))
        assertEquals("ab", PodcastSearch.normalizeQuery("ab"))
        assertEquals(100, PodcastSearch.normalizeQuery("a".repeat(500))?.length)
    }

    @Test
    fun `escapeLikeValue escapes wildcards and the escape character first`() {
        assertEquals("50\\%", PodcastSearch.escapeLikeValue("50%"))
        assertEquals("a\\_b", PodcastSearch.escapeLikeValue("a_b"))
        assertEquals("a\\\\b", PodcastSearch.escapeLikeValue("a\\b"))
        assertEquals("\\\\\\%", PodcastSearch.escapeLikeValue("\\%"))
        assertEquals("ordering coffee", PodcastSearch.escapeLikeValue("ordering coffee"))
    }

    @Test
    fun `ilikeOrFilter quotes values and covers every column`() {
        assertEquals("title.ilike.\"%coffee%\",description.ilike.\"%coffee%\"", PodcastSearch.ilikeOrFilter("coffee", listOf("title", "description")))
        assertEquals("title.ilike.\"%coffee, tea%\"", PodcastSearch.ilikeOrFilter("coffee, tea", listOf("title")))
        assertEquals("title.ilike.\"%say \\\"hello\\\"%\"", PodcastSearch.ilikeOrFilter("say \"hello\"", listOf("title")))
        assertNull(PodcastSearch.ilikeOrFilter("  ", listOf("title")))
        assertNull(PodcastSearch.ilikeOrFilter("a", listOf("title")))
        assertNull(PodcastSearch.ilikeOrFilter("coffee", emptyList()))
    }
}

/** Ported from PodcastTranscriptTests.swift. */
class PodcastTranscriptTest {
    @Test
    fun `paragraphs split on blank lines, join wrapped lines, collapse runs`() {
        assertEquals(listOf("One.", "Two.", "Three."), PodcastTranscript.paragraphs("One.\n\nTwo.\n\nThree."))
        assertEquals(listOf("Just one line."), PodcastTranscript.paragraphs("Just one line."))
        assertEquals(emptyList<String>(), PodcastTranscript.paragraphs(""))
        assertEquals(listOf("A line wrapped here.", "Next."), PodcastTranscript.paragraphs("A line\nwrapped here.\n\nNext."))
        assertEquals(listOf("One.", "Two."), PodcastTranscript.paragraphs("One.\n\n\n\nTwo."))
    }
}

/** Ported from PodcastPlaybackTests.swift and podcast.functions.test.ts. */
class PodcastPlaybackTest {
    @Test
    fun `clampPosition vectors`() {
        assertEquals(42.0, PodcastPlayback.clampPosition(42.0, 300.0))
        assertEquals(0.0, PodcastPlayback.clampPosition(400.0, 300.0))
        assertEquals(0.0, PodcastPlayback.clampPosition(299.6, 300.0))
        assertEquals(0.0, PodcastPlayback.clampPosition(-5.0, 300.0))
        assertEquals(0.0, PodcastPlayback.clampPosition(Double.NaN, 300.0))
        assertEquals(0.0, PodcastPlayback.clampPosition(Double.POSITIVE_INFINITY, 300.0))
    }

    @Test
    fun `audioUrl builds the public bucket URL and encodes segments`() {
        assertEquals(
            "https://project.supabase.co/storage/v1/object/public/podcast-audio/en/a1/ordering-coffee.mp3",
            PodcastPlayback.audioUrl("https://project.supabase.co", "en/a1/ordering-coffee.mp3"),
        )
        val spaced = PodcastPlayback.audioUrl("https://project.supabase.co", "en/a1/cafe au lait.mp3")
        assertNotNull(spaced)
        assertFalse(spaced!!.contains(" "))
        assertTrue(spaced.contains("/en/a1/"))
        assertNull(PodcastPlayback.audioUrl("https://project.supabase.co", ""))
    }
}

/** Ported from PodcastCacheTests.swift. */
class PodcastCacheTest {
    private fun entry(id: String = "e1", bytes: Long = 100, etag: String? = "v1", stored: Int = 172, lastPlayed: Long? = null) =
        PodcastCacheEntry(id, bytes, etag, stored, lastPlayed)

    private fun episode(id: String, title: String) = PodcastEpisode(id, "f1", title.lowercase(), title, null, "https://example.test/$id.mp3", 172, 0, null)

    @Test
    fun `file names derive from the id and cannot escape the directory`() {
        val id = "11111111-1111-1111-1111-111111111111"
        assertTrue(PodcastCache.fileName(id).endsWith(".mp3"))
        assertTrue(PodcastCache.fileName(id).contains(id))
        val traversal = PodcastCache.fileName("../../etc/passwd")
        assertFalse(traversal.contains("/"))
        assertFalse(traversal.contains(".."))
        val backslash = PodcastCache.fileName("..\\..\\windows")
        assertFalse(backslash.contains("\\"))
        assertFalse(backslash.contains(".."))
        assertTrue(PodcastCache.fileName("abc") != PodcastCache.temporaryFileName("abc"))
    }

    @Test
    fun `budget refuses when full and is injectable so the refusal path is reachable`() {
        assertTrue(PodcastCacheBudget.canAdd(50, listOf(entry(bytes = 100)), 200))
        assertFalse(PodcastCacheBudget.canAdd(50, listOf(entry(bytes = 180)), 200))
        val one = entry(bytes = 1_378_473)
        assertFalse(PodcastCacheBudget.canAdd(1_378_473, listOf(one), 2_000_000))
        assertTrue(PodcastCacheBudget.canAdd(1_378_473, listOf(one), 500_000_000))
    }

    @Test
    fun `deletion candidates are never played first then least recently played and only as many as needed`() {
        val old = entry("old", 100, lastPlayed = 0L)
        val fresh = entry("fresh", 100, lastPlayed = 1_758_000_000_000L)
        assertEquals("old", PodcastCacheBudget.deletionCandidates(listOf(fresh, old), 50, 200).first().episodeId)
        val never = entry("never", 100, lastPlayed = null)
        val played = entry("played", 100, lastPlayed = 1_758_000_000_000L)
        assertEquals("never", PodcastCacheBudget.deletionCandidates(listOf(played, never), 50, 150).first().episodeId)
        assertEquals(1, PodcastCacheBudget.deletionCandidates(listOf(entry("a", 100), entry("b", 100)), 60, 200).size)
        assertTrue(PodcastCacheBudget.deletionCandidates(listOf(entry(bytes = 10)), 10, 1000).isEmpty())
        assertEquals(2, PodcastCacheBudget.deletionCandidates(listOf(entry("a", 10), entry("b", 10)), 5_000, 100).size)
    }

    @Test
    fun `staleness by etag then bytes, never on ignorance, weak etags ignored`() {
        assertTrue(PodcastCache.isStale(entry(etag = "v1"), "v2", null))
        assertFalse(PodcastCache.isStale(entry(etag = "v1"), "v1", null))
        assertTrue(PodcastCache.isStale(entry(bytes = 100, etag = null), null, 200))
        assertFalse(PodcastCache.isStale(entry(etag = "v1"), null, null))
        assertFalse(PodcastCache.isStale(entry(etag = "\"abc\""), "W/\"abc\"", null))
    }

    @Test
    fun `duration disagreement tolerates rounding and unreadable durations`() {
        assertTrue(PodcastCache.durationDisagrees(40.0, 172))
        assertFalse(PodcastCache.durationDisagrees(171.6, 172))
        assertFalse(PodcastCache.durationDisagrees(Double.NaN, 172))
        assertFalse(PodcastCache.durationDisagrees(0.0, 172))
    }

    @Test
    fun `offline listing keeps downloaded episodes ordered by title and drops ghosts`() {
        assertEquals(listOf("b"), PodcastCache.offlineListing(listOf(entry("b")), listOf(episode("a", "Alpha"), episode("b", "Bravo"))).map { it.id })
        assertEquals(listOf("Alpha", "Bravo"), PodcastCache.offlineListing(listOf(entry("a"), entry("b")), listOf(episode("b", "Bravo"), episode("a", "Alpha"))).map { it.title })
        assertTrue(PodcastCache.offlineListing(emptyList(), listOf(episode("a", "Alpha"))).isEmpty())
        assertTrue(PodcastCache.offlineListing(listOf(entry("ghost")), emptyList()).isEmpty())
    }
}

class PodcastSessionTrackerTest {
    @Test
    fun `listened time ignores seeks and saves fire every ten seconds in either direction`() {
        val t = PodcastSessionTracker()
        assertFalse(t.tick(0.0).savePosition)
        assertFalse(t.tick(1.0).savePosition)
        assertFalse(t.tick(2.0).savePosition)
        // A seek from 2 to 40 counts nothing as listened but crosses the save distance.
        assertTrue(t.tick(40.0).savePosition)
        assertFalse(t.tick(41.0).savePosition)
        assertEquals(3, t.flushListened())
        assertEquals(0, t.flushListened())
        // Backward skip: abs distance from the last save (40) is 40, so it saves; then nothing until 10 away.
        assertTrue(t.tick(0.0).savePosition)
        assertFalse(t.tick(9.0).savePosition)
        assertTrue(t.tick(10.0).savePosition)
        assertFalse(t.tick(Double.NaN).savePosition)
        t.reset()
        assertFalse(t.tick(5.0).savePosition)
        assertEquals(0, t.flushListened())
    }
}
