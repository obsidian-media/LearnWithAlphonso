package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * AlphonsoTokens.kt is generated from design/tokens.json (scripts/export-design-system.ts). This reads the JSON
 * itself and fails when any Android value has drifted from it.
 */
class AlphonsoTokensSyncTest {
    private val repo: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "design/tokens.json").exists() }
    private val json = Json.parseToJsonElement(File(repo, "design/tokens.json").readText()).jsonObject

    private fun hex(v: String) = Color(0xFF000000L or v.removePrefix("#").toLong(16))
    private fun ints(key: String): Map<String, Int> =
        json.getValue(key).jsonObject.mapValues { it.value.jsonPrimitive.int }

    @Test
    fun `every colour in both palettes, light and night, matches the JSON`() {
        val palettes = json.getValue("palettes").jsonObject
        var checked = 0
        for ((palette, id) in listOf("royal" to AlphonsoPaletteId.ROYAL, "meadow" to AlphonsoPaletteId.MEADOW)) {
            for ((mode, night) in listOf("light" to false, "night" to true)) {
                val expected = palettes.getValue(palette).jsonObject.getValue(mode).jsonObject
                val actual = AlphonsoTokens.colors(id, night).toMap()
                assertEquals("$palette $mode names", expected.keys, actual.keys)
                for ((name, value) in expected) {
                    assertEquals("$palette.$mode.$name", hex(value.jsonPrimitive.content), actual[name])
                    checked++
                }
            }
        }
        assertTrue(checked >= 160)
    }

    @Test
    fun `space, radius, edge and durations match the JSON`() {
        // Everything but one entry is the shared scale; Android's smallest touch target is 48 dp, not the shared 44 (a platform rule in the generator).
        assertEquals(ints("space") + ("minTouch" to 48), AlphonsoTokens.Space.values)
        assertEquals(ints("radius"), AlphonsoTokens.Radius.values)
        assertEquals(ints("edge"), AlphonsoTokens.Edge.values)
        val durations = json.getValue("motion").jsonObject.getValue("duration").jsonObject.mapValues { it.value.jsonPrimitive.int }
        assertEquals(durations, AlphonsoTokens.Motion.durations)
    }

    @Test
    fun `type roles match the JSON`() {
        val type = json.getValue("type").jsonObject
        val roles = mapOf(
            "displayXL" to AlphonsoTokens.Type.displayXL, "display" to AlphonsoTokens.Type.display,
            "title" to AlphonsoTokens.Type.title, "headline" to AlphonsoTokens.Type.headline,
            "question" to AlphonsoTokens.Type.question, "questionSmall" to AlphonsoTokens.Type.questionSmall,
            "answer" to AlphonsoTokens.Type.answer,
            "body" to AlphonsoTokens.Type.body, "footnote" to AlphonsoTokens.Type.footnote,
            "caption" to AlphonsoTokens.Type.caption, "overline" to AlphonsoTokens.Type.overline,
            "numeralXL" to AlphonsoTokens.Type.numeralXL, "numeral" to AlphonsoTokens.Type.numeral,
        )
        assertEquals(type.keys, roles.keys)
        for ((name, spec) in roles) {
            val t = type.getValue(name) as JsonObject
            assertEquals(name, t.getValue("size").jsonPrimitive.int, spec.size)
            assertEquals(name, t.getValue("lineHeight").jsonPrimitive.int, spec.lineHeight)
            assertEquals(name, t.getValue("weight").jsonPrimitive.int, spec.weight)
            assertEquals(name, t.getValue("tnum").jsonPrimitive.content.toBoolean(), spec.tnum)
            assertEquals(name, t.getValue("family").jsonPrimitive.content.uppercase(), spec.role.name)
        }
    }

    @Test
    fun `every icon in design-icons, and each solid version, is a drawable`() {
        val names = File(repo, "design/icons").listFiles()!!.filter { it.extension == "svg" }.map { it.nameWithoutExtension }
        val solid = json.getValue("icons").jsonObject.getValue("solid").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(22, names.size)
        val expected = names.map { "ds-$it" } + solid.map { "ds-$it-solid" }
        assertEquals(expected.toSet(), AlphonsoTokens.Icons.all.keys)
    }
}
