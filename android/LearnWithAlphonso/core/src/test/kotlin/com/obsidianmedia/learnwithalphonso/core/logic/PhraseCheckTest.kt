package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.SttWord
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The Android leg of the shared phrase-check fixture set (tests/fixtures/phrase-check-cases.json; the copy in
 * core/src/test/resources is guarded byte for byte below). Every case must give exactly its `want`.
 */
class PhraseCheckTest {
    private val cases: JsonArray =
        Json.parseToJsonElement(javaClass.getResource("/phrase-check-cases.json")!!.readText()).jsonArray

    private fun words(c: JsonObject): List<SttWord>? =
        (c["words"] as? JsonArray)?.mapNotNull { e ->
            val o = e.jsonObject
            val conf = o["confidence"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            SttWord(o["word"]!!.jsonPrimitive.content, conf)
        }

    @Test
    fun `every shared fixture case gives its expected result and listen-again words`() {
        assertEquals(57, cases.size)
        val failures = ArrayList<String>()
        for (case in cases) {
            val c = case.jsonObject
            val expected = c["expected"]!!.jsonPrimitive.content
            val heard = c["heard"]!!.jsonPrimitive.content
            val want = c["want"]!!.jsonObject
            val wantResult = when (want["result"]!!.jsonPrimitive.content) {
                "clear" -> PhraseCheck.Result.CLEAR
                "mostly" -> PhraseCheck.Result.MOSTLY
                else -> PhraseCheck.Result.NOT_YET
            }
            val wantAgain = want["listenAgain"]!!.jsonArray.map { it.jsonPrimitive.content }
            val got = PhraseCheck.check(expected, heard, words(c))
            if (got.result != wantResult || got.listenAgain != wantAgain) {
                failures += "'$expected' heard '$heard': want $wantResult $wantAgain, got ${got.result} ${got.listenAgain}"
            }
        }
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }

    @Test
    fun `the Android copy is byte for byte the shared file`() {
        // Gradle runs JVM tests from the module directory: core/ -> android/LearnWithAlphonso -> android -> repo root.
        val source = java.io.File("../../../tests/fixtures/phrase-check-cases.json")
        assertTrue(source.exists(), "shared fixture not found at ${source.absolutePath}")
        val copy = javaClass.getResource("/phrase-check-cases.json")!!.readBytes()
        assertTrue(copy.contentEquals(source.readBytes()), "the core copy differs from tests/fixtures/phrase-check-cases.json")
    }

    @Test
    fun `non-finite confidences are skipped and exactly 0_7 is fine`() {
        val ok = PhraseCheck.check("good morning", "good morning", listOf(SttWord("good", 0.7), SttWord("morning", Double.NaN)))
        assertEquals(PhraseCheck.Result.CLEAR, ok.result)
        val low = PhraseCheck.check("good morning please", "good morning please", listOf(SttWord("morning", 0.69)))
        assertEquals(PhraseCheck.Result.MOSTLY, low.result)
        assertEquals(listOf("morning"), low.listenAgain)
    }

    @Test
    fun `no recogniser words degrades to a text match`() {
        assertEquals(PhraseCheck.Result.CLEAR, PhraseCheck.check("Nice to meet you", "nice to meet you", null).result)
        assertEquals(PhraseCheck.Result.NOT_YET, PhraseCheck.check("Nice to meet you", "", null).result)
    }
}
