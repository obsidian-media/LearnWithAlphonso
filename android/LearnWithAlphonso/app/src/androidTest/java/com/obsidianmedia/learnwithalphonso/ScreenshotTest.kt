package com.obsidianmedia.learnwithalphonso

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelected
import com.obsidianmedia.learnwithalphonso.core.firstrun.CompleteProfileSkip
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.screenshot.Screenshot
import com.obsidianmedia.learnwithalphonso.auth.EncryptedSessionStore
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import kotlinx.coroutines.runBlocking
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
        // The app restores its session once, in AppContainer's init at process start, which is before this test runs
        // and finds the store empty: the app then shows the signed-out first-run questions (run 45560942267). Restore
        // again now that the demo session is stored, exactly as a cold launch of a signed-in learner would.
        val app = context.applicationContext as AlphonsoApplication
        runBlocking { app.container.session.restore() }
        // The demo account has not completed or dismissed Complete your profile, which covers the whole app. Its Not now
        // holds for the launch in memory only and also saves a dismissal to the account; this sets only the in-memory
        // part, so the test never writes to the demo account. App behaviour for real users is untouched.
        CompleteProfileSkip.skipThisLaunch()
    }

    @Test
    fun captureStoreScreenshots() {
        try {
            captureAll()
        } catch (t: Throwable) {
            // Leave evidence next to the screenshots: what was on screen and the semantics tree, so a red run says why.
            runCatching { shot("zz-failure") }
            runCatching {
                val dir = File(context.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
                File(dir, "zz-failure-tree.txt").writeText(t.toString() + System.lineSeparator() + compose.onRoot(useUnmergedTree = true).printToString(maxDepth = 40))
            }
            throw t
        }
    }

    private fun captureAll() {
        ActivityScenario.launch(MainActivity::class.java)
        onScreen("Learn", 45_000)
        // The level chips and the status header arrive from the network after the tab; give them a moment.
        Thread.sleep(3_000)
        onScreen("Learn"); shot("01-learn")
        // A second Learn capture after the first sync has had time to fill the status header.
        Thread.sleep(6_000)
        onScreen("Learn"); shot("01b-learn-settled")
        tab("Library"); onScreen("Library"); shot("04-listen")
        tab("Practice"); onScreen("Practice"); shot("05-practice")
        tab("Hector"); onScreen("Hector"); shot("06-hector")
        tab("Profile"); onScreen("Profile"); shot("07-profile")
        tab("Learn"); onScreen("Learn")
    }

    /** The tab item is the clickable node carrying the label; the screen header is not. */
    private fun tab(label: String) = compose.onNode(hasText(label) and hasClickAction() and !isSelected()).performClick()

    /**
     * Fails (so the zz-failure evidence is written) unless the app is really on [label]'s screen: the tab bar exists, which
     * the first-run questions and Complete your profile cover never show, and that tab is the selected destination. The
     * header text is not enough: "Learn" is also a substring of "Why are you learning English?" (run 45567728620).
     * Then it waits for every progress indicator to go, so a spinner is never captured.
     */
    private fun onScreen(label: String, timeoutMillis: Long = 20_000) {
        compose.waitUntil(timeoutMillis) {
            compose.onAllNodes(hasText(label) and hasClickAction() and isSelected()).fetchSemanticsNodes().isNotEmpty()
        }
        compose.waitUntil(timeoutMillis) {
            compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)).fetchSemanticsNodes().isEmpty()
        }
    }

    private fun shot(name: String) {
        Thread.sleep(800)
        val dir = File(context.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        val bitmap = Screenshot.capture().bitmap
        FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
}
