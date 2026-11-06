package com.obsidianmedia.learnwithalphonso.ui.theme

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Screens use design tokens, never raw values (the design system spec's "No raw values"). Scans
 * app/src/main/java except ui/theme/ (where the token files live) for raw colours (Color(0x..), Color.parseColor,
 * Color(red = ..)) and raw font sizes (14.sp, FontFamily(..)). design/baselines/android.json holds today's count
 * per file; a count may only go down. A file that uses AlphonsoTokens must have none. The patterns match
 * src/lib/raw-design-values.ts, which writes the baseline.
 */
class NoRawDesignValuesTest {
    private val repo: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "design/tokens.json").exists() }

    private val patterns = listOf(
        Regex("""\bColor\(\s*0x"""),
        Regex("""\bColor\.parseColor\("""),
        Regex("""\bColor\(\s*red\s*="""),
        Regex("""\b\d+(?:\.\d+)?\.sp\b"""),
        Regex("""\bFontFamily\("""),
    )
    private val newSystem = Regex("""\bAlphonsoTokens\b|\bLocalAlphonsoTokens\b""")

    private fun count(text: String) = patterns.sumOf { it.findAll(text).count() }

    private fun violations(root: File, baseline: Map<String, Int>): List<String> {
        val src = File(root, "android/LearnWithAlphonso/app/src/main/java")
        return src.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .map { it to it.relativeTo(root).invariantSeparatorsPath }
            .filterNot { (_, rel) -> rel.contains("/ui/theme/") }
            .sortedBy { it.second }
            .mapNotNull { (file, rel) ->
                val text = file.readText()
                val n = count(text)
                when {
                    n == 0 -> null
                    newSystem.containsMatchIn(text) -> "$rel: $n raw value(s) in a design-system file, which must have none"
                    n > (baseline[rel] ?: 0) -> "$rel: $n raw value(s), baseline allows ${baseline[rel] ?: 0}"
                    else -> null
                }
            }
            .toList()
    }

    private fun baseline(): Map<String, Int> =
        Json.parseToJsonElement(File(repo, "design/baselines/android.json").readText()).jsonObject
            .getValue("files").jsonObject.mapValues { it.value.jsonPrimitive.int }

    @Test
    fun `no file has more raw colours or font sizes than its baseline and token files have none`() {
        assertEquals(emptyList<String>(), violations(repo, baseline()))
    }

    @Test
    fun `the baseline only goes down - never above the 63 raw values it started with on 2026-11-06`() {
        assertTrue(baseline().values.sum() <= 63)
    }

    @Test
    fun `counts what the spec bans`() {
        assertEquals(2, count("""Text("+20", fontSize = 30.sp, color = Color(0xFF8C6410))"""))
        assertEquals(1, count("val f = FontFamily(Font(R.font.x))"))
        assertEquals(0, count("Text(\"+20\", style = AlphonsoTokens.Type.numeralXL.toTextStyle(), color = tokens.xpText)"))
    }

    @Test
    fun `the guard goes red on a planted Color(0xFF123456), and on any raw value in a token-system file`() {
        val tmp = Files.createTempDirectory("ds-guard-android").toFile()
        try {
            val dir = File(tmp, "android/LearnWithAlphonso/app/src/main/java/x").apply { mkdirs() }
            File(dir, "Planted.kt").writeText("val c = Color(0xFF123456)")
            File(dir, "ui/theme").apply { mkdirs() }.resolve("Tokens.kt").writeText("val c = Color(0xFF123456)")
            assertEquals(
                listOf("android/LearnWithAlphonso/app/src/main/java/x/Planted.kt: 1 raw value(s), baseline allows 0"),
                violations(tmp, emptyMap()),
            )
            assertEquals(emptyList<String>(), violations(tmp, mapOf("android/LearnWithAlphonso/app/src/main/java/x/Planted.kt" to 1)))
            File(dir, "NewCard.kt").writeText("val c = LocalAlphonsoTokens.current; val s = 13.sp")
            assertEquals(
                listOf("android/LearnWithAlphonso/app/src/main/java/x/NewCard.kt: 1 raw value(s) in a design-system file, which must have none"),
                violations(tmp, mapOf("android/LearnWithAlphonso/app/src/main/java/x/Planted.kt" to 1, "android/LearnWithAlphonso/app/src/main/java/x/NewCard.kt" to 9)),
            )
        } finally {
            tmp.deleteRecursively()
        }
    }
}
