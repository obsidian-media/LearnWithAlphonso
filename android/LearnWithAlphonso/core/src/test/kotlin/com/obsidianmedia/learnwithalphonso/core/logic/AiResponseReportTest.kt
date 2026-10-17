package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Mirrors AIResponseReportTests.swift: same samples, same limits. */
class AiResponseReportTest {
    private fun report(message: String, scenarioId: String? = null, campaignId: String? = null, sceneIndex: Int? = null, course: String = "en") =
        AiResponseReport(message, AiResponseSurface.CONVERSATION, course, AiResponseReportReason.OTHER, scenarioId, campaignId, sceneIndex)

    private fun cp(s: String) = s.codePointCount(0, s.length)

    /** What the database measures: the JSON text of the context, with the spaces jsonb adds after colons and commas. */
    private fun storedContextBytes(r: AiResponseReport): Int {
        val context = r.toRow()["context"]!!.jsonObject
        return context.toString().toByteArray(Charsets.UTF_8).size + context.size * 2
    }

    @Test
    fun `the row is an ai_response with the message in context and no reported user`() {
        val r = AiResponseReport("x".repeat(5000), AiResponseSurface.CONVERSATION, "en", AiResponseReportReason.HARMFUL, scenarioId = "coffee")
        val row = r.toRow()
        assertEquals("ai_response", row["kind"]!!.jsonPrimitive.content)
        assertEquals("ai_harmful", row["reason"]!!.jsonPrimitive.content)
        assertNull(row["reported"])
        val c = row["context"]!!.jsonObject
        assertEquals(AiResponseReport.MAX_MESSAGE_LENGTH, cp(c["message"]!!.jsonPrimitive.content))
        assertEquals("conversation", c["surface"]!!.jsonPrimitive.content)
        assertEquals("en", c["course"]!!.jsonPrimitive.content)
        assertEquals("coffee", c["scenario_id"]!!.jsonPrimitive.content)
        assertEquals("android", c["platform"]!!.jsonPrimitive.content)
        assertNull(c["campaign_id"])
        assertNull(c["scene_index"])
    }

    @Test
    fun `campaign reports carry the campaign and the scene`() {
        val c = report("hi", campaignId = "city-day", sceneIndex = 2).toRow()["context"]!!.jsonObject
        assertEquals("city-day", c["campaign_id"]!!.jsonPrimitive.content)
        assertEquals(2, c["scene_index"]!!.jsonPrimitive.int)
    }

    @Test
    fun `the cap and reason codes are the web's`() {
        assertEquals(2500, AiResponseReport.MAX_MESSAGE_LENGTH)
        assertEquals(8192, AiResponseReport.CONTEXT_BYTE_LIMIT)
        assertEquals(400, AiResponseReport.CONTEXT_STRUCTURE_BYTES)
        assertEquals(listOf("ai_inappropriate", "ai_harmful", "ai_incorrect", "ai_other"), AiResponseReportReason.entries.map { it.code })
        assertEquals(listOf("hector", "conversation", "campaign"), AiResponseSurface.entries.map { it.wire })
    }

    @Test
    fun `the message is cut by code point, never inside an emoji`() {
        val r = report("😀".repeat(2600))
        assertTrue(r.message.codePoints().allMatch { it == 0x1F600 })
        assertTrue(r.message.toByteArray(Charsets.UTF_8).size <= 8192 - AiResponseReport.CONTEXT_STRUCTURE_BYTES)
        assertTrue(cp(r.message) <= AiResponseReport.MAX_MESSAGE_LENGTH)
        // No lone surrogate at the cut: re-encoding round-trips.
        assertEquals(r.message, String(r.message.toByteArray(Charsets.UTF_8), Charsets.UTF_8))
    }

    @Test
    fun `the cap counts code points, not UTF-16 units`() {
        // 1000 emoji (two UTF-16 units each) + 1500 letters = 2500 code points but 3500 units: nothing may be cut.
        val message = "\uD83D\uDE00".repeat(1000) + "x".repeat(1500)
        assertEquals(3500, message.length)
        val kept = report(message).message
        assertEquals(message, kept)
        assertEquals(2500, cp(kept))
        // One more code point goes over the cap and is the only thing dropped.
        assertEquals(message, report(message + "y").message)
    }

    @Test
    fun `an empty or all-NUL message is stored as empty, as on iOS, and the row is still valid`() {
        for (blank in listOf("", "\u0000", "\u0000".repeat(50))) {
            val r = report(blank)
            assertEquals("", r.message)
            assertEquals("", r.toRow()["context"]!!.jsonObject["message"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun `a short message is kept whole`() {
        assertEquals("Bonjour, ca va ?", report("Bonjour, ca va ?", course = "fr").message)
    }

    @Test
    fun `the whole context stays under the database limit for escape heavy text`() {
        val samples = listOf(
            "\"".repeat(2600), "\n".repeat(2600), "\"\n\\".repeat(900), "\u0001".repeat(2600), "😀".repeat(2600),
            "á" + "x".repeat(5000),
        )
        samples.forEachIndexed { i, sample ->
            assertTrue(storedContextBytes(report(sample, scenarioId = "coffee")) <= 8192, "sample $i")
        }
    }

    @Test
    fun `control characters are cut by their encoded size not their raw one`() {
        // Raw, 2500 of them is 2500 bytes and would pass a raw count; encoded it is 15000.
        assertTrue(cp(report("\u0001".repeat(2500)).message) < 1400)
    }

    @Test
    fun `NUL and lone surrogates are removed because jsonb cannot store them`() {
        assertEquals("ab", report("a\u0000b\u0000").message)
        assertEquals("ok", report("\u0000".repeat(100) + "ok").message)
        assertEquals("ab", report("a\uD83Db\uDE00").message)
    }

    @Test
    fun `long identifiers take their share of the budget`() {
        val r = report("😀".repeat(2500), scenarioId = "s".repeat(2000), campaignId = "c".repeat(1000), sceneIndex = 3)
        assertTrue(storedContextBytes(r) <= 8192)
        assertTrue(cp(r.message) > 0)
    }

    @Test
    fun `openers are not reportable, model replies are, even if they repeat an opener's words`() {
        val openers = setOf(0, 4)
        assertFalse(AiReplyReporting.isReportable("assistant", 0, openers))
        assertFalse(AiReplyReporting.isReportable("assistant", 4, openers))
        assertTrue(AiReplyReporting.isReportable("assistant", 1, openers))
        assertTrue(AiReplyReporting.isReportable("assistant", 5, openers))
        assertFalse(AiReplyReporting.isReportable("user", 1, openers))
    }

    @Test
    fun `a turn's scene is the number of openers up to it minus one`() {
        val openers = setOf(0, 4, 8)
        assertEquals(0, AiReplyReporting.sceneIndexOfTurn(0, openers))
        assertEquals(0, AiReplyReporting.sceneIndexOfTurn(3, openers))
        assertEquals(1, AiReplyReporting.sceneIndexOfTurn(5, openers))
        assertEquals(2, AiReplyReporting.sceneIndexOfTurn(9, openers))
        assertEquals(0, AiReplyReporting.sceneIndexOfTurn(2, emptySet()))
    }
}
