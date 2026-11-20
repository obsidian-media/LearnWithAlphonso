package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Replays shared/hector-chips.json, which the TypeScript and Swift tests replay too. */
class HectorChipsTest {
    private val cases = run {
        // Gradle runs a module's tests with the module directory as the working directory.
        val file = File("../../../shared/hector-chips.json").takeIf { it.exists() } ?: File("shared/hector-chips.json")
        Json.parseToJsonElement(file.readText()).jsonObject.getValue("cases").jsonArray
    }

    @Test
    fun `chips match the shared fixtures`() {
        assertTrue(cases.size >= 9)
        for (c in cases) {
            val o = c.jsonObject
            val input = o.getValue("input").jsonObject
            val weak = input.getValue("weakSpot").let { if (it is JsonNull) null else it.jsonPrimitive.content }
            val got = HectorChips.build(Course.fromCode(input.getValue("course").jsonPrimitive.content), weak, input.getValue("streakDays").jsonPrimitive.int)
            val want = o.getValue("chips").jsonArray.map { e -> e.jsonObject.let { listOf(it.getValue("id").jsonPrimitive.content, it.getValue("label").jsonPrimitive.content, it.getValue("message").jsonPrimitive.content) } }
            assertEquals(want, got.map { listOf(it.id, it.label, it.message) }, o.getValue("name").jsonPrimitive.content)
            assertTrue(got.size <= 4)
            assertEquals(got.size, got.map { it.id }.toSet().size)
        }
    }
}
