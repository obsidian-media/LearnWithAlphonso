package com.obsidianmedia.learnwithalphonso.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.screenshot.Screenshot
import com.obsidianmedia.learnwithalphonso.core.content.*
import com.obsidianmedia.learnwithalphonso.core.logic.*
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeHubContent
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeReplyBar
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeResultScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    /**
     * A real render, not a source check: every section of the hub is on screen with a real size (a sibling PR shipped
     * cards of about zero height that every source guard passed). The hero, the conversations grid, the campaigns
     * rail, both drills and the Pro nudge each get a minimum height; the carousel works through its dots.
     */
    @Test fun hubSectionsRenderWithRealSize() {
        val scale = mutableStateOf(1f)
        rule.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, scale.value)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                    PracticeHubContent(course, content.scenarios(course), content.campaigns(course), hub, false, "call", true, {}, { _, _ -> }, { _, _, _ -> }, {})
                }
            }
        }
        fun minPx(dp: Int) = with(rule.density) { dp.dp.toPx() }
        fun assertSized(tag: String, minHeightDp: Int, minWidthDp: Int = 40) {
            rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag(tag))
            val node = rule.onNodeWithTag(tag).assertIsDisplayed().fetchSemanticsNode()
            assertTrue("$tag is ${node.size.width}x${node.size.height}px, under ${minHeightDp}dp tall", node.size.height >= minPx(minHeightDp) && node.size.width >= minPx(minWidthDp))
        }
        // The hero: the continue card first (the fixture has a campaign in progress), both answers, the dots.
        assertSized("practice-hero", 300, 200)
        assertSized("practice-hero-card-0", 300, 200)
        assertSized("practice-continue", 48, 48)
        assertSized("practice-hero-chat-0", 48, 48)
        for (i in 0..2) rule.onNodeWithTag("practice-hero-dot-$i").assertExists()
        rule.onNodeWithTag("practice-hero-dot-1").performClick()
        rule.waitForIdle()
        assertSized("practice-hero-card-1", 300, 200)
        rule.onNodeWithTag("practice-hero-dot-1").assertContentDescriptionEquals("Show call 2 of 3")
        // The conversations grid, the campaigns rail, both drills and the nudge.
        assertSized("practice-tile-coffee", 100, 100)
        assertSized("practice-campaign-rail", 100, 150)
        assertSized("practice-campaign-doctors-visit", 100, 100)
        assertSized("practice-say-picture", 80, 200)
        assertSized("practice-say-it-right", 80, 200)
        assertSized("practice-hector-card", 60, 200)
        shot("04-hub-sections")
        // Large text: the hero's answers stay reachable.
        rule.runOnIdle { scale.value = 2f }
        rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag("practice-hero-chat-0"))
        rule.onNodeWithTag("practice-hero-chat-0").assertIsDisplayed()
        rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag("practice-say-it-right"))
        rule.onNodeWithTag("practice-say-it-right").assertIsDisplayed()
        shot("05-hub-large-text")
    }

    /** The campaign's detail (the pre-call sheet) lists every scene with the stars it holds; the rail carries no stars. */
    @Test fun campaignDetailListsSceneStars() {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                PracticeHubContent(course, content.scenarios(course), content.campaigns(course), hub, false, "call", true, {}, { _, _ -> }, { _, _, _ -> }, {})
            }
        }
        rule.onNodeWithTag("practice-hub").performScrollToNode(hasTestTag("practice-campaign-doctors-visit"))
        rule.onNodeWithTag("practice-campaign-doctors-visit").performClick()
        rule.onNodeWithTag("practice-pre-call").performScrollToNode(hasTestTag("practice-campaign-scenes"))
        rule.onNodeWithTag("practice-campaign-scenes").assertIsDisplayed()
        rule.onNodeWithContentDescription("Scene 1, ${content.campaigns(course).first { it.id == "doctors-visit" }.scenes[0].title}, 3 of 3 stars").assertExists()
        shot("06-campaign-detail")
    }

    @Test fun resultAwardsAndLargeTextRemainReachable() {
        val stars = mutableStateOf(1)
        val scale = mutableStateOf(1f)
        rule.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, scale.value)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                    val result = PracticeResult("scenario", "coffee", stars.value, 3, 3, 8, if (stars.value == 3) 8 else if (stars.value == 2) 7 else 5, 0, 0, 3)
                    PracticeResultScreen(result, "coffee", "es", 232, "Soy cansado hoy" to "Está cansado. Entonces un café bien cargado.", com.obsidianmedia.learnwithalphonso.core.logic.PracticeResultContext.Scenario, {}, {})
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

    /** Round 13: the 0-star result, a campaign scene's result (Next scene) and the chat-mode reply bar, light and night. */
    @Test fun round13ResultStatesAndReplyBar() {
        val night = mutableStateOf(false)
        val which = mutableStateOf(0)
        val typed = mutableStateOf("")
        val none = PracticeResult("scenario", "coffee", 0, 0, 0, 1, 1, 0, 0, 3)
        val two = PracticeResult("scene", "city-day/coffee-stop", 2, 0, 2, 8, 7, 0, 0, 3)
        val three = PracticeResult("scene", "city-day/coffee-stop", 3, 2, 3, 8, 8, 0, 0, 3)
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.DEFAULT, night.value) {
                when (which.value) {
                    0 -> PracticeResultScreen(none, "coffee", "es", 38, null, PracticeResultContext.Scenario, {}, {})
                    1 -> PracticeResultScreen(two, "coffee", "es", 232, "Soy cansado hoy" to "Está cansado. Entonces un café bien cargado.", PracticeResultContext.CampaignScene(isLast = false), {}, {})
                    2 -> PracticeResultScreen(three, "coffee", "es", 232, null, PracticeResultContext.CampaignScene(isLast = true), {}, {})
                    else -> androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().background(LocalAlphonsoTokens.current.surface), contentAlignment = androidx.compose.ui.Alignment.BottomCenter) {
                        PracticeReplyBar(typed.value, { typed.value = it }, PracticeHub.canSendReply(typed.value, pending = false)) {}
                    }
                }
            }
        }
        for (isNight in listOf(false, true)) {
            rule.runOnIdle { night.value = isNight }
            val tag = if (isNight) "night" else "light"
            rule.runOnIdle { which.value = 0 }
            // Top of the screen first, then the buttons: the list is longer than the screen.
            rule.onNodeWithTag("practice-result").performScrollToIndex(0)
            shot("r13-result-0-$tag")
            rule.onNodeWithTag("practice-result").performScrollToNode(hasText("Try again"))
            rule.onNodeWithText("Try again").assertIsDisplayed()
            rule.onNodeWithText("Done").assertIsDisplayed()
            shot("r13-result-0-actions-$tag")
            rule.runOnIdle { which.value = 1 }
            rule.onNodeWithTag("practice-result").performScrollToIndex(0)
            shot("r13-result-campaign-2-$tag")
            rule.onNodeWithTag("practice-result").performScrollToNode(hasText("Next scene"))
            rule.onNodeWithText("Next scene").assertIsDisplayed()
            rule.onNodeWithText("Try for 3").assertIsDisplayed()
            shot("r13-result-campaign-2-actions-$tag")
            rule.runOnIdle { which.value = 2 }
            rule.onNodeWithTag("practice-result").performScrollToIndex(0)
            shot("r13-result-campaign-last-3-$tag")
            rule.onNodeWithTag("practice-result").performScrollToNode(hasText("Finish campaign"))
            rule.onNodeWithText("Finish campaign").assertIsDisplayed()
            rule.onAllNodesWithText("Play again").assertCountEquals(0)
            shot("r13-result-campaign-last-3-actions-$tag")
            rule.runOnIdle { which.value = 3; typed.value = "" }
            rule.onNodeWithContentDescription("Send").assertExists()
            shot("r13-replybar-empty-$tag")
            rule.runOnIdle { typed.value = "I would like a large coffee please, and a croissant." }
            rule.onNodeWithContentDescription("Send").assertExists()
            shot("r13-replybar-typed-$tag")
        }
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        Thread.sleep(250)
        val dir = File(context.getExternalFilesDir(null), "practice-shots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { Screenshot.capture().bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
