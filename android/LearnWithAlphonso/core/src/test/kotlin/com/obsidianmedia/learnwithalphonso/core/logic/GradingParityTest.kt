package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.GoalVariant
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
 * is a byte-for-byte copy, guarded by src/lib/grading-parity.test.ts and by the test below. `runtimes` says where a
 * case applies; every runtime it applies to must produce `expected`.
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

    /** A fixture case's `variants` as the goal variants a bundle would carry (one goal each, in order). */
    private fun goalVariants(c: JsonObject): Map<String, GoalVariant>? =
        c["variants"]?.jsonArray?.mapIndexed { i, v ->
            val o = v.jsonObject
            "g$i" to GoalVariant(
                prompt = "v",
                choices = o["choices"]?.let { o.strList("choices") },
                answerIndex = o["answerIndex"]?.jsonPrimitive?.int,
                answerText = o["answer"]?.let { o.str("answer") },
                bank = o["bank"]?.let { o.strList("bank") },
                acceptableAnswers = o["acceptable"]?.let { o.strList("acceptable") },
                explanation = "e",
            )
        }?.toMap()

    private fun question(c: JsonObject): Question {
        val gv = goalVariants(c)
        return when (val kind = c.str("kind")) {
            "mc" -> Question.MultipleChoice(
                "q", "p", c.strList("choices"), c["answerIndex"]!!.jsonPrimitive.int, "e", goalVariants = gv,
            )
            "fill" -> Question.FillInBlank("q", "p", listOf(c.str("answer")), c.str("answer"), "e", goalVariants = gv)
            "reorder" -> Question.Reorder("q", "p", emptyList(), c.str("answer"), "e")
            "listening" -> Question.Listening("q", "p", "a", emptyList(), c.str("answer"), "e", gv)
            "speak" -> Question.Speak("q", "p", c.str("answer"), "e", gv)
            "translate" -> Question.Translate("q", "p", c.strList("acceptable"), "e", gv)
            else -> error("unknown kind $kind")
        }
    }

    private fun applies(c: JsonObject): Boolean =
        c["runtimes"]?.jsonArray?.map { it.jsonPrimitive.content }?.contains(runtime) ?: true

    @Test
    fun `every applicable case grades as the fixture says`() {
        val ids = cases.map { it.jsonObject.str("id") }
        assertEquals(ids.size, ids.toSet().size, "case ids must be unique")
        val applicable = cases.map { it.jsonObject }.filter(::applies)
        val excluded = cases.map { it.jsonObject }.count { it["runtimes"] != null && !applies(it) }
        assertEquals(cases.size - excluded, applicable.size)
        assertTrue(applicable.isNotEmpty())
        val failures = mutableListOf<String>()
        var ran = 0
        for (c in applicable) {
            val got = isAnswerCorrect(question(c), c.str("input"), course(c))
            val want = c["expected"]!!.jsonPrimitive.boolean
            if (got != want) failures += "${c.str("id")}: got $got, fixture says $want"
            ran++
        }
        assertEquals(applicable.size, ran)
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }

    @Test
    fun `the Android copy is byte for byte the shared file`() {
        // Gradle runs JVM tests from the module directory: core/ -> android/LearnWithAlphonso -> android -> repo root.
        val source = java.io.File("../../../tests/fixtures/grading-parity.json")
        assertTrue(source.exists(), "shared fixture not found at ${source.absolutePath}")
        val copy = javaClass.getResource("/grading-parity.json")!!.readBytes()
        assertTrue(copy.contentEquals(source.readBytes()), "core/src/test/resources/grading-parity.json differs from tests/fixtures/grading-parity.json")
    }
}
