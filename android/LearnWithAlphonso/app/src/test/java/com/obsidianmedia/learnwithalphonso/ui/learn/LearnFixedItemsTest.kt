package com.obsidianmedia.learnwithalphonso.ui.learn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Jump to current scrolls to `learnFixedItems(...) + the current row's index`, so the count must match the items the
 * Learn LazyColumn really draws above the unit rows. A miscount scrolls to the wrong row and nothing else notices.
 */
class LearnFixedItemsTest {
    @Test
    fun `counts the four fixed items, plus the map, the open For-you detail and the placement banner when shown`() {
        assertEquals(4, learnFixedItems(hasClimb = false, forYouDetailOpen = false, showsPlacement = false))
        assertEquals(5, learnFixedItems(hasClimb = true, forYouDetailOpen = false, showsPlacement = false))
        assertEquals(5, learnFixedItems(hasClimb = false, forYouDetailOpen = true, showsPlacement = false))
        assertEquals(5, learnFixedItems(hasClimb = false, forYouDetailOpen = false, showsPlacement = true))
        assertEquals(5, learnFixedItems(hasClimb = false, forYouDetailOpen = false, showsPlacement = false, pathCards = true))
        assertEquals(7, learnFixedItems(hasClimb = true, forYouDetailOpen = true, showsPlacement = true))
    }

    @Test
    fun `on the event day the warm-up takes the hero's place, so the map is neither drawn nor counted`() {
        val src = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui/learn/LearnScreen.kt").readText()
        // The count is told there is no climb whenever a hero is pinned, so Jump to current lands on the right row.
        assertTrue("hasClimb = climb != null && (pathUi as? PathUi.Ready)?.path?.heroPinned == null" in src)
        // And the map itself is skipped under the same condition.
        assertTrue("climb?.takeIf { (pathUi as? PathUi.Ready)?.path?.heroPinned == null }" in src)
    }

    @Test
    fun `the items above the unit rows are exactly the ones the count knows about`() {
        val src = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui/learn/LearnScreen.kt").readText()
        val above = src.substring(src.indexOf("item(key = \"header\")"), src.indexOf("rows.forEach { row ->"))
        val keys = Regex("""item\(key = "([^"]+)"\)""").findAll(above).map { it.groupValues[1] }.toList()
        // Always drawn: header, for-you, levels, jump (4). Drawn when shown: placement (first, above the map), learn-climb, for-you-detail.
        assertEquals(listOf("header", "placement", "rehearsal-hero", "learn-climb", "path-cards", "for-you", "for-you-detail", "levels", "jump"), keys)
        assertEquals(7, learnFixedItems(hasClimb = true, forYouDetailOpen = true, showsPlacement = true))
        assertEquals(5, learnFixedItems(hasClimb = false, forYouDetailOpen = false, showsPlacement = false, rehearsalHero = true))
        // Each conditional item sits under the same condition the count uses.
        for ((key, condition) in listOf(
            "learn-climb" to "climb?.takeIf { (pathUi as? PathUi.Ready)?.path?.heroPinned == null }",
            "rehearsal-hero" to "heroPinned",
            "for-you-detail" to "forYouOpen",
            "placement" to "offerStyle != PlacementOffer.Style.NONE",
            "path-cards" to "learnPathCardCount",
        )) {
            val at = above.indexOf("item(key = \"$key\")")
            val before = above.substring(maxOf(0, at - 260), at)
            assertTrue("$key should be drawn under `$condition`; the 260 chars before it were: $before", condition in before)
        }
    }
}
