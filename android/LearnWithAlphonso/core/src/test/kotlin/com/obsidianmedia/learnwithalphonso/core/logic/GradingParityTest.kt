package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The Android leg of the shared answer-grading fixture set. The web (src/lib/grading-parity.test.ts), the Deno edge
 * copy, the iOS Kit and this test all read tests/fixtures/grading-parity.json; core/src/test/resources/grading-parity.json
 * is a byte-for-byte copy guarded by src/lib/grading-parity.test.ts. `runtimes` says where a case applies; `divergent`
 * records what this runtime does TODAY where it disagrees with `expected` -- it is asserted, so a fix turns the case
 * red until the marker is removed.
 */
class GradingParityTest {
    private val runtime = "android"
    private val cases: JsonArray =
        Json.parseToJsonElement(javaClass.getResource("/grading-parity.json")!!.readText()).jsonObject["cases"]!!.jsonArray

    private fun JsonObject.str(key: String): String = this[key]!!.jsonPrimitive.content
    private fun JsonObject.strList(key: String): List<String> = this[key]!!.jsonArray.map { it.jsonPrimitive.content }

    private fun course(c: JsonObject): Course = when (c["course"]?.jsonPrimitive?.content ?: "en") {
        "fr" -> Course.FRENCH
        "es" -> Course.SPANISH
        else -> Course.ENGLISH
    }

    private fun question(c: JsonObject): Question = when (val kind = c.str("kind")) {
        "mc" -> Question.MultipleChoice("q", "p", c.strList("choices"), c["answerIndex"]!!.jsonPrimitive.int, "e")
        "fill" -> Question.FillInBlank("q", "p", emptyList(), c.str("answer"), "e")
        "reorder" -> Question.Reorder("q", "p", emptyList(), c.str("answer"), "e")
        "listening" -> Question.Listening("q", "p", "a", emptyList(), c.str("answer"), "e")
        "speak" -> Question.Speak("q", "p", c.str("answer"), "e")
        "translate" -> Question.Translate("q", "p", c.strList("acceptable"), "e")
        else -> error("unknown kind $kind")
    }

    private fun applies(c: JsonObject): Boolean =
        c["runtimes"]?.jsonArray?.map { it.jsonPrimitive.content }?.contains(runtime) ?: true

    @Test
    fun `every applicable case grades as the fixture says`() {
        val ids = cases.map { it.jsonObject.str("id") }
        assertEquals(ids.size, ids.toSet().size, "case ids must be unique")
        val applicable = cases.map { it.jsonObject }.filter(::applies)
        assertTrue(applicable.size > 150, "expected the whole shared set, got ${applicable.size}")
        val failures = mutableListOf<String>()
        for (c in applicable) {
            val got = isAnswerCorrect(question(c), c.str("input"), course(c))
            val want = c["divergent"]?.jsonObject?.get(runtime)?.jsonPrimitive?.boolean ?: c["expected"]!!.jsonPrimitive.boolean
            if (got != want) failures += "${c.str("id")}: got $got, fixture says $want"
        }
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }
}
