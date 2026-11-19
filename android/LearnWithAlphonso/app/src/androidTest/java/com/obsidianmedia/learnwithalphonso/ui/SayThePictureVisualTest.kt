package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.runtime.Composable
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
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.logic.SayPicturePhase
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureSession
import com.obsidianmedia.learnwithalphonso.core.logic.SayThePicture
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.SayPictureSave
import com.obsidianmedia.learnwithalphonso.ui.practice.SayThePictureContent
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Say the picture, drawn offline from fixtures (no recorder, session, consent or network). The point of this test is
 * that the pieces the redesign is made of are really ON SCREEN with a size: the full-bleed photo, the mic ring and
 * Alphonso's pose. A source-level guard cannot tell a pose that is in the code from one that is drawn.
 */
@RunWith(AndroidJUnit4::class)
class SayThePictureVisualTest {
    @get:Rule val rule = createComposeRule()

    private val url = "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/x.jpg"
    private fun words(n: Int) = (0 until n).map { SayThePicture.PictureWord("word$it", VocabImageRef(url = url, alt = "alt$it", credit = "c")) }

    private fun SemanticsNodeInteraction.assertHasSize(): SemanticsNodeInteraction {
        val size = fetchSemanticsNode().size
        assertTrue("expected a drawn size, got $size", size.width > 0 && size.height > 0)
        return this
    }

    private fun show(session: SayPictureSession, phase: TurnPhase = TurnPhase.IDLE, canCapture: Boolean = true, save: SayPictureSave = SayPictureSave.Idle, onSayItRight: (List<com.obsidianmedia.learnwithalphonso.core.logic.VocabItem>) -> Unit = {}, onSave: () -> Unit = {}) {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                SayThePictureContent(
                    session = session, phase = phase, canCapture = canCapture, error = null, save = save, canSave = true, reduceMotion = true,
                    onExit = {}, onPressBegan = {}, onPressEnded = {}, onShowWord = {}, onNext = {}, onHear = {}, onRestart = {},
                    onSayItRight = onSayItRight, onSave = onSave, unavailable = {},
                )
            }
        }
        rule.waitForIdle()
    }

    // The pose and the recap cells sit under clearAndSetSemantics (decorative or read as one phrase for TalkBack), so
    // they exist only in the unmerged tree; that is where the test looks for them.
    private fun awaitPose() {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag("stp-pose-image", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun askShowsTheFullBleedPhotoTheMicRingAndTheExplainingPose() {
        show(SayPictureSession(words(8)))
        val screen = rule.onNodeWithTag("say-the-picture").assertHasSize()
        val hero = rule.onNodeWithTag("stp-hero").assertIsDisplayed().assertHasSize()
        // Full-bleed: the photo fills the whole screen, not a boxed thumbnail.
        assertEquals(screen.fetchSemanticsNode().size, hero.fetchSemanticsNode().size)
        rule.onNodeWithTag("stp-mic").assertIsDisplayed().assertHasSize()
        awaitPose()
        rule.onNodeWithTag("stp-pose", useUnmergedTree = true).assertIsDisplayed().assertHasSize()
        rule.onNodeWithTag("stp-pose-image", useUnmergedTree = true).assertIsDisplayed().assertHasSize()
        rule.onNodeWithTag("stp-stage").assertIsDisplayed().assertHasSize()
        rule.onNodeWithText("Show me the word").assertIsDisplayed()
        // The word is not given away while asking.
        assertTrue(rule.onAllNodesWithTag("stp-reveal").fetchSemanticsNodes().isEmpty())
    }

    @Test fun aMissRevealsTheWordOnThePhotoWithThePoseAndHearIt() {
        val s = SayPictureSession(words(8)).showWord()
        assertEquals(SayPicturePhase.REVEAL, s.phase)
        show(s)
        rule.onNodeWithTag("stp-reveal").assertIsDisplayed().assertHasSize()
        rule.onNodeWithText("word0").assertIsDisplayed()
        rule.onNodeWithText("Hear it").assertIsDisplayed()
        awaitPose()
        rule.onNodeWithTag("stp-pose-image", useUnmergedTree = true).assertHasSize()
    }

    @Test fun aWinStampsTheWordAndShowsTheComboChip() {
        val s = SayPictureSession(words(8)).submit("word0", Course.ENGLISH).first
        assertEquals(SayPicturePhase.RIGHT, s.phase)
        show(s)
        rule.onNodeWithTag("stp-win").assertIsDisplayed().assertHasSize()
        rule.onNodeWithTag("stp-combo").assertIsDisplayed()
        rule.onNodeWithText("word0").assertIsDisplayed()
        awaitPose()
        rule.onNodeWithTag("stp-pose-image", useUnmergedTree = true).assertHasSize()
    }

    @Test fun theSummaryShowsTheRecapAndBothCrossLinks() {
        var s = SayPictureSession(words(4))
        s = s.submit("word0", Course.ENGLISH).first.next()
        s = s.showWord().next()
        s = s.submit("word2", Course.ENGLISH).first.next()
        s = s.showWord().next()
        assertEquals(SayPicturePhase.DONE, s.phase)
        var drilled: List<String>? = null
        var saved = false
        show(s, onSayItRight = { drilled = it.map { w -> w.term } }, onSave = { saved = true })
        rule.onNodeWithTag("stp-recap").assertIsDisplayed().assertHasSize()
        assertEquals(2, rule.onAllNodesWithTag("stp-recap-first", useUnmergedTree = true).fetchSemanticsNodes().size)
        assertEquals(2, rule.onAllNodesWithTag("stp-recap-missed", useUnmergedTree = true).fetchSemanticsNodes().size)
        rule.onNodeWithText("Say it right the ones you missed").performScrollTo().performClick()
        rule.onNodeWithText("Add them to your review deck").performScrollTo().performClick()
        rule.runOnIdle {
            assertEquals(listOf("word1", "word3"), drilled)
            assertTrue(saved)
        }
    }

    @Test fun theRingStopsAndSendsWhenFull() {
        var began = 0
        var ended = 0
        rule.mainClock.autoAdvance = false
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                com.obsidianmedia.learnwithalphonso.ui.practice.StpMicRing(
                    recording = true, busy = false, size = androidx.compose.ui.unit.Dp(98f), reduceMotion = true,
                    onPressBegan = { began++ }, onPressEnded = { ended++ },
                )
            }
        }
        rule.mainClock.advanceTimeBy(SayThePicture.MAX_RECORD_MS - 100L)
        rule.runOnIdle { assertEquals(0, ended) }
        rule.mainClock.advanceTimeBy(300L)
        rule.runOnIdle { assertEquals(1, ended) }
    }
}
