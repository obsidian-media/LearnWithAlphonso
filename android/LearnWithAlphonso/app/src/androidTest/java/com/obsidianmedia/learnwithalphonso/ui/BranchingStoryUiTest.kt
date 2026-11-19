package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.podcast.EndingQuality
import com.obsidianmedia.learnwithalphonso.core.podcast.SceneProgress
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryChoice
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryChoiceOption
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryEnding
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryGraph
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryNode
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingStory
import com.obsidianmedia.learnwithalphonso.ui.listen.BranchingEndingContent
import com.obsidianmedia.learnwithalphonso.ui.listen.BranchingSceneContent
import com.obsidianmedia.learnwithalphonso.ui.listen.EndingResult
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The branching reader and its ending, rendered from fixture data (no network, no AppContainer, no narration): the stateless
 * content composables must really be on screen with a size, not merely present in the source.
 */
@RunWith(AndroidJUnit4::class)
class BranchingStoryUiTest {
    @get:Rule val rule = createComposeRule()

    private fun ending(n: Int) = StoryNode(listOf("e$n"), ending = StoryEnding("end$n", "Ending $n", "Wrap line $n.", EndingQuality.GOOD))
    private fun choice(vararg gotos: String) = StoryNode(listOf("c"), choice = StoryChoice("p", gotos.map { StoryChoiceOption("label $it", it, false) }))

    /** start(choice a, b); a(choice e1, e2); b(link b2); b2(choice e3, e4). */
    private val story = BranchingStory(
        "story-1", "es", "A1", "A fixture story",
        StoryGraph(
            "start",
            mapOf(
                "start" to choice("a", "b"),
                "a" to choice("e1", "e2"),
                "b" to StoryNode(listOf("l"), next = "b2"),
                "b2" to choice("e3", "e4"),
                "e1" to ending(1), "e2" to ending(2), "e3" to ending(3), "e4" to ending(4),
            ),
        ),
    )

    @Test fun sceneShowsThePassageAndEveryChoiceBubbleWithASize() {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                BranchingSceneContent(
                    title = "A fixture story", courseCode = "es", sceneNumber = 1, progress = SceneProgress(1, 3), artUrl = null,
                    segments = listOf("Ana abre la puerta y mira el jardin."), activeSegment = null, playing = false, narrationNote = null,
                    beat = "What does Ana do?", choiceLabels = listOf("She walks into the garden", "She stays inside"),
                    showContinue = false, continueLabel = "Continue", onBack = null, onListen = {}, onPause = {}, onChoose = {}, onContinue = {}, onWordTap = null,
                )
            }
        }
        rule.waitForIdle()
        rule.onNodeWithText("Ana abre la puerta y mira el jardin.").assertIsDisplayed().assertWidthIsAtLeast(1.dp).assertHeightIsAtLeast(1.dp)
        rule.onNodeWithText("What does Ana do?").assertIsDisplayed()
        for ((index, label) in listOf("She walks into the garden", "She stays inside").withIndex()) {
            rule.onNodeWithText(label).assertIsDisplayed()
            rule.onNodeWithTag("branching-choice-$index").assertIsDisplayed().assertWidthIsAtLeast(1.dp).assertHeightIsAtLeast(1.dp)
        }
        // A fallback gradient stands in for the missing art: the scene fills the screen, so it has a real size.
        val bounds = rule.onNodeWithTag("branching-scene").getUnclippedBoundsInRoot()
        assertTrue("the scene fills the screen", bounds.right - bounds.left > 100.dp && bounds.bottom - bounds.top > 100.dp)
    }

    @Test fun endingShowsTheBranchMapWithItsCountPill() {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                BranchingEndingContent(
                    story = story, path = listOf(0, 0), ending = story.graph.map.getValue("e1").ending!!, artUrl = null,
                    found = listOf("end1", "end3"), result = EndingResult.Done(stars = 2, credited = false),
                    onRetrySave = {}, onRestart = {},
                )
            }
        }
        rule.waitForIdle()
        rule.onNodeWithText("Ending 1").assertIsDisplayed()
        rule.onNodeWithTag("branch-map-card").assertIsDisplayed().assertWidthIsAtLeast(1.dp).assertHeightIsAtLeast(1.dp)
        // The card carries one text alternative; its drawing and pill live in the unmerged tree.
        rule.onNodeWithText("2 / 4", useUnmergedTree = true).assertExists()
        rule.onNodeWithTag("branch-map-canvas", useUnmergedTree = true).assertWidthIsAtLeast(1.dp).assertHeightIsAtLeast(1.dp)
        rule.onNodeWithText("Try another path").assertExists()
        rule.onNodeWithText("Read it again").assertExists()
    }
}
