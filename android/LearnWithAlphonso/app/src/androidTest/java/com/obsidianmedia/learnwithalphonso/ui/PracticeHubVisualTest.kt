package com.obsidianmedia.learnwithalphonso.ui

import android.graphics.Bitmap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.screenshot.Screenshot
import com.obsidianmedia.learnwithalphonso.core.content.*
import com.obsidianmedia.learnwithalphonso.core.logic.*
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeHubContent
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeResultScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.*
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Offline fixtures: no session, consent, microphone, chat or production writes. */
@RunWith(AndroidJUnit4::class)
class PracticeHubVisualTest {
    @get:Rule val rule = createComposeRule()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val content by lazy { ContentStore { context.assets.open(it).bufferedReader().use { r -> r.readText() } } }
    private val course = Course.SPANISH
    private val hub = PracticeHubData(
        stars = listOf(PracticeStarRow("scene", "doctors-visit/doctor-book-phone", 3, "2026-11-07T01:00:00Z")),
        cefrLevel = "A1",
        weaknessEvents = listOf(PracticeWeaknessEvent("spelling", "detected", "3"), PracticeWeaknessEvent("spelling", "detected", "2"), PracticeWeaknessEvent("prepositions", "detected", "1")),
    )

    @Test fun hubContinueSheetAndAdvancedChips() {
        var opened: Triple<String, Int, String>? = null
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                PracticeHubContent(course, content.scenarios(course), content.campaigns(course), hub, false, "call", true,
                    {}, { _, _ -> }, { id, scene, mode -> opened = Triple(id, scene, mode) }, {})
            }
        }
        rule.waitForIdle()
        shot("01-hub")
        rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag("practice-continue"))
        rule.onNodeWithTag("practice-continue").performClick()
        val scene = content.campaigns(course).first { it.id == "doctors-visit" }.scenes[1]
        rule.onNodeWithText(scene.opener).assertIsDisplayed()
        rule.onNodeWithText(scene.persona!!).assertIsDisplayed()
        shot("02-pre-call")
        rule.onNodeWithText("Chat (type)").performClick()
        rule.onNodeWithTag("practice-pre-call").performScrollToNode(hasText("Start the chat"))
        rule.onNodeWithText("Start the chat").performClick()
        rule.runOnIdle { assertEquals(Triple("doctors-visit", 1, "chat"), opened) }
        rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag("practice-level-Advanced"))
        rule.onNodeWithTag("practice-level-Advanced").performScrollTo().performClick()
        shot("03-advanced")
    }

    @Test fun resultAwardsAndLargeTextRemainReachable() {
        val stars = mutableStateOf(1)
        val scale = mutableStateOf(1f)
        rule.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, scale.value)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                    val result = PracticeResult("scenario", "coffee", stars.value, 3, 3, 8, if (stars.value == 3) 8 else if (stars.value == 2) 7 else 5, 0, 0, 3)
                    PracticeResultScreen(result, "coffee", "es", 232, "Soy cansado hoy" to "Está cansado. Entonces un café bien cargado.", {}, "Done", {})
                }
            }
        }
        for (n in 1..3) {
            rule.runOnIdle { stars.value = n }
            rule.onNodeWithTag("practice-result").performScrollToIndex(0)
            rule.onNodeWithContentDescription("$n of 3 stars").assertExists()
            shot("0${n + 3}-result-$n")
        }
        rule.runOnIdle { stars.value = 2; scale.value = 2f }
        rule.onNodeWithTag("practice-result").performScrollToNode(hasText("Try for 3"))
        rule.onNodeWithText("Try for 3").assertIsDisplayed()
        rule.onNodeWithTag("practice-result").performScrollToNode(hasText("Done"))
        rule.onNodeWithText("Done").assertIsDisplayed()
        shot("07-large-text-actions")
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        Thread.sleep(250)
        val dir = File(context.getExternalFilesDir(null), "practice-shots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { Screenshot.capture().bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
