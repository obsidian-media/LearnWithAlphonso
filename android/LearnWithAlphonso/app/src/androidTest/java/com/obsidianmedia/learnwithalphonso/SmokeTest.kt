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
    fun launchShowsTheSignInScreen() {
        compose.waitUntil(10_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Continue with Google")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Continue with Google").assertIsDisplayed()
    }
}
