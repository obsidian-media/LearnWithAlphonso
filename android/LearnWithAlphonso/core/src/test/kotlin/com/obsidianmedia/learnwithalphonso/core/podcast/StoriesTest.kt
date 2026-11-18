package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StoriesTest {
    private fun summary(
        title: String, level: String = "A1", order: Int = 0, course: String = "en", published: Boolean = true,
        index: Int = 0, best: Int? = null, total: Int? = null, completed: Boolean = false,
    ) = StorySummary(title, course, level, title, title, order, published, index, 5, best, total, completed)

    @Test
    fun `only published stories in the course are shown`() {
        val list = listOf(summary("draft", published = false), summary("fr", course = "fr"), summary("ok"))
        assertEquals(listOf("ok"), Stories.visible(list, "en").map { it.title })
    }

    @Test
    fun `a branching story with no sentences is not listed in this reader`() {
        val branching = summary("branching").copy(segmentCount = 0)
        assertEquals(listOf("plain"), Stories.visible(listOf(branching, summary("plain")), "en").map { it.title })
    }

    @Test
    fun `stories are grouped by level in reading order`() {
        val groups = Stories.groupByLevel(
            Stories.visible(listOf(summary("b", "A2", 1), summary("c", "A1", 2), summary("a", "A1", 1)), "en"),
        )
        assertEquals(listOf("A1", "A2"), groups.map { it.level })
        assertEquals(listOf("a", "c"), groups[0].stories.map { it.title })
    }

    @Test
    fun `status says best, then continue, then new`() {
        assertEquals("Best: 2 of 3", Stories.status(summary("s", best = 2, total = 3)))
        assertEquals("Continue reading", Stories.status(summary("s", index = 2)))
        assertEquals("New", Stories.status(summary("s", index = 2, completed = true)))
        assertEquals("New", Stories.status(summary("s")))
    }

    @Test
    fun `the next segment never runs past the text or loops`() {
        assertEquals(1, Stories.nextSegment(0, 3))
        assertNull(Stories.nextSegment(2, 3))
        assertNull(Stories.nextSegment(9, 3))
        assertNull(Stories.nextSegment(-1, 3))
    }

    @Test
    fun `a resume point is clamped into the text and the wire position into what the server accepts`() {
        assertEquals(2, Stories.clampSegment(7, 3))
        assertEquals(0, Stories.clampSegment(-4, 3))
        assertEquals(0, Stories.clampSegment(2, 0))
        assertEquals(1, Stories.clampSegment(1, 3))
        assertEquals(0, Stories.wireSegment(-1))
        assertEquals(59, Stories.wireSegment(500))
        assertEquals(12, Stories.wireSegment(12))
    }

    @Test
    fun `narration hands the highlight on and stops at the end`() {
        var run = StoryNarration(count = 2).start(0)
        assertEquals(0, run.current)
        assertTrue(run.playing)
        run = run.finishedCurrent()
        assertEquals(1, run.current)
        run = run.finishedCurrent()
        assertNull(run.current)
        assertFalse(run.playing)
        assertFalse(run.failed)
    }

    @Test
    fun `narration ignores a start outside the text and a finish while stopped`() {
        assertFalse(StoryNarration(count = 2).start(5).playing)
        val stopped = StoryNarration(count = 2).start(1).stop()
        assertEquals(stopped, stopped.finishedCurrent())
    }

    @Test
    fun `a failed narration clears the highlight, says so, and playing again clears the failure`() {
        val failed = StoryNarration(count = 3).start(1).fail()
        assertTrue(failed.failed)
        assertNull(failed.current)
        assertFalse(failed.playing)
        assertFalse(failed.start(0).failed)
    }

    @Test
    fun `a missing check is told apart from the quiz copy`() {
        assertEquals("This check isn't available right now.", StoryCopy.message(PodcastQuizError.NOT_FOUND))
        assertEquals(PodcastQuizCopy.message(PodcastQuizError.SERVER), StoryCopy.message(PodcastQuizError.SERVER))
    }
}
