package com.obsidianmedia.learnwithalphonso.ui

import android.graphics.Bitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.screenshot.Screenshot
import com.obsidianmedia.learnwithalphonso.audio.AudioPlayback
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeController
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.VoicePhase
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState
import com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation
import com.obsidianmedia.learnwithalphonso.ui.practice.call.PracticeCallScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.call.alphonsoKit
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Screenshots of the hands-free call in the three looks (Royal light, Royal night, Meadow): the call with its status
 * pill and Pause button, a paused call, the conversation sheet with the switch, and the first-use note. Offline: a fake
 * conversation, no session, no microphone, no network.
 */
@RunWith(AndroidJUnit4::class)
class HandsFreeCallVisualTest {
    @get:Rule val rule = createComposeRule()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    private class NoRecorder : RecorderPort {
        override fun start() {}
        override fun remainingMillisToMinimumDuration(): Long? = null
        override fun elapsedMillis(): Long? = null
        override suspend fun stop(): ByteArray? = null
        override fun cancelIfRecording() {}
    }

    private class FakeCall(turns: List<ChatMessage>) : CallConversation {
        override val state: StateFlow<ConversationUiState> = MutableStateFlow(ConversationUiState(turns = turns))
        override val engine = ConversationTurnEngine(NoRecorder(), { true }, { _, _ -> throw IllegalStateException() }, CoroutineScope(SupervisorJob() + Dispatchers.Main))
        override fun micLevelDBFS(): Double? = null
        override fun pressBegan() {}
        override fun pressEnded() {}
        override val handsFree = HandsFreeController(HandsFreeLoop.Tuning.PRACTICE) {}
    }

    private fun look(name: String, theme: AlphonsoThemeId, dark: Boolean) {
        // The note is shown once per device: forget that it was, so every look draws it.
        (context.applicationContext as com.obsidianmedia.learnwithalphonso.AlphonsoApplication).container.prefs.edit()
            .remove(com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeCopy.NOTE_SEEN_KEY).commit()
        val call = FakeCall(listOf(ChatMessage("assistant", "Hello! What would you like to order today?")))
        // The call has infinite animations and a running clock: the test clock is advanced by hand, from before the content is set.
        rule.mainClock.autoAdvance = false
        rule.setContent {
            AlphonsoTheme(theme, dark) {
                PracticeCallScreen(
                    kit = alphonsoKit(context), title = "Ordering coffee", scenarioId = "coffee", course = Course.ENGLISH,
                    vm = call, playback = AudioPlayback(context), reducedMotion = true, onEnd = {}, statusHost = {},
                    transcript = { androidx.compose.material3.Text("Alphonso: Hello! What would you like to order today?") },
                )
            }
        }
        settle()
        shot("$name-0-off")
        // The switch is in the conversation sheet.
        rule.onNodeWithContentDescription("Show the conversation").performClick()
        settle()
        shot("$name-1-sheet")
        rule.onNodeWithText("Hands-free").performClick()
        settle()
        shot("$name-2-note")
        // The dialog is its own window; a semantic click avoids touch injection into it.
        rule.onNodeWithText("Turn on hands-free").performSemanticsAction(SemanticsActions.OnClick)
        rule.runOnUiThread { call.handsFree.phase(VoicePhase.RECORDING) }
        settle()
        shot("$name-3-sheet-on")
        rule.onNodeWithText("Back to call").performClick()
        settle()
        shot("$name-4-listening")
        rule.runOnUiThread {
            var t = 0.0
            while (t < 0.5) { call.handsFree.level(-60.0, t); t += 0.1 }
            while (t < 1.5) { call.handsFree.level(-20.0, t); t += 0.1 }
        }
        settle()
        shot("$name-5-hearing")
        rule.runOnUiThread { call.handsFree.phase(VoicePhase.THINKING) }
        settle()
        shot("$name-6-waiting")
        rule.runOnUiThread { call.handsFree.turnHadNoWords() }
        settle()
        shot("$name-7-paused")
    }

    @Test fun royalLight() = look("royal-light", AlphonsoThemeId.DEFAULT, false)
    @Test fun royalNight() = look("royal-night", AlphonsoThemeId.DEFAULT, true)
    @Test fun meadow() = look("meadow", AlphonsoThemeId.MEADOW, false)

    private fun settle() { rule.mainClock.advanceTimeBy(900) }

    private fun shot(name: String) {
        settle()
        Thread.sleep(400)
        val dir = File(context.getExternalFilesDir(null), "handsfree-shots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { Screenshot.capture().bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
