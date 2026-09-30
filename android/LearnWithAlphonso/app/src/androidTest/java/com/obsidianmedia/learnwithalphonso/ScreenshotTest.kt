package com.obsidianmedia.learnwithalphonso

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.screenshot.Screenshot
import com.obsidianmedia.learnwithalphonso.auth.EncryptedSessionStore
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/**
 * Plan 5: the Play screenshot capture (play/screenshots.md), the Android
 * counterpart of ScreenshotTests.swift. Runs only when the release
 * workflow passes a minted demo session as instrumentation arguments
 * (`uiTestAccessToken`, `uiTestRefreshToken`, `uiTestUserId`,
 * `uiTestExpiresAt`); in the ordinary CI emulator job it is skipped, so it
 * never fails a build for lack of a session. Files land in the app's own
 * external files dir, which needs no storage permission, and the workflow
 * pulls them with adb.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotTest {
    private val args = InstrumentationRegistry.getArguments()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    /** Empty rule: the activity is launched by the test itself, after the session is seeded, so the launch restores it. */
    @get:Rule
    val compose = createEmptyComposeRule()

    @Before
    fun seedSession() {
        val access = args.getString("uiTestAccessToken")
        val refresh = args.getString("uiTestRefreshToken")
        val userId = args.getString("uiTestUserId")
        assumeTrue("no demo session passed; screenshot capture skipped", !access.isNullOrBlank() && !refresh.isNullOrBlank() && !userId.isNullOrBlank())
        val expiresAt = args.getString("uiTestExpiresAt")?.toLongOrNull() ?: (System.currentTimeMillis() / 1000 + 3600)
        EncryptedSessionStore(context).save(SupabaseSession(access!!, refresh!!, expiresAt, userId!!))
    }

    @Test
    fun captureStoreScreenshots() {
        ActivityScenario.launch(MainActivity::class.java)
        waitForText("Learn", 30_000)
        // The level chips and the status header arrive from the network after the tab; give them a moment.
        Thread.sleep(3_000)
        shot("01-learn")
        tab("Listen"); waitForText("Listen", 15_000); shot("04-listen")
        tab("Practice"); waitForText("Practice", 15_000); shot("05-practice")
        tab("Hector"); waitForText("Hector", 15_000); shot("06-hector")
        tab("Profile"); waitForText("Profile", 15_000); shot("07-profile")
        tab("Learn"); waitForText("Learn", 15_000)
    }

    /** The tab item is the clickable node carrying the label; the screen header is not. */
    private fun tab(label: String) = compose.onNode(hasText(label) and hasClickAction()).performClick()

    private fun waitForText(text: String, timeoutMillis: Long) {
        compose.waitUntil(timeoutMillis) { compose.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun shot(name: String) {
        Thread.sleep(800)
        val dir = File(context.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        val bitmap = Screenshot.capture().bitmap
        FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
}
