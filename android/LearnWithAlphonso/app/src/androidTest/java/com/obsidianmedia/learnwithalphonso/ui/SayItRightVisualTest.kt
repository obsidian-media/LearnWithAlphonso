package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationPhase
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationSession
import com.obsidianmedia.learnwithalphonso.core.logic.SayItRight
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.ui.practice.SayItRightContent
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Say it right ("Talk with Alphonso"), drawn offline from fixtures (no recorder, consent or network). The point is that
 * the pieces of the redesign are really ON SCREEN with a size: Alphonso's pose, the speech bubble holding the word, and
 * the mic. Each node is scrolled to and waited for BEFORE it is asserted (the content sits in a scrolling column, so a
 * node can be off-screen), because an assertion on an off-screen node fails.
 */
@RunWith(AndroidJUnit4::class)
class SayItRightVisualTest {
    @get:Rule val rule = createComposeRule()

    private fun words(n: Int) = (0 until n).map { VocabItem("word$it", "", "", null) }

    private fun SemanticsNodeInteraction.assertHasSize(): SemanticsNodeInteraction {
        val size = fetchSemanticsNode().size
        assertTrue("expected a drawn size, got $size", size.width > 0 && size.height > 0)
        return this
    }

    /** Waits for the node to exist, scrolls it into view, then returns it for assertions. */
    private fun visible(tag: String): SemanticsNodeInteraction {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
        return rule.onNodeWithTag(tag).performScrollTo()
    }

    private fun show(
        session: PronunciationSession,
        phase: TurnPhase = TurnPhase.IDLE,
        canCapture: Boolean = true,
        onNext: () -> Unit = {},
        onRestart: () -> Unit = {},
        onBack: () -> Unit = {},
        onHear: (String) -> Unit = {},
    ) {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                Column(Modifier.testTag("sir-root").verticalScroll(rememberScrollState())) {
                    SayItRightContent(
                        session = session, phase = phase, canCapture = canCapture, error = null, reduceMotion = true,
                        unavailable = {}, onPressBegan = {}, onPressEnded = {}, onHear = onHear, onNext = onNext,
                        onRestart = onRestart, onBack = onBack,
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    @Test fun askShowsAlphonsoExplainingWithTheWordInHisBubbleAndTheBlueMic() {
        show(PronunciationSession(words(8)))
        visible("sir-pose").assertIsDisplayed().assertHasSize()
        visible("sir-pose-image").assertIsDisplayed().assertHasSize()
        visible("sir-bubble").assertIsDisplayed().assertHasSize()
        rule.onNodeWithTag("sir-word").assertIsDisplayed().assertHasSize()
        rule.onNodeWithText("word0").assertIsDisplayed()
        rule.onNodeWithText(SayItRight.ASK_LINE).assertIsDisplayed()
        rule.onNodeWithText("Hear it").assertIsDisplayed()
        visible("sir-mic").assertIsDisplayed().assertHasSize()
    }

    @Test fun theMicSitsOppositeAlphonsoNotUnderHim() {
        show(PronunciationSession(words(8)))
        val pose = visible("sir-pose").fetchSemanticsNode().boundsInRoot
        val mic = visible("sir-mic").fetchSemanticsNode().boundsInRoot
        assertTrue("the mic ($mic) should sit to the right of Alphonso ($pose)", mic.center.x > pose.center.x)
    }

    @Test fun whileRecordingAlphonsoListensAndTheBubbleSaysSo() {
        show(PronunciationSession(words(8)), phase = TurnPhase.RECORDING)
        visible("sir-pose-image").assertHasSize()
        rule.onNodeWithText(SayItRight.LISTENING_LINE).assertIsDisplayed()
        visible("sir-mic").assertHasSize()
    }

    @Test fun aMissShowsAWarmLineAndTheRetryHint() {
        val s = PronunciationSession(words(8)).submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first
        assertEquals(PronunciationPhase.RETRY, s.phase)
        show(s)
        visible("sir-pose-image").assertHasSize()
        rule.onNodeWithText(SayItRight.praise(com.obsidianmedia.learnwithalphonso.core.logic.Pronunciation.Verdict.AGAIN)[0]).assertIsDisplayed()
        rule.onNodeWithText(SayItRight.RETRY_HINT).performScrollTo().assertIsDisplayed()
        assertTrue(rule.onAllNodesWithTag("sir-word").fetchSemanticsNodes().isNotEmpty())
    }

    @Test fun aWinPraisesInTheBubbleAndOffersNext() {
        val s = PronunciationSession(words(8)).submit("word0", 0.95, Course.ENGLISH, roll = 0.0).first
        assertEquals(PronunciationPhase.RESULT, s.phase)
        var next = 0
        show(s, onNext = { next++ })
        visible("sir-pose-image").assertHasSize()
        rule.onNodeWithText("Spot on!").assertIsDisplayed()
        rule.onNodeWithText("Next").performScrollTo().performClick()
        rule.runOnIdle { assertEquals(1, next) }
    }

    @Test fun theWrapShowsStarsNOfMClearlyAndBothButtons() {
        var s = PronunciationSession(words(2))
        s = s.submit("word0", 0.95, Course.ENGLISH, roll = 0.0).first.next()
        s = s.submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first.submit("zzz", 0.9, Course.ENGLISH, roll = 0.0).first.next()
        assertEquals(PronunciationPhase.DONE, s.phase)
        var again = 0
        var back = 0
        show(s, onRestart = { again++ }, onBack = { back++ })
        visible("sir-pose-image").assertHasSize()
        visible("sir-clearly").assertIsDisplayed().assertHasSize()
        rule.onNodeWithText("1 of 2 clearly").assertIsDisplayed()
        rule.onNodeWithText("Practise more").performScrollTo().performClick()
        rule.onNodeWithText("Back").performScrollTo().performClick()
        rule.runOnIdle {
            assertEquals(1, again)
            assertEquals(1, back)
        }
    }
}
