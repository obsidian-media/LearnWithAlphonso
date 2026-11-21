package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.logic.LearnMap
import com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming
import com.obsidianmedia.learnwithalphonso.ui.learn.LearnClimbMap
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Learn climbing map must actually be drawn: source guards cannot see a map that composes at 0 x 0, a node
 * nobody can tap, or a start sheet that never opens. This renders it offline from a LearnMap.of(...) climb (fixture
 * units, no network) and checks real sizes, the spoken names, the sheet, the hints, Reduce Motion and 2x font.
 */
@RunWith(AndroidJUnit4::class)
class LearnClimbMapTest {
    @get:Rule val rule = createComposeRule()

    private val timing = LessonTiming(mapOf("mc" to 30), 6)

    private fun lesson(id: String, title: String) = LearnMap.Lesson(id, title, "Greetings and goodbyes", listOf("mc", "mc"), 3)

    private val units = listOf(
        LearnMap.Unit("u1", "Everyday basics", listOf(lesson("u1l1", "Saying Hello"), lesson("u1l2", "Saying Goodbye"))),
        LearnMap.Unit("u2", "About me", listOf(lesson("u2l1", "My Name"), lesson("u2l2", "My Age"), lesson("u2l3", "My Home"))),
    )

    /** Unit 1 done, one lesson of unit 2 done: done, next, locked, with unit 1's earned chest at the foot. */
    private val midClimb get() = LearnMap.of(units, setOf("u1l1", "u1l2", "u2l1"), timing)!!

