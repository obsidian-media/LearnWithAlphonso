package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.podcast.StorySummary
import com.obsidianmedia.learnwithalphonso.ui.listen.StoriesLibraryContent
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Offline fixtures (no network: a card with no art draws its designed fallback, which is the point). */
@RunWith(AndroidJUnit4::class)
class StoriesLibraryTest {
    @get:Rule val rule = createComposeRule()

    private fun linear(id: String, title: String, index: Int = 0) =
        StorySummary(id, "en", "A1", id, title, 0, true, index, 5, null, null, false)

    private fun branching(id: String, title: String, order: Int, found: Int) =
        StorySummary(id, "en", "A2", id, title, order, true, 0, 0, null, null, false, branching = true, coverUrl = null, endingsTotal = 4, endingsFound = found)

    private val stories = listOf(
        branching("b1", "The Lost Key", 5, found = 1),
        branching("b2", "Older Path", 1, found = 0),
        linear("l1", "Tea Time", index = 2),
        linear("l2", "At the Market"),
    )

    @Test fun heroContinueLineAndGridCardsDisplayWithSize() {
        val opened = mutableListOf<String>()
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) { StoriesLibraryContent(stories, "en", { opened += it }) }
        }
        rule.waitForIdle()
        rule.onNodeWithTag("stories-hero").assertIsDisplayed().assertHasClickAction()
        rule.onNodeWithTag("stories-hero").assertContentDescriptionEquals("The Lost Key, A2, Choose your path, 1 of 4 endings, Continue")
        rule.onNodeWithTag("stories-continue").assertIsDisplayed()
            .assertContentDescriptionEquals("Tea Time, Continue · Scene 3, Resume")
        for (tag in listOf("stories-hero", "stories-continue")) {
            val box = rule.onNodeWithTag(tag).getBoundsInRoot()
            assertTrue("$tag has a size", box.right.value > box.left.value && box.bottom.value > box.top.value)
        }
        for (id in listOf("b2", "l1", "l2")) {
            val card = rule.onNodeWithTag("story-card-$id").assertIsDisplayed()
            val box = card.getBoundsInRoot()
            assertTrue("card $id has a size", box.right.value > box.left.value && box.bottom.value > box.top.value)
        }
        // The featured story is not repeated in the grid.
        rule.onNodeWithTag("story-card-b1").assertDoesNotExist()
        rule.onNodeWithTag("story-card-b2").assertContentDescriptionEquals("Older Path, A2, Choose your path, 0 of 4 endings")
        rule.onNodeWithTag("story-card-l2").assertContentDescriptionEquals("At the Market, A1, New")
        rule.onNodeWithTag("story-card-l2").performClick()
        assertEquals(listOf("l2"), opened)
    }
}
