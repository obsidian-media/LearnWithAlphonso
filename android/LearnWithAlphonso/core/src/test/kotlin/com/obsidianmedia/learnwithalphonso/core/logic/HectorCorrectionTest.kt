package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Replays shared/hector-corrections.json, which the TypeScript and Swift tests replay too. */
class HectorCorrectionTest {
    private val root = run {
        // Gradle runs a module's tests with the module directory as the working directory.
        val file = File("../../../shared/hector-corrections.json").takeIf { it.exists() } ?: File("shared/hector-corrections.json")
        Json.parseToJsonElement(file.readText()).jsonObject
    }

    @Test
    fun `extract matches the shared fixtures`() {
        val cases = root.getValue("extract").jsonArray
        assertTrue(cases.size >= 20)
        for (c in cases) {
            val o = c.jsonObject
            val name = o.getValue("name").jsonPrimitive.content
            val got = HectorCorrections.extract(o.getValue("raw").jsonPrimitive.content)
            assertEquals(o.getValue("text").jsonPrimitive.content, got.text, name)
            val want = o.getValue("correction")
            if (want is JsonNull) {
                assertNull(got.correction, name)
            } else {
                val w = want.jsonObject
                assertEquals(HectorCorrection(w.getValue("slip").jsonPrimitive.content, w.getValue("fix").jsonPrimitive.content, w["note"]?.jsonPrimitive?.content), got.correction, name)
            }
        }
    }

    @Test
    fun `streaming never shows a half tag at any chunk boundary`() {
        val streams = root.getValue("streams").jsonArray
        assertTrue(streams.size >= 5)
        for (s in streams) {
            val o = s.jsonObject
            val name = o.getValue("name").jsonPrimitive.content
            var acc = ""
            val seen = o.getValue("chunks").jsonArray.map { chunk -> acc += chunk.jsonPrimitive.content; HectorCorrections.visibleWhileStreaming(acc) }
            assertEquals(o.getValue("visible").jsonArray.map { it.jsonPrimitive.content }, seen, name)
            assertEquals(o.getValue("final").jsonPrimitive.content, HectorCorrections.extract(acc).text, name)
        }
        // Every possible prefix of every reply: no tag fragment is ever visible.
        for (c in root.getValue("extract").jsonArray) {
            val raw = c.jsonObject.getValue("raw").jsonPrimitive.content
            if (raw.contains("<correctional")) continue
            for (i in 0..raw.length) {
                val visible = HectorCorrections.visibleWhileStreaming(raw.substring(0, i)).lowercase()
                assertFalse(visible.contains("<correction"), raw)
                assertFalse(visible.contains("</correction"), raw)
            }
        }
    }

    @Test
    fun `a learner's text is never parsed`() {
        val learner = root.getValue("learner").jsonArray
        assertTrue(learner.isNotEmpty())
        for (l in learner) {
            val o = l.jsonObject
            val text = o.getValue("text").jsonPrimitive.content
            assertEquals(o.getValue("shown").jsonPrimitive.content, HectorCorrections.displayText("user", text))
            assertEquals(text, HectorCorrections.displayText("user", text))
        }
        assertEquals("Hi", HectorCorrections.displayText("assistant", "Hi\n<correction>{\"slip\":\"a\",\"fix\":\"b\"}</correction>"))
    }

    @Test
    fun `the wire field is validated by the same rules`() {
        fun v(s: String) = HectorCorrections.validate(Json.parseToJsonElement(s))
        assertEquals(HectorCorrection("yo soy", "estoy", "estar"), v("""{"slip":"yo soy","fix":"estoy","note":"estar"}"""))
        assertNull(v("""{"slip":"yo soy"}"""))
        assertNull(v(""""nope""""))
        assertNull(v("""{"slip":"a","fix":"A"}"""))
        assertNull(v("""{"slip":"a","fix":"b","note":7}""")?.note)
        assertNull(HectorCorrections.validate(null))
        assertTrue(JsonObject(emptyMap()).isEmpty())
    }
}
