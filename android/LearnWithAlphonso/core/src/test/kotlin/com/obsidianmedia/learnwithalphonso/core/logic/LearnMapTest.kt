package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue

/**
 * Replays shared/learn-map.json, which src/lib/learn-map.test.ts and the Kit's LearnMapTests replay too. If only this
 * fails, the Kotlin port drifted from the others.
 */
class LearnMapTest {
    private val root: JsonObject = run {
        // Gradle runs a module's tests with the module directory as the working directory:
        // android/LearnWithAlphonso/core -> the repository root is three levels up.
        val file = File("../../../shared/learn-map.json").takeIf { it.exists() } ?: File("shared/learn-map.json")
        Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun JsonObject.s(key: String) = getValue(key).jsonPrimitive.content
    private fun JsonObject.i(key: String) = getValue(key).jsonPrimitive.int
    private fun JsonObject.d(key: String) = getValue(key).jsonPrimitive.double
    private fun JsonElement.strings() = jsonArray.map { it.jsonPrimitive.content }

    private val timing = root.getValue("timing").jsonObject.let { t ->
        LessonTiming(
            secondsPerQuestion = t.getValue("secondsPerQuestion").jsonObject.mapValues { it.value.jsonPrimitive.int },
            secondsPerNewWord = t.i("secondsPerNewWord"),
        )
    }

    private val units = unitsOf(root.getValue("units"))

    private fun unitsOf(json: JsonElement) = json.jsonArray.map { u ->
        val o = u.jsonObject
        LearnMap.Unit(
            id = o.s("id"),
            title = o.s("title"),
            lessons = o.getValue("lessons").jsonArray.map { l ->
                val lo = l.jsonObject
                LearnMap.Lesson(lo.s("id"), lo.s("title"), lo.s("subtitle"), lo.getValue("questionTypes").strings(), lo.i("wordCount"))
            },
        )
    }

    private fun near(expected: Double, actual: Double, label: String) =
        assertTrue(kotlin.math.abs(expected - actual) < 1e-9, "$label: expected $expected, got $actual")

    private fun check(expect: JsonObject, map: LearnMap.Climb, name: String) {
        assertEquals(expect.s("unitId"), map.unitId, name)
        val strip = expect.getValue("strip").jsonObject
        assertEquals(strip.i("number"), map.strip.number, "$name strip number")
        assertEquals(strip.i("count"), map.strip.count, "$name strip count")
        assertEquals(strip.s("name"), map.strip.name, "$name strip name")
        assertEquals(strip.i("done"), map.strip.done, "$name strip done")
        assertEquals(strip.i("total"), map.strip.total, "$name strip total")
        near(strip.d("progress"), map.strip.progress, "$name strip progress")

        val nodes = expect.getValue("nodes").jsonArray.map { it.jsonObject }
        assertEquals(nodes.map { "${it.s("id")}:${it.s("title")}:${it.s("state")}" }, map.nodes.map { "${it.id}:${it.title}:${it.state.key}" }, "$name nodes")
        nodes.zip(map.nodes).forEach { (e, n) ->
            near(e.d("x"), n.point.x, "$name ${n.id} x")
            near(e.d("y"), n.point.y, "$name ${n.id} y")
        }

        val chest = expect.getValue("chest").jsonObject
        assertEquals(chest.getValue("earned").jsonPrimitive.boolean, map.chest.earned, "$name chest earned")
        near(chest.d("x"), map.chest.point.x, "$name chest x")
        near(chest.d("y"), map.chest.point.y, "$name chest y")

        val trailhead = expect.getValue("trailhead").jsonObject
        val expectedTrailhead = if (trailhead.s("kind") == "chest") LearnMap.Trailhead.EarnedChest(trailhead.s("unitId")) else LearnMap.Trailhead.Start
        assertEquals(expectedTrailhead, map.trailhead, "$name trailhead")

        val next = expect.getValue("next")
        if (next is JsonNull) {
            assertNull(map.next, "$name next")
        } else {
            val n = next.jsonObject
            assertEquals(
                LearnMap.StartSheet(n.s("lessonId"), n.s("title"), n.s("coverage"), n.i("minutes"), n.i("xp"), n.i("words")),
                map.next,
                "$name start sheet",
            )
        }
    }

    @Test
    fun `every case matches the shared fixture`() {
        val cases = root.getValue("cases").jsonArray.map { it.jsonObject }
        assertTrue(cases.size >= 8)
        for (c in cases) {
            val name = c.s("name")
            val unitId = c["unitId"]?.jsonPrimitive?.content
            val caseUnits = c["units"]?.let(::unitsOf) ?: units
            val map = LearnMap.of(caseUnits, c.getValue("completed").strings().toSet(), timing, unitId)
            val expect = c.getValue("expect")
            if (expect is JsonNull) assertNull(map, name) else check(expect.jsonObject, map ?: error("$name: expected a map, got none"), name)
        }
    }

    @Test
    fun `a level with no units gives no map`() {
        assertNull(LearnMap.of(emptyList(), emptySet(), timing))
    }

    @Test
    fun `every layout point matches the shared fixture`() {
        for (p in root.getValue("points").jsonArray.map { it.jsonObject }) {
            val at = LearnMap.point(p.i("index"), p.i("slots"))
            near(p.d("x"), at.x, "slot ${p.i("index")} of ${p.i("slots")} x")
            near(p.d("y"), at.y, "slot ${p.i("index")} of ${p.i("slots")} y")
        }
    }

    @Test
    fun `the fixture's timing is the shipped one`() {
        val shipped = File("../../../src/data/lesson-timing.json").takeIf { it.exists() } ?: File("src/data/lesson-timing.json")
        assertEquals(LessonTiming.fromJson(shipped.readText()), timing)
    }

    @Test
    fun `the climb always rises and the chest sits exactly at the summit`() {
        for (slots in listOf(2, 4, 6, 12)) {
            val ys = (0 until slots).map { LearnMap.point(it, slots).y }
            ys.zipWithNext().forEach { (below, above) -> assertTrue(above < below, "slots $slots: $ys") }
            assertEquals(LearnMap.Point(0.5, 0.06), LearnMap.point(slots - 1, slots))
        }
    }
}
