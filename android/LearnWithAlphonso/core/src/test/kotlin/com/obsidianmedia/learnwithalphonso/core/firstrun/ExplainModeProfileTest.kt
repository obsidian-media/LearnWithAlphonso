package com.obsidianmedia.learnwithalphonso.core.firstrun

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ExplainModeProfileTest {
    private fun parse(json: String) = LearnerProfile.parse(Json.parseToJsonElement(json))

    @Test
    fun `each saved explain mode is read back`() {
        assertEquals("tap", parse("""{"explainMode":"tap"}""").answers.explainMode)
        assertEquals("always", parse("""{"explainMode":"always"}""").answers.explainMode)
        assertEquals("off", parse("""{"explainMode":"off"}""").answers.explainMode)
    }

    @Test
    fun `an unknown or wrongly typed explain mode is dropped and the rest is kept`() {
        val p = parse("""{"explainMode":"maybe","goal":"travel"}""")
        assertNull(p.answers.explainMode)
        assertEquals("travel", p.answers.goal)
        assertNull(parse("""{"explainMode":7}""").answers.explainMode)
        assertNull(parse("""{}""").answers.explainMode)
    }

    @Test
    fun `the patch carries explainMode only when it is set`() {
        val patch = LearnerAnswers(explainMode = "off").jsonPatch()
        assertEquals(setOf("explainMode"), patch.keys)
        assertEquals("off", patch["explainMode"]!!.jsonPrimitive.content)
        assertFalse("explainMode" in LearnerAnswers(goal = "fun").jsonPatch().keys)
    }

    @Test
    fun `the native language and the mode travel together`() {
        val patch = LearnerAnswers(nativeLanguage = "fa", explainMode = "always").jsonPatch()
        assertEquals(setOf("nativeLanguage", "explainMode"), patch.keys)
    }

    @Test
    fun `a saved explain mode survives the draft's own encode and decode`() {
        val back = LearnerAnswers.decode(LearnerAnswers.encode(LearnerAnswers(explainMode = "always")))!!
        assertEquals("always", back.explainMode)
    }
}
