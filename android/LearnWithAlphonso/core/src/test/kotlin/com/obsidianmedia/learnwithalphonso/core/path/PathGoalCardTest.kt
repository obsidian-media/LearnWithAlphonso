package com.obsidianmedia.learnwithalphonso.core.path

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The goal card on MY PATH, pinned with the same learners as the web test (src/lib/path-goal-card.test.ts). */
class PathGoalCardTest {
    private val fixtures: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-path.fixtures.json")!!.readText()).jsonObject

    private fun path(key: String): LearningPath {
        val envelope = buildJsonObject { put("path", fixtures.getValue(key)) }
        return LearningPathDecoding.path(envelope.toString())!!
    }

    @Test fun `the behind learner shows target, lessons a week and status`() {
        val card = PathGoalCard.lines(path("behind"))
        assertTrue(card.hasGoal)
        assertEquals("My goal", card.kicker)
        assertEquals("A2 by 1 Jun 2027", card.headline)
        assertEquals("9 lessons a week · A bit behind", card.detail)
    }

    @Test fun `the on-track and trimmed learners`() {
        assertEquals("A2 by 1 Jun 2028", PathGoalCard.lines(path("onTrack")).headline)
        assertEquals("4 lessons a week · Ahead of plan", PathGoalCard.lines(path("onTrack")).detail)
        assertEquals("53 lessons a week · A bit behind", PathGoalCard.lines(path("behindTrimmed")).detail)
    }

    @Test fun `no path is an invitation to set a goal`() {
        val card = PathGoalCard.lines(null)
        assertFalse(card.hasGoal)
        assertEquals("Set a goal", card.headline)
        assertEquals("Pick a level and a date and we work out the lessons a week.", card.detail)
    }
}
