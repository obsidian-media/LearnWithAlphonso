package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ExplainRulesTest {
    // ---- direction

    @Test
    fun `the five right to left scripts are rtl and every other language is ltr`() {
        for (code in listOf("ar", "fa", "he", "ur", "ps")) assertEquals(ExplainDirection.RTL, ExplainRules.languageDirection(code), code)
        // Kurdish stays left to right (Latin-script Kurmanji), like the web.
        for (code in listOf("en", "es", "fr", "ku", "zh", "hi", "tr", "ru", "sw")) assertEquals(ExplainDirection.LTR, ExplainRules.languageDirection(code), code)
    }

    // ---- mode

    @Test
    fun `nothing saved means tap to explain`() {
        assertEquals(ExplainMode.TAP, ExplainMode.parse(null))
        assertEquals(ExplainMode.TAP, ExplainMode.DEFAULT)
        assertEquals(ExplainMode.TAP, ExplainMode.parse("surprise"))
        assertEquals(ExplainMode.TAP, ExplainMode.parse(""))
    }

    @Test
    fun `the three saved modes round trip through their wire names`() {
        assertEquals(listOf("tap", "always", "off"), ExplainMode.entries.map { it.wire })
        assertEquals(ExplainMode.ALWAYS, ExplainMode.parse("always"))
        assertEquals(ExplainMode.OFF, ExplainMode.parse("off"))
        assertEquals(ExplainMode.TAP, ExplainMode.parse("tap"))
    }

    // ---- offer gating

    @Test
    fun `tap mode with a different native language offers the chip`() {
        assertEquals(ExplainOffer.CHIP, ExplainRules.offer(ExplainMode.TAP, "fa", "en"))
    }

    @Test
    fun `always mode with a different native language explains straight away`() {
        assertEquals(ExplainOffer.AUTO, ExplainRules.offer(ExplainMode.ALWAYS, "ar", "es"))
    }

    @Test
    fun `target language only hides everything even with a native language set`() {
        assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(ExplainMode.OFF, "fa", "en"))
    }

    @Test
    fun `a missing native language hides everything in every mode`() {
        for (mode in ExplainMode.entries) {
            assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(mode, null, "en"), "null $mode")
            assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(mode, "", "en"), "empty $mode")
        }
    }

    @Test
    fun `a native language equal to the course hides everything in every mode`() {
        for (mode in ExplainMode.entries) {
            assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(mode, "en", "en"), "en $mode")
            assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(mode, "fr", "fr"), "fr $mode")
            assertEquals(ExplainOffer.HIDDEN, ExplainRules.offer(mode, "es", "es"), "es $mode")
        }
    }

    // ---- names and limits

    @Test
    fun `language names are the English names`() {
        assertEquals("Persian", ExplainRules.languageName("fa"))
        assertEquals("Arabic", ExplainRules.languageName("ar"))
        assertEquals("Spanish", ExplainRules.languageName("es"))
    }

    @Test
    fun `the daily limit is forty like the server`() {
        assertEquals(40, ExplainRules.DAILY_LIMIT)
    }

    // ---- request builders

    private fun body(r: ExplainRequest) = Json.parseToJsonElement(r.toJson().toString()).jsonObject

    @Test
    fun `a wrong answer request carries the three texts and no language`() {
        val r = ExplainRules.wrongAnswer("Pick the verb", "run", "runs", "en")!!
        val o = body(r)
        assertEquals(setOf("kind", "course", "question", "wrongAnswer", "correctAnswer"), o.keys)
        assertEquals("wrong-answer", o["kind"]!!.jsonPrimitive.content)
        assertEquals("en", o["course"]!!.jsonPrimitive.content)
        assertEquals("run", o["wrongAnswer"]!!.jsonPrimitive.content)
        assertEquals("runs", o["correctAnswer"]!!.jsonPrimitive.content)
    }

    @Test
    fun `wrong answer texts are trimmed and cut to 400 code points`() {
        val long = "a".repeat(450)
        val o = body(ExplainRules.wrongAnswer("  $long  ", " x ", long, "fr")!!)
        assertEquals(400, o["question"]!!.jsonPrimitive.content.length)
        assertEquals("x", o["wrongAnswer"]!!.jsonPrimitive.content)
        assertEquals(400, o["correctAnswer"]!!.jsonPrimitive.content.length)
    }

    @Test
    fun `a cut never splits an emoji`() {
        val emoji = "😀" // one code point, two chars
        val o = body(ExplainRules.wrongAnswer("q", "w", emoji.repeat(401), "en")!!)
        val cut = o["correctAnswer"]!!.jsonPrimitive.content
        assertEquals(400, cut.codePointCount(0, cut.length))
        assertEquals(800, cut.length)
    }

    @Test
    fun `a wrong answer with an empty part is not sent`() {
        assertNull(ExplainRules.wrongAnswer("q", "   ", "c", "en"))
        assertNull(ExplainRules.wrongAnswer("q", "w", "", "en"))
        assertNull(ExplainRules.wrongAnswer("", "w", "c", "en"))
    }

    @Test
    fun `a course the server does not know is not sent`() {
        assertNull(ExplainRules.wrongAnswer("q", "w", "c", "de"))
        assertNull(ExplainRules.word("hola", "hola amigo", "de"))
        assertNull(ExplainRules.message("hola", "de"))
    }

    @Test
    fun `a word request cuts the word at 80 and the sentence at 400, and omits an empty sentence`() {
        val o = body(ExplainRules.word("w".repeat(100), "s".repeat(500), "es")!!)
        assertEquals(setOf("kind", "course", "word", "sentence"), o.keys)
        assertEquals("word", o["kind"]!!.jsonPrimitive.content)
        assertEquals(80, o["word"]!!.jsonPrimitive.content.length)
        assertEquals(400, o["sentence"]!!.jsonPrimitive.content.length)
        val bare = body(ExplainRules.word("hola", "   ", "es")!!)
        assertEquals(setOf("kind", "course", "word"), bare.keys)
        assertNull(ExplainRules.word("   ", "x", "es"))
    }

    @Test
    fun `a message request cuts the text at 1000`() {
        val o = body(ExplainRules.message("m".repeat(1200), "fr")!!)
        assertEquals(setOf("kind", "course", "text"), o.keys)
        assertEquals("message", o["kind"]!!.jsonPrimitive.content)
        assertEquals(1000, o["text"]!!.jsonPrimitive.content.length)
        assertNull(ExplainRules.message("  ", "fr"))
    }

    @Test
    fun `hector requests carry surface hector and the others carry none`() {
        assertEquals("hector", body(ExplainRules.message("hola", "es", hector = true)!!)["surface"]!!.jsonPrimitive.content)
        assertFalse("surface" in body(ExplainRules.message("hola", "es")!!).keys)
        assertEquals("hector", body(ExplainRules.word("hola", null, "es", hector = true)!!)["surface"]!!.jsonPrimitive.content)
    }

    // ---- direction runs

    @Test
    fun `runs join back to exactly the input`() {
        val samples = listOf(
            "",
            "plain persian text only",
            "جمله \"I live here.\" درست است",
            "از \"She goes\" استفاده کن، نه \"She go\".",
            "English first then عربى then more English words.",
            "عربى 123 and it's OK",
        )
        for (s in samples) assertEquals(s, ExplainRules.splitDirectionRuns(s).joinToString("") { it.text }, s)
    }

    @Test
    fun `a quoted latin phrase becomes its own left to right run`() {
        val runs = ExplainRules.splitDirectionRuns("از «I live here.» استفاده کن")
        assertEquals(listOf(false, true, false), runs.map { it.ltr })
        assertEquals("I live here.", runs[1].text)
    }

    @Test
    fun `text with no latin is a single right to left run`() {
        val runs = ExplainRules.splitDirectionRuns("این یک جمله است")
        assertEquals(1, runs.size)
        assertFalse(runs[0].ltr)
    }

    @Test
    fun `accented latin stays in one run`() {
        val runs = ExplainRules.splitDirectionRuns("بگو estás aquí بعد")
        assertTrue(runs.any { it.ltr && it.text == "estás aquí" })
    }
}