    private fun show(climb: LearnMap.Climb, continueId: String? = "u2l2", reduceMotion: Boolean = false, fontScale: Float = 1f, onOpen: (String) -> Unit = {}) {
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, systemDark = false) {
                    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                        LearnClimbMap(climb, "Ready for today's lesson?", continueId, reduceMotion, onOpen)
                    }
                }
            }
        }
    }

    private fun assertRealSize(tag: String, unmerged: Boolean = false) {
        val size = rule.onNodeWithTag(tag, useUnmergedTree = unmerged).performScrollTo().fetchSemanticsNode().size
        assertTrue("$tag has a real size, got $size", size.width > 0 && size.height > 0)
    }

    @Test
    fun theClimbNodesAndChestsAreDrawnAtRealSizes() {
        show(midClimb)
        assertRealSize("learn-climb")
        assertRealSize("climb-chest-trailhead")
        for (id in listOf("u2l1", "u2l2", "u2l3")) assertRealSize("climb-node-$id")
        assertRealSize("climb-chest-summit")
        rule.onNodeWithText("Unit 2 of 2 · About me").assertIsDisplayed()
        rule.onNodeWithText("1 / 3").assertIsDisplayed()
    }

    @Test
    fun noTrailheadChestOnTheFirstUnit() {
        show(LearnMap.of(units, emptySet(), timing)!!)
        rule.onNodeWithTag("climb-chest-trailhead").assertDoesNotExist()
        rule.onNodeWithTag("climb-node-u1l1").assertExists()
    }

    @Test
    fun everyNodeAndChestHasItsSpokenName() {
        show(midClimb)
        rule.onNodeWithContentDescription("Lesson 1 of 3, My Name, done").assertExists()
        rule.onNodeWithContentDescription("Lesson 2 of 3, My Age, next").assertExists()
        rule.onNodeWithContentDescription("Lesson 3 of 3, My Home, locked").assertExists()
        rule.onNodeWithContentDescription("Unit 1 reward, earned").assertExists()
        rule.onNodeWithContentDescription("Unit 2 reward, locked until you finish the unit").assertExists()
    }

    @Test
    fun theClimbReadsFromTheFootToTheSummit() {
        show(midClimb)
        val order = listOf("climb-chest-trailhead", "climb-node-u2l1", "climb-node-u2l2", "climb-node-u2l3", "climb-chest-summit").map { tag ->
            rule.onNodeWithTag(tag).fetchSemanticsNode().config.getOrNull(SemanticsProperties.TraversalIndex)
                ?: error("$tag has no traversal index")
        }
        assertEquals("foot to summit, strictly increasing: $order", order.sorted(), order)
        assertEquals(order.size, order.toSet().size)
    }

    @Test
    fun tappingTheNextNodeOpensTheStartSheetWithContinueWhenItIsTheCourseWideLesson() {
        show(midClimb, continueId = "u2l2")
        rule.onNodeWithTag("climb-node-u2l2").performScrollTo().performClick()
        rule.onNodeWithTag("climb-sheet").assertExists()
        rule.onNodeWithText("Unit 2 · Lesson 2").assertExists()
        rule.onNodeWithText("My Age").assertExists()
        rule.onNodeWithText("Greetings and goodbyes").assertExists()
        val next = midClimb.next!!
        rule.onNodeWithText("${next.minutes} min").assertExists()
        rule.onNodeWithText("+${next.xp}").assertExists()
        rule.onNodeWithText("3").assertExists()
        rule.onNodeWithText("Continue lesson").assertExists()
        rule.onNodeWithText("Start lesson").assertDoesNotExist()
        rule.onNodeWithText("Not now").assertExists()
    }

    @Test
    fun theSheetSaysStartWhenTheNextLessonIsNotTheCourseWideOne() {
        show(midClimb, continueId = "elsewhere")
        rule.onNodeWithTag("climb-node-u2l2").performScrollTo().performClick()
        rule.onNodeWithText("Start lesson").assertExists()
        rule.onNodeWithText("Continue lesson").assertDoesNotExist()
        show2NotNowClosesIt()
    }

    private fun show2NotNowClosesIt() {
        rule.onNodeWithText("Not now").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("climb-sheet").assertDoesNotExist()
    }

    @Test
    fun theSheetCtaOpensTheLessonAndDismisses() {
        var opened: String? = null
        show(midClimb, onOpen = { opened = it })
        rule.onNodeWithTag("climb-node-u2l2").performScrollTo().performClick()
        rule.onNodeWithText("Continue lesson").performClick()
        rule.waitForIdle()
        assertEquals("u2l2", opened)
        rule.onNodeWithTag("climb-sheet").assertDoesNotExist()
    }

    @Test
    fun aLockedNodeExplainsItselfInAStatusLineThatClears() {
        show(midClimb)
        rule.onNodeWithTag("climb-node-u2l3").performScrollTo().performClick()
        rule.onNodeWithText("Finish My Age first, then this one opens.").assertExists()
        rule.mainClock.advanceTimeBy(6_500)
        rule.onNodeWithTag("climb-hint").assertTextEquals("")
    }

    @Test
    fun theLockedSummitChestExplainsItself() {
        show(midClimb)
        rule.onNodeWithTag("climb-chest-summit").performScrollTo().performClick()
        rule.onNodeWithText("Finish this unit to open the chest.").assertExists()
    }

    @Test
    fun anEarnedSummitChestIsAPictureNotAButton() {
        show(LearnMap.of(units, setOf("u1l1", "u1l2", "u2l1", "u2l2", "u2l3"), timing)!!)
        rule.onNodeWithContentDescription("Unit 2 reward, earned").assertExists().assertHasNoClickAction()
        rule.onNodeWithTag("climb-chest-summit").assertHasNoClickAction()
    }

    @Test
    fun aDoneNodeReplaysItsLesson() {
        var opened: String? = null
        show(midClimb, onOpen = { opened = it })
        rule.onNodeWithTag("climb-node-u2l1").performScrollTo().performClick()
        assertEquals("u2l1", opened)
    }

    @Test
    fun theNextNodeBobsUnlessReduceMotionIsOn() {
        show(midClimb, reduceMotion = false)
        rule.onNodeWithTag("climb-bob-on", useUnmergedTree = true).assertExists()
        rule.onNodeWithTag("climb-bob-off", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun reduceMotionHoldsTheNextNodeStill() {
        show(midClimb, reduceMotion = true)
        rule.onNodeWithTag("climb-bob-off", useUnmergedTree = true).assertExists()
        rule.onNodeWithTag("climb-bob-on", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun atTwiceTheFontTheSheetStillReachesItsButton() {
        show(midClimb, continueId = "elsewhere", fontScale = 2f)
        assertRealSize("climb-node-u2l2")
        rule.onNodeWithTag("climb-node-u2l2").performScrollTo().performClick()
        rule.onNodeWithText("Start lesson").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Not now").performScrollTo().assertIsDisplayed()
    }
}
