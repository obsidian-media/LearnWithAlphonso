package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.logic.SayItRight
import com.obsidianmedia.learnwithalphonso.ui.practice.StpMicRing
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Say the picture mic with real touches (the same rule as Say it right, #661): a quick tap latches the recording
 * on, a second tap stops it, and a real hold is hold-to-talk whose release sends. The ring measures the hold in wall
 * time, so the hold is a real sleep between the down and the up.
 */
@RunWith(AndroidJUnit4::class)
class SayThePictureMicLatchTest {
    @get:Rule val rule = createComposeRule()

    private var began = 0
    private var ended = 0
    private var recording by mutableStateOf(false)

    private fun show() {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                StpMicRing(
                    recording = recording, busy = false, size = 98.dp, reduceMotion = true,
                    onPressBegan = { began++; recording = true },
                    onPressEnded = { ended++; recording = false },
                )
            }
        }
        rule.waitForIdle()
    }

    // The ring is a Role.Button whose inner glyph is under clearAndSetSemantics; the tag sits on the ring itself.
    private fun press(holdMs: Long) {
        val mic = rule.onNodeWithTag("stp-mic", useUnmergedTree = true)
        mic.performTouchInput { down(center) }
        rule.waitForIdle()
        Thread.sleep(holdMs)
        mic.performTouchInput { up() }
        rule.waitForIdle()
    }

    @Test fun aQuickTapLatchesTheRecordingOnAndASecondTapStopsIt() {
        show()
        press(40)
        assertEquals("the tap starts recording", 1, began)
        assertEquals("a quick tap does not send", 0, ended)
        press(40)
        assertEquals("the second tap stops and sends", 1, ended)
    }

    @Test fun aRealHoldSendsOnRelease() {
        show()
        press(SayItRight.LATCH_MS + 250)
        assertEquals(1, began)
        assertEquals("letting go of a hold sends", 1, ended)
    }
}
