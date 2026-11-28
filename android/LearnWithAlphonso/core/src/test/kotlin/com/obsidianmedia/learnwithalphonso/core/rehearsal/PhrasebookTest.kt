package com.obsidianmedia.learnwithalphonso.core.rehearsal

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PhrasebookTest {
    private fun rehearsal(brief: RehearsalBrief?) = Rehearsal(id = "r1", course = "en", eventKind = "appointment", counterpart = "a doctor", brief = brief, status = "active", createdAt = "2026-11-27T00:00:00Z")
    private fun state(brief: RehearsalBrief?, warmup: String = "done") =
        RehearsalState(active = rehearsal(brief), progress = mapOf("warmup" to warmup, "conversation" to "todo", "hard_moments" to "todo"))

    private fun decode(json: String): RehearsalState = RehearsalDecoding.state(json)!!

    @Test fun `the phrasebook opens only once the warm-up is done and there are phrases`() {
        val brief = RehearsalBrief(keyPhrases = listOf("Good morning."))
        assertTrue(Phrasebook.isOpen(state(brief)))
        assertFalse(Phrasebook.isOpen(state(brief, warmup = "todo")))
        assertFalse(Phrasebook.isOpen(state(RehearsalBrief(keyPhrases = listOf("  ")))))
        assertFalse(Phrasebook.isOpen(state(null)))
        assertFalse(Phrasebook.isOpen(RehearsalState(active = null, progress = null)))
        // Doing a later stage does not open it: only stage 1 does.
        assertFalse(Phrasebook.isOpen(RehearsalState(active = rehearsal(brief), progress = mapOf("warmup" to "todo", "conversation" to "done"))))
    }

    @Test fun `meanings line up with their phrases by position`() {
        val e = Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", "B", "C"), keyPhraseMeanings = listOf("a", "b", "c")))
        assertEquals(listOf(PhraseEntry("A", "a"), PhraseEntry("B", "b"), PhraseEntry("C", "c")), e)
    }

    @Test fun `a dropped blank phrase does not shift a later meaning`() {
        val e = Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", " ", "C"), keyPhraseMeanings = listOf("a", "x", "c")))
        assertEquals(listOf(PhraseEntry("A", "a"), PhraseEntry("C", "c")), e)
    }

    @Test fun `meanings show only when every phrase has one`() {
        assertEquals(listOf(PhraseEntry("A"), PhraseEntry("B")), Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", "B"))))
        // Short list, or a blank meaning: none at all, never a partial set.
        assertEquals(listOf(PhraseEntry("A"), PhraseEntry("B"), PhraseEntry("C")), Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", "B", "C"), keyPhraseMeanings = listOf("a", "b"))))
        assertEquals(listOf(PhraseEntry("A"), PhraseEntry("B")), Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", "B"), keyPhraseMeanings = listOf("a", " "))))
        assertEquals(emptyList<PhraseEntry>(), Phrasebook.entries(null))
    }

    @Test fun `no snapshot is kept before the warm-up is done`() {
        assertNull(Phrasebook.snapshot(state(RehearsalBrief(keyPhrases = listOf("A")), warmup = "todo")))
    }

    @Test fun `the brief decodes with and without meanings and ignores unknown fields`() {
        val withMeanings = decode("""{"active":{"id":"r","course":"en","eventKind":"interview","counterpart":"x","status":"active","createdAt":"t","brief":{"keyPhrases":["A","B"],"keyPhraseMeanings":["a","b"],"preset":"p","opener":"o","newField":1}},"progress":{"warmup":"done","conversation":"todo","hard_moments":"todo"},"history":[],"freeAvailable":false}""")
        assertEquals(listOf("a", "b"), withMeanings.active!!.brief!!.keyPhraseMeanings)
        val without = decode("""{"active":{"id":"r","course":"en","eventKind":"interview","counterpart":"x","status":"active","createdAt":"t","brief":{"keyPhrases":["A"]}},"progress":null,"history":[],"freeAvailable":true}""")
        assertNull(without.active!!.brief!!.keyPhraseMeanings)
        val nulled = decode("""{"active":{"id":"r","course":"en","eventKind":"interview","counterpart":"x","status":"active","createdAt":"t","brief":{"keyPhrases":["A"],"keyPhraseMeanings":null}},"progress":null,"history":[],"freeAvailable":true}""")
        assertNull(nulled.active!!.brief!!.keyPhraseMeanings)
    }

    @Test fun `the snapshot round trips and a damaged one is nothing`() {
        val snap = Phrasebook.snapshot(state(RehearsalBrief(keyPhrases = listOf("A", "B"), keyPhraseMeanings = listOf("a", "b"))))!!
        assertEquals(snap, PhrasebookSnapshot.decode(snap.encode()))
        assertEquals(EventKind.APPOINTMENT, snap.kind)
        assertNull(PhrasebookSnapshot.decode("not json"))
        assertNull(PhrasebookSnapshot.decode(null))
        assertNull(PhrasebookSnapshot.decode("""{"rehearsalId":"r","eventKind":"x","entries":[]}"""))
        assertNull(Phrasebook.snapshot(state(RehearsalBrief())))
    }

    @Test fun `the server voice speaks when it works`() = runTest {
        var device = 0
        val v = Phrasebook.speak({ byteArrayOf(1) }, { true }, { device++; true })
        assertEquals(PhraseVoice.SERVER, v)
        assertEquals(0, device)
    }

    @Test fun `the device voice speaks when the fetch fails, is empty, or will not play`() = runTest {
        var device = 0
        assertEquals(PhraseVoice.DEVICE, Phrasebook.speak({ throw java.io.IOException("offline") }, { true }, { device++; true }))
        assertEquals(PhraseVoice.DEVICE, Phrasebook.speak({ null }, { true }, { device++; true }))
        assertEquals(PhraseVoice.DEVICE, Phrasebook.speak({ ByteArray(0) }, { true }, { device++; true }))
        assertEquals(PhraseVoice.DEVICE, Phrasebook.speak({ byteArrayOf(1) }, { false }, { device++; true }))
        assertEquals(PhraseVoice.DEVICE, Phrasebook.speak({ byteArrayOf(1) }, { throw IllegalStateException("codec") }, { device++; true }))
        assertEquals(5, device)
    }

    @Test fun `nothing is claimed when the device voice is not ready`() = runTest {
        assertEquals(PhraseVoice.NONE, Phrasebook.speak({ null }, { true }, { false }))
    }

    @Test fun `empty audio is never kept`() {
        var threw = 0
        for (a in listOf<ByteArray?>(null, ByteArray(0))) try { Phrasebook.requireAudio(a) } catch (e: IllegalStateException) { threw++ }
        assertEquals(2, threw)
        assertEquals(1, Phrasebook.requireAudio(byteArrayOf(1)).size)
    }

    @Test fun `a longer meanings list is not aligned either`() {
        assertEquals(listOf(PhraseEntry("A"), PhraseEntry("B")), Phrasebook.entries(RehearsalBrief(keyPhrases = listOf("A", "B"), keyPhraseMeanings = listOf("a", "b", "c"))))
    }

    @Test fun `a cancellation is not a fallback`() = runTest {
        var device = 0
        var cancelled = false
        try {
            Phrasebook.speak({ throw CancellationException("left") }, { true }, { device++; true })
        } catch (e: CancellationException) {
            cancelled = true
        }
        assertTrue(cancelled)
        assertEquals(0, device)
    }

    @Test fun `the plan row card says how many phrases and that they can be heard and said`() {
        assertEquals("8 phrases · tap to hear, say them", Phrasebook.linkSubtitle(8))
        assertEquals("1 phrase · tap to hear, say them", Phrasebook.linkSubtitle(1))
        assertEquals("Tap play to hear it.", Phrasebook.HEAR_HINT)
    }

    @Test fun `the accessibility label names the phrase`() {
        assertEquals("Hear Good morning.", Phrasebook.hearLabel("Good morning."))
    }
}
