package com.obsidianmedia.learnwithalphonso.core.avatar

import com.obsidianmedia.learnwithalphonso.core.content.Course
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Replays shared/avatar-parity.json: the reference outputs of the iOS Kit, which the Swift and TypeScript tests replay
 * too. If only this fails, the Kotlin port drifted; regenerate the file from the Kit, never from a port.
 */
class AvatarParityTest {
    private val root: JsonObject = run {
        // Gradle runs a module's tests with the module directory as the working directory:
        // android/LearnWithAlphonso/core -> the repository root is three levels up.
        val file = File("../../../shared/avatar-parity.json").takeIf { it.exists() }
            ?: File("shared/avatar-parity.json")
        Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun course(code: String) = Course.fromCode(code)
    private fun JsonElement.str() = jsonPrimitive.content
    private fun JsonObject.arr(key: String): JsonArray = getValue(key).jsonArray
    private fun JsonObject.num(key: String) = getValue(key).jsonPrimitive.double
    private fun JsonObject.s(key: String) = getValue(key).jsonPrimitive.content

    private fun assertNear(expected: Double?, actual: Double?, label: String) {
        if (expected == null || actual == null) { assertEquals(expected, actual, label); return }
        assertTrue(kotlin.math.abs(expected - actual) < 1e-9, "$label: expected $expected, got $actual")
    }

    @Test
    fun `viseme sequences match the fixtures`() {
        val rows = root.arr("visemes")
        assertTrue(rows.size > 60)
        for (row in rows) {
            val o = row.jsonObject
            val got = AvatarVisemes.sequence(o.s("word"), course(o.s("course"))).map { it.wire }
            assertEquals(o.arr("expect").map { it.str() }, got, "${o.s("course")} ${o.s("word")}")
        }
    }

    @Test
    fun `lip-sync plans match the fixtures`() {
        val rows = root.arr("plans")
        assertTrue(rows.size > 8)
        for (row in rows) {
            val o = row.jsonObject
            val text = o.s("text")
            val plan = AvatarLipSync.plan(text, course(o.s("course")), o.num("duration"))
            val cues = o.arr("cues")
            assertEquals(cues.size, plan.cues.size, text)
            plan.cues.zip(cues).forEach { (cue, e) ->
                assertNear(e.jsonObject.num("start"), cue.start, "$text cue start")
                assertNear(e.jsonObject.num("end"), cue.end, "$text cue end")
                assertEquals(e.jsonObject.s("viseme"), cue.viseme.wire, text)
            }
            val spans = o.arr("raisedBrows")
            assertEquals(spans.size, plan.raisedBrows.size, text)
            plan.raisedBrows.zip(spans).forEach { (span, e) ->
                assertNear(e.jsonObject.num("start"), span.start, "$text brow start")
                assertNear(e.jsonObject.num("end"), span.end, "$text brow end")
            }
            for (probe in o.arr("probes")) {
                val p = probe.jsonObject
                val t = p.num("time")
                assertEquals(p.s("viseme"), plan.visemeAt(t).wire, "$text viseme at $t")
                assertEquals(p.s("brows"), plan.browsAt(t).wire, "$text brows at $t")
            }
        }
    }

    private fun phaseKind(wire: String) = when (wire) {
        "idle" -> PhaseKind.IDLE
        "requestingPermission" -> PhaseKind.REQUESTING_PERMISSION
        "recording" -> PhaseKind.RECORDING
        "transcribing" -> PhaseKind.TRANSCRIBING
        "thinking" -> PhaseKind.THINKING
        "speaking" -> PhaseKind.SPEAKING
        else -> PhaseKind.FAILED
    }

    @Test
    fun `state machine scenarios match the fixtures`() {
        val machine = root.getValue("machine").jsonObject
        val plans = machine.arr("plans").map {
            val o = it.jsonObject
            AvatarLipSync.plan(o.s("text"), course(o.s("course")), o.num("duration"))
        }
        val scenarios = machine.arr("scenarios")
        assertTrue(scenarios.size > 10)
        for (scenario in scenarios) {
            val so = scenario.jsonObject
            val name = so.s("name")
            val m = AvatarMachine()
            so.arr("steps").forEachIndexed { index, step ->
                val o = step.jsonObject
                val where = "$name step $index"
                when (o.s("op")) {
                    "update" -> {
                        m.update(VoicePhase(phaseKind(o.s("phase")), o.getValue("generation").jsonPrimitive.int), o.num("now"))
                        assertEquals(o.s("mode"), m.mode.label, where)
                    }
                    "heard" -> m.heard(o.num("level"), o.num("now"))
                    "reply" -> m.replyArrived(ReplyVerdict.fromWire(o.s("verdict")))
                    "pose" -> {
                        val sp = o.getValue("speech")
                        val speech = if (sp is JsonNull) null else SpeechPosition(plans[sp.jsonObject.getValue("plan").jsonPrimitive.int], sp.jsonObject.num("time"))
                        val pose = m.pose(o.num("now"), speech)
                        assertEquals(o.s("mode"), m.mode.label, "$where mode")
                        assertEquals(o.s("mouth"), pose.mouth.wire, "$where mouth")
                        assertEquals(o.s("brows"), pose.brows.wire, "$where brows")
                    }
                    else -> throw AssertionError("unknown op in $where")
                }
            }
        }
    }

    private fun earLabel(side: EarSide?) = when (side) { EarSide.LEFT -> "left"; EarSide.RIGHT -> "right"; null -> null }
    private fun JsonObject.nullableStr(key: String): String? = getValue(key).let { if (it is JsonNull) null else it.jsonPrimitive.content }
    private fun JsonObject.nullableNum(key: String): Double? = getValue(key).let { if (it is JsonNull) null else it.jsonPrimitive.double }

    @Test
    fun `idle life matches the fixtures`() {
        val idle = root.getValue("idle").jsonObject
        for (seedRow in idle.arr("seeds")) {
            val o = seedRow.jsonObject
            val seed = o.s("seed").toULong()
            val random = SeededRandom(seed)
            o.arr("first").forEachIndexed { k, e -> assertNear(e.jsonPrimitive.double, random.nextUnit(), "seed $seed random $k") }
            val scheduler = AvatarIdleScheduler(SeededRandom(seed))
            var twitches = 0
            for (sample in o.arr("samples")) {
                val s = sample.jsonObject
                val t = s.num("t")
                scheduler.advance(t)
                assertEquals(s.nullableStr("ear"), earLabel(scheduler.twitchingEar), "seed $seed ear at $t")
                assertNear(s.nullableNum("glint"), scheduler.glintProgress, "seed $seed glint at $t")
                if (scheduler.twitchingEar != null) twitches++
            }
            assertTrue(twitches > 5, "the fixture has to contain ear twitches")
            val jump = o.getValue("jump").jsonObject
            val jumped = AvatarIdleScheduler(SeededRandom(seed))
            jumped.advance(jump.num("t"))
            assertEquals(jump.nullableStr("ear"), earLabel(jumped.twitchingEar))
            assertNear(jump.nullableNum("glint"), jumped.glintProgress, "seed $seed glint after a jump")
        }
        for (row in idle.arr("motion")) {
            val o = row.jsonObject
            val t = o.num("t")
            assertNear(o.num("sway"), AvatarIdleMotion.swayDegrees(t), "sway $t")
            val (x, y) = AvatarIdleMotion.breathScale(t)
            assertNear(o.num("breathX"), x, "breath x $t")
            assertNear(o.num("breathY"), y, "breath y $t")
        }
    }
}
