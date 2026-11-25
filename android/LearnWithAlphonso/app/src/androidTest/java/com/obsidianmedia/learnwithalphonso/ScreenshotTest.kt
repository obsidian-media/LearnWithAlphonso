package com.obsidianmedia.learnwithalphonso

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.getOrNull
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

    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    /** A text that is on the screen's own content, not the tab bar's label of the same name. */
    private fun heading(text: String) = hasText(text) and isHeading
    private fun tag(tag: String) = hasTestTag(tag)

    /** Per tab: something only that screen, loaded, shows (read from the screens' code), and the error texts it must not show. */
    private class Marker(val shown: List<Pair<String, SemanticsMatcher>>, val absent: List<String> = emptyList()) {
        constructor(shown: SemanticsMatcher, absent: List<String> = emptyList()) : this(listOf("content" to shown), absent)
    }

    private val markers = mapOf(
        "Learn" to Marker(heading("For you")),
        "Library" to Marker(hasText("Library") and !hasClickAction()),
        "Practice" to Marker(heading("Practice"), absent = listOf("Could not load Practice.")),
        // A Pro account sees the tutor (hector-header); an account without Pro sees the paywall, which is also what a
        // store listing shows. The test does not grant Pro. Either way it is the real Hector tab, not an error.
        "Hector" to Marker(listOf("tutor header" to tag("hector-header"), "paywall" to heading("A tutor who remembers you."))),
        "Profile" to Marker(hasText("Edit your answers"), absent = listOf("Profile could not load.")),
    )

    /** Only a spinner with no value: determinate bars (Learn's "Unit progress") are content and never go away. */
    private val loadingSpinner = SemanticsMatcher("an indeterminate progress indicator") {
        it.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo) == ProgressBarRangeInfo.Indeterminate
    }

    /**
     * Fails (so the zz-failure evidence is written) unless the app is really on [label]'s screen: the tab bar exists, which
     * the first-run questions and Complete your profile cover never show, that tab is the selected destination, the
     * screen's own content marker is there (a selected tab showing an error state does not pass), and no loading spinner
     * remains. The header text alone is not enough: "Learn" is also a substring of "Why are you learning English?"
     * (run 45567728620).
     */
    private fun onScreen(label: String, timeoutMillis: Long = 30_000) {
        val marker = markers.getValue(label)
        compose.waitUntil(timeoutMillis) {
            compose.onAllNodes(hasText(label) and hasClickAction() and isSelected()).fetchSemanticsNodes().isNotEmpty()
        }
        compose.waitUntil(timeoutMillis) { marker.shown.any { (_, m) -> compose.onAllNodes(m).fetchSemanticsNodes().isNotEmpty() } }
        val seen = marker.shown.first { (_, m) -> compose.onAllNodes(m).fetchSemanticsNodes().isNotEmpty() }.first
        android.util.Log.i("ScreenshotTest", "$label: saw the $seen marker")
        compose.waitUntil(timeoutMillis) { compose.onAllNodes(loadingSpinner).fetchSemanticsNodes().isEmpty() }
        marker.absent.forEach { text ->
            check(compose.onAllNodes(hasText(text)).fetchSemanticsNodes().isEmpty()) { "$label shows its error state: $text" }
        }
    }

    private fun shot(name: String) {
        Thread.sleep(800)
        val dir = File(context.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        val bitmap = Screenshot.capture().bitmap
        FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
}
