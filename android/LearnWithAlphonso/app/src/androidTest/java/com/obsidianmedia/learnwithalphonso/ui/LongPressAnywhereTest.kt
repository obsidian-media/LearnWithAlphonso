package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.compose.runtime.mutableStateOf
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.ui.ai.longPressAnywhere
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** A long press over a word that is a link must still reach the report menu, and must not also tap the link. */
@RunWith(AndroidJUnit4::class)
class LongPressAnywhereTest {
    @get:Rule val rule = createComposeRule()

    private fun setUp(longPresses: () -> Unit, linkTaps: () -> Unit) {
        rule.setContent {
            Box(Modifier.longPressAnywhere { longPresses() }) {
                Text(
                    buildAnnotatedString { withLink(LinkAnnotation.Clickable("w") { linkTaps() }) { append("tea") } },
                    modifier = Modifier.testTag("text"),
                )
            }
        }
    }

    @Test
    fun longPressOverALinkReportsAndDoesNotTapIt() {
        var longPresses = 0
        var taps = 0
        setUp({ longPresses++ }, { taps++ })
        rule.onNodeWithTag("text").performTouchInput { longClick() }
        assertEquals(1, longPresses)
        assertEquals(0, taps)
    }

    @Test
    fun aShortTapStillTapsTheLinkAndIsNotALongPress() {
        var longPresses = 0
        var taps = 0
        setUp({ longPresses++ }, { taps++ })
        rule.onNodeWithTag("text").performClick()
        assertEquals(0, longPresses)
        assertEquals(1, taps)
    }
}
