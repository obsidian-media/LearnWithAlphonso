package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PodcastSaveGateTest {
    @Test
    fun `a stale write stops saving until the learner acts, and the action starts from no known row`() {
        val gate = PodcastSaveGate("t1")
        assertTrue(gate.canSave)
        gate.recordStale()
        assertFalse(gate.canSave)
        assertNull(gate.lastSeenUpdatedAt)
        gate.userStartedPlayback()
        assertTrue(gate.canSave)
        assertNull(gate.lastSeenUpdatedAt, "the next save is an upsert")
    }

    @Test
    fun `a 401 stops saving until the learner acts, which keeps what was seen`() {
        val gate = PodcastSaveGate("t1")
        gate.recordUnauthorized()
        assertFalse(gate.canSave)
        gate.userStartedPlayback()
        assertTrue(gate.canSave)
        assertEquals("t1", gate.lastSeenUpdatedAt)
    }

    @Test
    fun `a save records what the server stored`() {
        val gate = PodcastSaveGate("t1")
        gate.recordSaved("t2")
        assertEquals("t2", gate.lastSeenUpdatedAt)
        gate.beginEpisode("t9")
        assertEquals("t9", gate.lastSeenUpdatedAt)
    }

    @Test
    fun `an account change forgets everything and refuses a save chained from the previous account`() {
        val gate = PodcastSaveGate("t1")
        val before = gate.epoch
        assertTrue(gate.accepts(before))
        gate.recordStale()
        gate.recordUnauthorized()
        gate.resetForAccountChange()
        assertFalse(gate.accepts(before))
        assertTrue(gate.accepts(gate.epoch))
        assertNull(gate.lastSeenUpdatedAt)
        assertTrue(gate.canSave)
        gate.resetForAccountChange()
        assertEquals(before + 2, gate.epoch)
    }
}

class PodcastSavedPositionsTest {
    private fun ep(position: Int, stamp: String?, id: String = "e1") =
        PodcastEpisode(id, "f", id, "T", null, "u", 300, position, stamp, aiNarrated = true)

    @Test
    fun `the last stored position replaces a stale snapshot of this device's own history`() {
        val p = PodcastSavedPositions()
        p.noteSeen(ep(10, "t0"))
        p.record("e1", 120, "t1")
        val applied = p.applying(ep(10, "t0"))
        assertEquals(120, applied.positionSeconds)
        assertEquals("t1", applied.playbackUpdatedAt)
        assertTrue(applied.aiNarrated, "everything else about the episode is kept")
    }

    @Test
    fun `a snapshot with a stamp this device never saw came from elsewhere and wins`() {
        val p = PodcastSavedPositions()
        p.record("e1", 120, "t1")
        val fromAnotherDevice = ep(200, "t-other")
        assertEquals(fromAnotherDevice, p.applying(fromAnotherDevice))
    }

    @Test
    fun `noticing a foreign stamp forgets the older stored position`() {
        val p = PodcastSavedPositions()
        p.noteSeen(ep(0, "t0"))
        p.record("e1", 120, "t1")
        p.noteSeen(ep(500, "t-other"))
        assertNull(p.lastStoredStamp("e1"))
        assertEquals(500, p.applying(ep(500, "t-other")).positionSeconds)
    }

    @Test
    fun `an episode with no snapshot stamp takes the stored position, and a save without a stamp is ignored`() {
        val p = PodcastSavedPositions()
        p.record("e1", 77, null)
        assertNull(p.lastStoredStamp("e1"))
        p.record("e1", 77, "t1")
        assertEquals("t1", p.lastStoredStamp("e1"))
        assertEquals(77, p.applying(ep(0, null)).positionSeconds)
    }

    @Test
    fun `positions are per episode, and the stored stamps join the known history`() {
        val p = PodcastSavedPositions()
        p.record("e1", 10, "a")
        p.record("e1", 20, "b")
        assertEquals(20, p.applying(ep(0, "a")).positionSeconds)
        assertEquals(20, p.applying(ep(0, "b")).positionSeconds)
        assertEquals(0, p.applying(ep(0, "a", id = "e2")).positionSeconds)
    }

    @Test
    fun `another account never inherits positions`() {
        val p = PodcastSavedPositions()
        p.record("e1", 120, "t1")
        p.reset()
        assertNull(p.lastStoredStamp("e1"))
        assertEquals(5, p.applying(ep(5, "t1")).positionSeconds)
    }
}

class PodcastLabelTest {
    @Test
    fun `only the tts source is AI-narrated`() {
        assertTrue(PodcastLabel.isAiNarrated("tts"))
        assertFalse(PodcastLabel.isAiNarrated("upload"))
        assertFalse(PodcastLabel.isAiNarrated(null))
        assertFalse(PodcastLabel.isAiNarrated("TTS"))
    }

    @Test
    fun `row subtitles read like iOS and the web`() {
        assertEquals("5:05", PodcastLabel.rowSubtitle(305, resume = false, aiNarrated = false))
        assertEquals("5:05 \u00B7 Resume", PodcastLabel.rowSubtitle(305, resume = true, aiNarrated = false))
        assertEquals("5:05 \u00B7 AI-narrated", PodcastLabel.rowSubtitle(305, resume = false, aiNarrated = true))
        assertEquals("5:05 \u00B7 Resume \u00B7 AI-narrated", PodcastLabel.rowSubtitle(305, resume = true, aiNarrated = true))
        assertEquals("0:09", PodcastLabel.rowSubtitle(9, resume = false, aiNarrated = false))
    }

    @Test
    fun `downloaded rows carry the label too`() {
        assertEquals("Downloaded", PodcastLabel.downloadedSubtitle(false))
        assertEquals("Downloaded \u00B7 AI-narrated", PodcastLabel.downloadedSubtitle(true))
        assertEquals("AI-narrated", PodcastLabel.AI_NARRATED)
    }
}
