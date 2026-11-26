package com.obsidianmedia.learnwithalphonso.core.content

import com.obsidianmedia.learnwithalphonso.core.logic.isAnswerCorrect
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Goal-flavoured question variants (src/lib/goal-variants.test.ts is the web twin of these). */
class GoalVariantTest {
    private val json = """
        [
          {"id":"q1","type":"mc","prompt":"We eat ___ seven o'clock.","choices":["at","in","on","for"],"answer":0,
           "explanation":"We say \"at\".","term":"at",
           "goalVariants":{"travel":{"prompt":"The train leaves ___ seven o'clock.","choices":["in","at","on","for"],
             "answer":1,"explanation":"We say \"at\"."}}},
          {"id":"t1","type":"translate","prompt":"Ask where the bank is.","acceptableAnswers":["Where is the bank?"],
           "explanation":"e",
           "goalVariants":{"travel":{"prompt":"Ask where the station is.",
             "acceptableAnswers":["Where is the station?"],"explanation":"e"}}},
          {"id":"q9","type":"mc","prompt":"p","choices":["a","b"],"answer":0,"explanation":"e"}
        ]
    """.trimIndent()

    private val questions: List<Question> =
        ContentJson.json.decodeFromString(
            kotlinx.serialization.builtins.ListSerializer(QuestionSerializer),
            json,
        )

    @Test
    fun `a question without variants decodes as before`() {
        val q = questions[2]
        assertNull(q.goalVariants)
        assertFalse(q.hasVariantForGoal("travel"))
    }

    @Test
    fun `resolveForGoal shows the variant and keeps the id and shape`() {
        val q = questions[0]
        assertTrue(q.hasVariantForGoal("travel"))
        val shown = q.resolveForGoal("travel") as Question.MultipleChoice
        assertEquals("q1", shown.id)
        assertEquals("The train leaves ___ seven o'clock.", shown.prompt)
        assertEquals("at", shown.choices[shown.answer])
        // Same answer text, so the authored vocab card still describes it.
        assertEquals("at", shown.term)
    }

    @Test
    fun `a goal without a variant shows the base question`() {
        val q = questions[0]
        assertEquals(q, q.resolveForGoal("work"))
        assertEquals(q, q.resolveForGoal(null))
    }

    @Test
    fun `grading accepts the shown version and the base only`() {
        val t = questions[1]
        assertTrue(isAnswerCorrect(t, "Where is the station?", variantGoal = "travel"))
        assertTrue(isAnswerCorrect(t, "Where is the bank?", variantGoal = "travel"))
        assertFalse(isAnswerCorrect(t, "Where is the airport?", variantGoal = "travel"))
        // Another goal, no goal (an older build) and a goal without a version are all the base.
        assertFalse(isAnswerCorrect(t, "Where is the station?", variantGoal = "work"))
        assertFalse(isAnswerCorrect(t, "Where is the station?"))
        assertTrue(isAnswerCorrect(t, "Where is the bank?"))
        // What the player shows is graded by what it shows.
        assertTrue(isAnswerCorrect(t.resolveForGoal("travel"), "Where is the station?"))
    }

    @Test
    fun `a queued answer keeps its goal and an old row decodes as the base`() {
        val stored = VariantGoalTag.encode("I take a taxi.", "travel")
        assertEquals("I take a taxi." to "travel", VariantGoalTag.decode(stored))
        assertEquals("plain", VariantGoalTag.encode("plain", null))
        assertEquals("plain" to null, VariantGoalTag.decode("plain"))
        assertEquals("" to "work", VariantGoalTag.decode(VariantGoalTag.encode("", "work")))
    }
}
