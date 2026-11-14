package com.obsidianmedia.learnwithalphonso.ui.achievements

import com.obsidianmedia.learnwithalphonso.core.logic.AchievementPresentation
import com.obsidianmedia.learnwithalphonso.testContent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Every achievement in the catalog has its medallion drawable, so the screen never falls back to the placeholder star for a real badge. */
class BadgeArtTest {
    @Test
    fun `every catalog achievement has a badge drawable and every badge drawable is a catalog achievement`() {
        val catalog = testContent.achievements
        assertEquals(25, catalog.size)
        val dir = File("src/main/res/drawable-nodpi")
        val missing = catalog.map { AchievementPresentation.medallionName(it.id) }.filterNot { File(dir, "$it.webp").exists() }
        assertTrue("no medallion for: $missing", missing.isEmpty())
        val onDisk = dir.listFiles { f -> f.name.startsWith("badge_") }.orEmpty().map { it.nameWithoutExtension }.toSet()
        val known = catalog.map { AchievementPresentation.medallionName(it.id) }.toSet()
        assertEquals(emptySet<String>(), onDisk - known)
    }
}
