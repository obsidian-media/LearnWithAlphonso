package com.obsidianmedia.learnwithalphonso.core.goal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Decodes the SAME fixtures the web and iOS tests pin (core/src/test/resources/learning-goal.fixtures.json is a
 * byte-for-byte copy, guarded by src/lib/learning-goal-ios-fixtures.test.ts), so a server-side rename or retype
 * fails here too.
 */
class LearningGoalTest {
    private val root: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-goal.fixtures.json")!!.readText()).jsonObject
    private fun plan(key: String): JsonObject = root["plans"]!!.jsonObject[key]!!.jsonObject
    private fun envelope(key: String): JsonObject = root["envelopes"]!!.jsonObject[key]!!.jsonObject
    private fun preview(plan: JsonElement) = buildJsonObject { put("plan", plan) }.toString()

    private fun unavailable(block: () -> Unit) {
        assertThrows(LearningGoalError.Unavailable::class.java) { block() }
    }

    @Test
    fun `every checked-in plan decodes`() {
        for ((name, sample) in root["plans"]!!.jsonObject) {
            assertNotNull(LearningGoalDecoding.plan(preview(sample)), name)
        }
    }

    @Test
    fun `status and realism raw values map to the enums`() {
        fun decode(key: String) = LearningGoalDecoding.plan(preview(plan(key)))
        assertEquals(GoalStatus.DONE, decode("done").status)
        assertEquals(GoalStatus.JUST_STARTED, decode("just_started").status)
        assertEquals(GoalStatus.ON_TRACK, decode("on_track").status)
        assertEquals(GoalStatus.AHEAD, decode("ahead").status)
        assertEquals(GoalStatus.BEHIND, decode("behind_with_suggestion").status)
        assertEquals(GoalStatus.EXPIRED, decode("expired").status)
        assertEquals(GoalRealism.UNREALISTIC, decode("unrealistic").realism)
        assertEquals(GoalRealism.AMBITIOUS, decode("just_started").realism)
        assertEquals(GoalRealism.OK, decode("on_track").realism)
    }

    @Test
    fun `every field of a plan lands in the right property`() {
        // Distinct values everywhere, so swapped or mis-keyed fields cannot cancel out.
        val raw = """{"plan":{"currentLevel":"A2","targetLevel":"C1","targetDate":"2027-05-17","lessonsInScope":111,
            "lessonsRemaining":22,"lessonsDoneLast7Days":3,"requiredPerWeek":44,"status":"behind","realism":"ambitious",
            "suggestedDate":"2027-08-09","asOf":"2026-10-06T12:34:56.789Z"}}"""
        assertEquals(
            GoalPlan(
                "A2", "C1", "2027-05-17", 111, 22, 3, 44, GoalStatus.BEHIND, GoalRealism.AMBITIOUS,
                "2027-08-09", "2026-10-06T12:34:56.789Z",
            ),
            LearningGoalDecoding.plan(raw),
        )
    }

    @Test
    fun `a null suggested date and a missing one are both null`() {
        assertNull(LearningGoalDecoding.plan(preview(plan("on_track"))).suggestedDate)
        val missing = JsonObject(plan("on_track").filterKeys { it != "suggestedDate" })
        assertNull(LearningGoalDecoding.plan(preview(missing)).suggestedDate)
        assertEquals("2026-11-10", LearningGoalDecoding.plan(preview(plan("behind_with_suggestion"))).suggestedDate)
    }

    @Test
    fun `every envelope decodes including a goal whose plan is null and no goal at all`() {
        val stored = LearningGoalDecoding.state(envelope("stored").toString())
        assertEquals("B1", stored.goal!!.targetLevel)
        assertNotNull(stored.plan)

        val planNull = LearningGoalDecoding.state(envelope("stored_plan_null").toString())
        assertNotNull(planNull.goal)
        assertNull(planNull.plan)

        val none = LearningGoalDecoding.state(envelope("none").toString())
        assertNull(none.goal)
        assertNull(none.plan)

        assertNotNull(LearningGoalDecoding.plan(envelope("preview").toString()))
    }

    @Test
    fun `an unknown status or realism decodes to UNKNOWN instead of failing`() {
        val changed = JsonObject(plan("on_track") + mapOf(
            "status" to kotlinx.serialization.json.JsonPrimitive("paused_by_a_future_server"),
            "realism" to kotlinx.serialization.json.JsonPrimitive("heroic"),
        ))
        val decoded = LearningGoalDecoding.plan(preview(changed))
        assertEquals(GoalStatus.UNKNOWN, decoded.status)
        assertEquals(GoalRealism.UNKNOWN, decoded.realism)
    }

    @Test
    fun `a missing or mistyped required field is unavailable`() {
        val good = plan("on_track")
        unavailable { LearningGoalDecoding.plan(preview(JsonObject(good.filterKeys { it != "requiredPerWeek" }))) }
        unavailable { LearningGoalDecoding.plan(preview(JsonObject(good.filterKeys { it != "status" }))) }
        unavailable {
            LearningGoalDecoding.plan(preview(JsonObject(good + ("lessonsRemaining" to kotlinx.serialization.json.JsonPrimitive("twenty")))))
        }
        unavailable {
            LearningGoalDecoding.plan(preview(JsonObject(good + ("lessonsRemaining" to kotlinx.serialization.json.JsonPrimitive(2.5)))))
        }
        // A number written as a string is a mistyped field, even when it looks numeric.
        unavailable {
            LearningGoalDecoding.plan(preview(JsonObject(good + ("lessonsRemaining" to kotlinx.serialization.json.JsonPrimitive("20")))))
        }
    }

    @Test
    fun `a plan that is not an object or a body that is not JSON is unavailable`() {
        unavailable { LearningGoalDecoding.state("""{"goal":null,"plan":"oops"}""") }
        unavailable { LearningGoalDecoding.plan("""{"nope":1}""") }
        unavailable { LearningGoalDecoding.state("<html>") }
        unavailable { LearningGoalDecoding.state("[]") }
        // Truly malformed JSON (the parser throws), not just a body of the wrong kind.
        unavailable { LearningGoalDecoding.state("""{"goal": """) }
        unavailable { LearningGoalDecoding.plan("""{"plan": {""") }
    }

    @Test
    fun `a goal missing a field is unavailable but any createdAt string decodes`() {
        val stored = envelope("stored")
        val goal = stored["goal"]!!.jsonObject
        val micro = JsonObject(goal + ("createdAt" to kotlinx.serialization.json.JsonPrimitive("2026-09-06T12:00:00.123456+00:00")))
        val ok = LearningGoalDecoding.state(JsonObject(stored + ("goal" to micro)).toString())
        assertEquals("2026-09-06T12:00:00.123456+00:00", ok.goal!!.createdAt)

        val noDate = JsonObject(goal.filterKeys { it != "targetDate" })
        unavailable { LearningGoalDecoding.state(JsonObject(stored + ("goal" to noDate)).toString()) }
    }

    @Test
    fun `user messages match the web card`() {
        assertEquals("That goal can't be saved. Check the level and date.", LearningGoalError.Invalid(null).userMessage)
        assertEquals("That level is below yours", LearningGoalError.Invalid("That level is below yours").userMessage)
        assertEquals("Sign in again to use goals.", LearningGoalError.NotSignedIn.userMessage)
        assertEquals("Couldn't load your goal. Try again.", LearningGoalError.Unavailable.userMessage)
        assertEquals("You're offline. Showing your last saved plan.", LearningGoalError.Offline.userMessage)
        assertTrue(LearningGoalError.Offline is Exception)
    }
}
