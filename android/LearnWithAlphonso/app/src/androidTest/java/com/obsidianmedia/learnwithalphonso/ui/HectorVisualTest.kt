package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.HectorChips
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrection
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorChipRow
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorCorrectionCard
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorComposer
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorHeader
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorStatusUi
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Offline fixtures: the Hector shell's header, chips and composer with no session, consent, microphone or network. */
@RunWith(AndroidJUnit4::class)
class HectorVisualTest {
    @get:Rule val rule = createComposeRule()

    private fun assertRealSize(tag: String, minW: Int = 8, minH: Int = 8, unmerged: Boolean = false) {
        val b = rule.onNodeWithTag(tag, useUnmergedTree = unmerged).fetchSemanticsNode().boundsInRoot
        assertTrue("$tag has a real size, was ${b.width} x ${b.height}", b.width >= minW && b.height >= minH)
    }

    @Test fun headerChipsAndComposerHaveRealSize() {
        var status by mutableStateOf(HectorStatusUi.READY)
        var listening by mutableStateOf(false)
        var text by mutableStateOf("")
        var sent: String? = null
        var tappedChip: String? = null
        val chips = HectorChips.build(Course.ENGLISH, "past-tense", 12)
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                Column(Modifier.fillMaxSize()) {
                    HectorHeader("English", status, onBack = {}, reducedMotion = true, menu = { _ -> Text("Hands-free") })
                    LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("scroll")) {
                        items(listOf(0)) { HectorChipRow(chips, true, { tappedChip = it.id }) }
                    }
                    HectorComposer(listening, false, text, { text = it }, { sent = text; text = "" }, { listening = true }, { listening = false }, { -30.0 }, true)
                }
            }
        }
        rule.waitForIdle()
        // The header: the figure stands on the gradient with a real size, and the status is announced as a sentence.
        assertRealSize("hector-header", 100, 100)
        assertRealSize("hector-figure", 60, 60)
        rule.onNodeWithTag("hector-status").assertContentDescriptionEquals("Hector is ready")
        rule.runOnIdle { status = HectorStatusUi.THINKING }
        rule.onNodeWithTag("hector-status").assertContentDescriptionEquals("Hector is thinking")
        // The chips: scroll to the row first, then each is a button of tappable size.
        rule.onNodeWithTag("scroll").performScrollToNode(hasTestTag("hector-chips"))
        for (c in chips) {
            rule.onNodeWithTag("hector-chip-${c.id}").assertHasClickAction()
            assertRealSize("hector-chip-${c.id}", 40, 40)
        }
        rule.onNodeWithTag("hector-chip-streak").performClick()
        rule.runOnIdle { assertEquals("streak", tappedChip) }
        // The composer, idle: the field and the gold mic; no send until there is text.
        assertRealSize("hector-composer", 200, 48)
        assertRealSize("hector-mic", 44, 44)
        rule.onNodeWithTag("hector-send").assertDoesNotExist()
        rule.onNodeWithTag("hector-field").performClick()
        rule.onNode(hasContentDescription("Message Hector")).performTextInput("I would like a coffee")
        assertRealSize("hector-send", 44, 44)
        rule.onNodeWithTag("hector-send").performClick()
        rule.runOnIdle { assertEquals("I would like a coffee", sent) }
        // Talking: the field becomes the Listening pill with its bars (under the cleared semantics, so unmerged) and a stop.
        rule.onNodeWithTag("hector-mic").performClick()
        rule.onNodeWithTag("hector-listening").assertIsDisplayed()
        assertRealSize("hector-wave", 20, 6, unmerged = true)
        assertRealSize("hector-stop", 44, 44)
        rule.onNodeWithTag("hector-stop").performClick()
        rule.onNodeWithTag("hector-field").assertIsDisplayed()
    }

    @Test fun largeTextKeepsEveryControlReachable() {
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, 2f)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                    Column(Modifier.fillMaxSize()) {
                        HectorHeader("Spanish", HectorStatusUi.LISTENING, onBack = {}, reducedMotion = true, menu = { _ -> })
                        HectorChipRow(HectorChips.FALLBACK, true, {})
                        HectorComposer(false, false, "", {}, {}, {}, {}, { null }, true)
                    }
                }
            }
        }
        rule.waitForIdle()
        rule.onNodeWithTag("hector-status").assertIsDisplayed()
        rule.onNodeWithTag("hector-mic").assertIsDisplayed()
        assertRealSize("hector-figure", 60, 60)
    }

    private class NoRecorder : com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort {
        override fun start() {}
        override fun remainingMillisToMinimumDuration(): Long? = null
        override fun elapsedMillis(): Long? = null
        override suspend fun stop(): ByteArray? = null
        override fun cancelIfRecording() {}
    }

    private class FakeCall : com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation {
        override val state: kotlinx.coroutines.flow.StateFlow<com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState> =
            kotlinx.coroutines.flow.MutableStateFlow(com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState())
        override val engine = com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine(
            NoRecorder(), { true }, { _, _ -> throw IllegalStateException() },
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main),
        )
        override fun micLevelDBFS(): Double? = null
        override fun pressBegan() {}
        override fun pressEnded() {}
        override val handsFree = com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeController(com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Tuning.HECTOR) {}
        override fun armAutoStartHandsFree(check: () -> Boolean) {}
    }

    /** The first-use note must survive the menu closing: open the menu, flip the switch, confirm, hands-free is on and visible. */
    @Test fun handsFreeSwitchInTheMenuReachesItsSafetyNoteAndTurnsOn() {
        val context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        (context.applicationContext as com.obsidianmedia.learnwithalphonso.AlphonsoApplication).container.prefs.edit()
            .remove(com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeCopy.NOTE_SEEN_KEY).commit()
        val call = FakeCall()
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                val status by call.handsFree.status.collectAsState()
                var showNote by remember { mutableStateOf(false) }
                Column(Modifier.fillMaxSize()) {
                    HectorHeader(
                        "English", HectorStatusUi.READY, onBack = null, reducedMotion = true,
                        menu = { dismiss -> com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeSwitch(call, "Hector", onNeedNote = { dismiss(); showNote = true }) },
                    )
                    if (showNote) com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeNoteDialog(call, "Hector") { showNote = false }
                    if (status != com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Status.Off) {
                        com.obsidianmedia.learnwithalphonso.ui.hector.HectorHandsFreeBar(status, onToggle = call.handsFree::togglePause)
                    }
                }
            }
        }
        rule.onNodeWithTag("hector-handsfree").assertDoesNotExist()
        rule.onNodeWithContentDescription("More options").performClick()
        rule.onNodeWithText("Hands-free").performClick()
        // The menu is gone, the note is not: it is on the screen, not in the menu.
        rule.onNodeWithText("Turn on hands-free").assertExists()
        rule.onNodeWithText("Turn on hands-free").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        rule.waitForIdle()
        rule.runOnIdle { assertTrue(call.handsFree.status.value != com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Status.Off) }
        // And the mic is never live unseen: the bar and its Pause button are on the classic screen.
        assertRealSize("hector-handsfree", 100, 24)
        assertRealSize("hector-handsfree-toggle", 44, 44)
        rule.onNodeWithContentDescription("Pause").assertHasClickAction()
    }

    @Test fun correctionCardHasRealSizeAndBothButtonsWork() {
        var heard = 0
        var again = 0
        var canHear by mutableStateOf(true)
        var hearEnabled by mutableStateOf(true)
        val correction = HectorCorrection("I will like", "I'd like", "We use I'd like to order politely.")
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                LazyColumn(Modifier.fillMaxSize().testTag("scroll")) {
                    items(listOf(0)) { HectorCorrectionCard(correction, canHear, true, hearEnabled, { heard++ }, { again++ }) }
                }
            }
        }
        rule.waitForIdle()
        // Scroll to the card first, then measure it: the tag, the struck-through line, the note and the buttons.
        rule.onNodeWithTag("scroll").performScrollToNode(hasTestTag("hector-correction"))
        assertRealSize("hector-correction", 200, 80)
        assertRealSize("hector-correction-tag", 60, 14, unmerged = true)
        // The line is one element for a screen reader; its drawn text is only in the unmerged tree.
        assertRealSize("hector-correction-line", 100, 12, unmerged = true)
        rule.onNodeWithTag("hector-correction-line", useUnmergedTree = true).assertContentDescriptionEquals("You said I will like; better: I'd like")
        assertRealSize("hector-correction-note", 60, 10, unmerged = true)
        assertRealSize("hector-hear-it", 44, 44)
        assertRealSize("hector-try-again", 44, 44)
        rule.onNodeWithTag("hector-hear-it").assertHasClickAction().assertContentDescriptionEquals("Hear it: I'd like").performClick()
        rule.onNodeWithTag("hector-try-again").assertHasClickAction().assertContentDescriptionEquals("Try again: say it once more").performClick()
        rule.runOnIdle { assertEquals(1, heard); assertEquals(1, again) }
        // The mic is open (hands-free listening): Hear it cannot be tapped, Try again still can.
        rule.runOnIdle { hearEnabled = false }
        rule.onNodeWithTag("hector-hear-it").assertIsNotEnabled()
        rule.runOnIdle { hearEnabled = true }
        // No device voice for the course: Hear it is left out, the written fix and Try again stay.
        rule.runOnIdle { canHear = false }
        rule.onNodeWithTag("hector-hear-it").assertDoesNotExist()
        rule.onNodeWithTag("hector-try-again").assertExists()
        assertRealSize("hector-correction-line", 100, 12, unmerged = true)
    }

    @Test fun statusMapsFromThePhases() {
        assertEquals(HectorStatusUi.READY, HectorStatusUi.from(TurnPhase.IDLE, ConversationPhase.IDLE))
        assertEquals(HectorStatusUi.LISTENING, HectorStatusUi.from(TurnPhase.RECORDING, ConversationPhase.IDLE))
        assertEquals(HectorStatusUi.THINKING, HectorStatusUi.from(TurnPhase.TRANSCRIBING, ConversationPhase.IDLE))
        assertEquals(HectorStatusUi.THINKING, HectorStatusUi.from(TurnPhase.IDLE, ConversationPhase.THINKING))
        assertEquals(HectorStatusUi.SPEAKING, HectorStatusUi.from(TurnPhase.IDLE, ConversationPhase.SPEAKING))
    }
}
