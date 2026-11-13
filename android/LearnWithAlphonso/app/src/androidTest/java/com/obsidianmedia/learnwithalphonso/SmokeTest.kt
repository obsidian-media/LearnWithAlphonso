package com.obsidianmedia.learnwithalphonso

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SmokeTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun launchShowsTheFirstQuestion() {
        // A signed-out launch opens the first-run questions (name first), not the sign-in screen: that comes after
        // the plan. This test waited for "Continue with Google" until then, and has failed on every emulator run
        // since the first-run flow became the front door. Wait for the first screen a fresh install really shows.
        compose.waitUntil(30_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Nice to meet you")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Nice to meet you").assertIsDisplayed()
        compose.onNodeWithText("Hi, I'm Alphonso! What should I call you?").assertIsDisplayed()
    }
}
