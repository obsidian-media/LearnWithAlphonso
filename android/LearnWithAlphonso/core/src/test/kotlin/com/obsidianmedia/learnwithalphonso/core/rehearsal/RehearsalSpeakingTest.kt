package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.rehearsal.SpeakingTrend.Direction
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RehearsalSpeakingTest {
    private val speaking = ContentJson.json.parseToJsonElement(javaClass.getResource("/rehearsal-api.json")!!.readText()).jsonObject.getValue("speaking").jsonObject
    private fun case(name: String) = speaking.getValue(name).toString()

    private fun note(kind: SpeakingKind, count: Int, total: Int, previous: Int?) = SpeakingNote(kind, count, total, previous)

    @Test fun `the full fixture decodes in the server's order`() {
        val s = RehearsalSpeaking.parse(case("full"))!!
        assertEquals(
            listOf(
                note(SpeakingKind.FULL_REPLIES, 7, 9, 4),
                note(SpeakingKind.KEY_PHRASES, 3, 8, 4),
                note(SpeakingKind.ENGLISH_FALLBACK, 2, 9, null),
            ),
            s.notes,
        )
    }

    @Test fun `the single fixture decodes one note with no previous`() {
        assertEquals(listOf(note(SpeakingKind.KEY_PHRASES, 3, 8, null)), RehearsalSpeaking.parse(case("single"))!!.notes)
    }

    @Test fun `notes are not re-sorted`() {
        val s = RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[
            {"kind":"key_phrases","count":1,"total":2,"previous":null},{"kind":"full_replies","count":5,"total":5,"previous":null}]}}""")!!
        assertEquals(listOf(SpeakingKind.KEY_PHRASES, SpeakingKind.FULL_REPLIES), s.notes.map { it.kind })
    }

    @Test fun `an unknown kind is dropped and the rest are kept`() {
        val s = RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[
            {"kind":"pace","count":1,"total":2,"previous":null},{"kind":"key_phrases","count":2,"total":4,"previous":1}]}}""")!!
        assertEquals(listOf(note(SpeakingKind.KEY_PHRASES, 2, 4, 1)), s.notes)
    }

    @Test fun `only unknown kinds, an empty list, or a malformed note gives null`() {
        assertNull(RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[{"kind":"pace","count":1,"total":2,"previous":null}]}}"""))
        assertNull(RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[]}}"""))
        assertNull(RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[{"kind":"key_phrases","count":"x","total":2}]}}"""))
        assertNull(RehearsalSpeaking.parse("""{"rehearsalSpeaking":{}}"""))
        assertNull(RehearsalSpeaking.parse("""{"rehearsalSpeaking":null}"""))
        assertNull(RehearsalSpeaking.parse("not json"))
    }

    @Test fun `absent for a non-rehearsal call gives null, and it reads without a recap`() {
        assertNull(RehearsalSpeaking.parse("""{"recap":{"corrections":[]}}"""))
        assertNotNull(RehearsalSpeaking.parse("""{"recap":null,"rehearsalSpeaking":{"notes":[{"kind":"key_phrases","count":1,"total":3,"previous":null}]}}"""))
    }

    @Test fun `at most three notes are kept`() {
        val n = """{"kind":"key_phrases","count":1,"total":2,"previous":null}"""
        assertEquals(3, RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[$n,$n,$n,$n]}}""")!!.notes.size)
    }

    @Test fun `full replies sentences carry the trend words`() {
        val f = SpeakingKind.FULL_REPLIES
        assertEquals("You answered in full sentences 7 of 9 times.", SpeakingRules.sentence(note(f, 7, 9, null), "Spanish"))
        assertEquals("You answered in full sentences 7 of 9 times, up from 4 last time.", SpeakingRules.sentence(note(f, 7, 9, 4), "Spanish"))
        assertEquals("You answered in full sentences 3 of 9 times, down from 4 last time.", SpeakingRules.sentence(note(f, 3, 9, 4), "Spanish"))
        assertEquals("You answered in full sentences 4 of 9 times, the same as last time.", SpeakingRules.sentence(note(f, 4, 9, 4), "Spanish"))
    }

    @Test fun `english fallback names the language when it never happened`() {
        val e = SpeakingKind.ENGLISH_FALLBACK
        assertEquals("You stayed in Spanish the whole time.", SpeakingRules.sentence(note(e, 0, 9, 2), "Spanish"))
        assertEquals("You switched to English once.", SpeakingRules.sentence(note(e, 1, 9, null), "French"))
        assertEquals("You switched to English twice, down from 3 last time.", SpeakingRules.sentence(note(e, 2, 9, 3), "French"))
        assertEquals("You switched to English twice, the same as last time.", SpeakingRules.sentence(note(e, 2, 9, 2), "French"))
        assertEquals("You switched to English 3 times, up from 1 last time.", SpeakingRules.sentence(note(e, 3, 9, 1), "French"))
    }

    @Test fun `key phrases sentence`() {
        assertEquals("You used 3 of your 8 key phrases, up from 2 last time.", SpeakingRules.sentence(note(SpeakingKind.KEY_PHRASES, 3, 8, 2), "Spanish"))
    }

    @Test fun `no sentence shows a score, a percentage or a grade`() {
        val all = RehearsalSpeaking.parse(case("full"))!!.notes.map { SpeakingRules.sentence(it, "Spanish") }
        all.forEach { assertTrue(!it.contains('%') && !Regex("(?i)score|grade").containsMatchIn(it), it) }
    }

    @Test fun `the arrow follows the number and lower is better only for english`() {
        val f = SpeakingKind.FULL_REPLIES
        val e = SpeakingKind.ENGLISH_FALLBACK
        assertEquals(SpeakingTrend(Direction.UP, true), SpeakingRules.trend(note(f, 7, 9, 4)))
        assertEquals(SpeakingTrend(Direction.DOWN, false), SpeakingRules.trend(note(f, 3, 9, 4)))
        assertEquals(SpeakingTrend(Direction.SAME, false), SpeakingRules.trend(note(f, 4, 9, 4)))
        assertEquals(SpeakingTrend(Direction.NONE, false), SpeakingRules.trend(note(f, 4, 9, null)))
        assertEquals(SpeakingTrend(Direction.DOWN, true), SpeakingRules.trend(note(e, 1, 9, 3)))
        assertEquals(SpeakingTrend(Direction.UP, false), SpeakingRules.trend(note(e, 3, 9, 1)))
        assertEquals(SpeakingTrend(Direction.DOWN, true), SpeakingRules.trend(note(e, 0, 9, 2)))
    }

    @Test fun `language names`() {
        assertEquals("Spanish", SpeakingRules.languageName("es"))
        assertEquals("French", SpeakingRules.languageName("fr"))
        assertEquals("English", SpeakingRules.languageName("en"))
    }
}
