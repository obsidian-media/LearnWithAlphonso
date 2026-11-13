package com.obsidianmedia.learnwithalphonso.core.path

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
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
 * Decodes the SAME fixtures the web and iOS tests pin (core/src/test/resources/learning-path.fixtures.json is a
 * byte-for-byte copy, guarded by src/lib/learning-path-native-fixtures.test.ts), so a server-side rename or retype
 * fails here too. The values asserted are the ones src/lib/path-plan.ts produced for these learners.
 */
class LearningPathTest {
    private val fixtures: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-path.fixtures.json")!!.readText()).jsonObject

    private fun path(key: String): LearningPath {
        val envelope = buildJsonObject { put("path", fixtures.getValue(key)) }
        val decoded = LearningPathDecoding.path(envelope.toString())
        assertNotNull(decoded)
        return decoded!!
    }

    @Test fun `every checked-in scenario decodes`() {
        for (key in listOf("onTrack", "behind", "behindTrimmed", "restDayChosen", "noRestDay")) path(key)
    }

    @Test fun `the behind path carries the three ways forward`() {
        val p = path("behind")
        assertEquals("behind", p.status)
        assertEquals("A bit behind", p.statusLine)
        assertEquals(listOf("lessons_first", "move_date", "add_minutes"), p.recovery.map { it.id })
        assertTrue(p.recovery.first().suggested)
        assertNotNull(p.recovery.first().mix)
        assertEquals(15, p.recovery.last().dailyMinutes)
    }

    @Test fun `the trimmed path keeps the switches and the trim date`() {
        val p = path("behindTrimmed")
        assertTrue(p.trimmed)
        assertEquals(listOf("talk"), p.off)
        assertNotNull(p.trimUntil)
        assertEquals(0, p.mix.first { it.kind == PathKind.TALK }.minutes)
    }

    @Test fun `the road ends at the goal flag and has one current stop`() {
        val p = path("onTrack")
        assertEquals("goal", p.road.last().kind)
        assertEquals(1, p.road.count { it.state == "current" })
    }

    @Test fun `the week has seven days with one rest day`() {
        val p = path("onTrack")
        assertEquals(7, p.week.size)
        assertEquals(1, p.week.count { it.state == "rest" })
    }

    @Test fun `the rest day comes from the server three ways`() {
        assertEquals(0, path("onTrack").restDay)
        assertEquals(3, path("restDayChosen").restDay)
        assertEquals(1, path("restDayChosen").week.count { it.state == "rest" })
        val none = path("noRestDay")
        assertEquals(PathRestDay.NONE, none.restDay)
        assertEquals(0, none.week.count { it.state == "rest" })
        assertEquals(70, none.weekMinutes)
    }

    @Test fun `an older server without a rest day means Sunday`() {
        val withoutKey = buildJsonObject { fixtures.getValue("onTrack").jsonObject.forEach { (k, v) -> if (k != "restDay") put(k, v) } }
        val decoded = LearningPathDecoding.path(buildJsonObject { put("path", withoutKey) }.toString())
        assertEquals(PathRestDay.SUNDAY, decoded!!.restDay)
    }

    @Test fun `the rest day choices are the seven weekdays then none`() {
        assertEquals(listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "No rest day"), PathRestDay.CHOICES.map { it.second })
        assertEquals(listOf(0, 1, 2, 3, 4, 5, 6, -1), PathRestDay.CHOICES.map { it.first })
        assertEquals(6, PathRestDay.studyDays(2))
        assertEquals(7, PathRestDay.studyDays(PathRestDay.NONE))
    }

    @Test fun `the mix adds up to the weeks minutes`() {
        val p = path("onTrack")
        assertEquals(p.weekMinutes, p.mix.sumOf { it.minutes })
    }

    @Test fun `every type has a streak tile`() {
        assertEquals(
            listOf(PathKind.LESSON, PathKind.PODCAST, PathKind.TALK, PathKind.CAMPAIGN),
            path("onTrack").streaks.map { it.kind },
        )
    }

    @Test fun `an unknown type from a newer server is drawn generically`() {
        assertEquals(PathKind.UNKNOWN, PathKind.fromWire("video"))
        assertEquals(PathKind.PODCAST, PathKind.fromWire("podcast"))
    }

    @Test fun `no goal decodes as null`() {
        assertNull(LearningPathDecoding.path("""{"path":null}"""))
    }

    @Test fun `a path missing a part is unavailable not half read`() {
        assertThrows(LearningPathError.Unavailable::class.java) { LearningPathDecoding.path("""{"path":{"status":"behind"}}""") }
        assertThrows(LearningPathError.Unavailable::class.java) { LearningPathDecoding.path("not json") }
    }
}
