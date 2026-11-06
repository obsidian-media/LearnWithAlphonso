package com.obsidianmedia.learnwithalphonso.ui.theme

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The room plan's bundled table (assets/content/unit-rooms.json, written by scripts/export-android-content.ts):
 * every unit of every bundled course has a painted room whose scene is in assets/scenes.
 */
class UnitRoomsAssetTest {
    private val assets = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "android/LearnWithAlphonso/app/src/main/assets") }
        .first { it.exists() }

    private fun read(rel: String) = Json.parseToJsonElement(File(assets, rel).readText()).jsonObject

    @Test
    fun `every unit has a painted room with its scene bundled`() {
        val map = read("content/unit-rooms.json")
        val painted = map.getValue("rooms").jsonArray.map { it.jsonObject }
            .filter { it.getValue("painted").jsonPrimitive.boolean }
            .map { it.getValue("id").jsonPrimitive.content }
            .toSet()
        assertEquals(35, painted.size)
        val units = map.getValue("units").jsonObject.mapValues { it.value.jsonPrimitive.content }
        var checked = 0
        for (course in listOf("en", "fr", "es")) {
            for (unit in read("content/curriculum-$course.json").getValue("units").jsonArray) {
                val id = unit.jsonObject.getValue("id").jsonPrimitive.content
                val room = units[id] ?: error("$id has no room")
                assertTrue("$id uses $room, which is not painted", room in painted)
                assertTrue("$id: scenes/$room.webp", File(assets, "scenes/$room.webp").exists())
                checked++
            }
        }
        assertEquals(units.size, checked)
    }
}
