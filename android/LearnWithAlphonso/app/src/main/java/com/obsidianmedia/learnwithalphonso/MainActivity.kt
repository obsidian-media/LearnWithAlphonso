package com.obsidianmedia.learnwithalphonso

import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.obsidianmedia.learnwithalphonso.core.logic.InviteLink
import com.obsidianmedia.learnwithalphonso.core.logic.PushTap
import com.obsidianmedia.learnwithalphonso.core.logic.PushTapDestination
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralLink
import com.obsidianmedia.learnwithalphonso.core.auth.AuthState
import com.obsidianmedia.learnwithalphonso.core.logic.ReferralPending
import com.obsidianmedia.learnwithalphonso.core.net.TimeZoneReporter
import com.obsidianmedia.learnwithalphonso.core.net.setMyTimeZone
import com.obsidianmedia.learnwithalphonso.ui.RootScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoPalettes
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.SystemBars
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as AlphonsoApplication).container
    private var pendingInviteCode by mutableStateOf<String?>(null)
    /** A tapped "a person replied" notification waiting to open the Help chat (PushTap). */
    private var pendingHelp by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        container.micPermission.register(this)
        container.notificationPermission.register(this)
        handleOAuthCallback(intent)
        handleInviteLink(intent)
        handleReferralLink(intent)
        handlePushTap(intent)
        startTimeZoneSync()
        setContent {
            val themeId by container.themeManager.theme.collectAsState()
            val paletteId by container.themeManager.palette.collectAsState()
            val systemDark = isSystemInDarkTheme()
            // Meadow stays light in dark mode: light system bars (dark icons) so the status bar never turns dark on it.
            DisposableEffect(themeId, systemDark) {
                if (AlphonsoPalettes.systemBars(themeId) == SystemBars.LIGHT) {
                    enableEdgeToEdge(
                        statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                        navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                    )
                } else {
                    enableEdgeToEdge()
                }
                onDispose {}
            }
            AlphonsoTheme(themeId, systemDark, paletteId) {
                RootScreen(
                    container, pendingInviteCode, onInviteConsumed = { pendingInviteCode = null },
                    openHelp = pendingHelp, onHelpConsumed = { pendingHelp = false },
                    // DEBUG screenshots only: `adb shell am start -n ... --es firstRunHarness hector` (FirstRunHarness).
                    harness = if (BuildConfig.DEBUG) intent?.getStringExtra("firstRunHarness") else null,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthCallback(intent)
        handleInviteLink(intent)
        handleReferralLink(intent)
        handlePushTap(intent)
    }

    /**
     * A tap on a push notification: the type word the server sent travels in the launch intent (a closed or background
     * app) or on the notification the foreground handler posts. Only a support reply has a destination (PushTap).
     */
    private fun handlePushTap(intent: Intent?) {
        val type = intent?.getStringExtra(PushTap.EXTRA_TYPE) ?: return
        if (PushTap.destination(type) == PushTapDestination.HELP) pendingHelp = true
        // Consumed: a rotation or a later onNewIntent must not open the chat a second time.
        intent.removeExtra(PushTap.EXTRA_TYPE)
    }

    /** https://learn.alphonsoecosystem.app/invite/{code}, opened as an App Link or from a share. */
    private fun handleInviteLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW || uri.scheme != "https") return
        val code = InviteLink.codeFrom(uri.pathSegments) ?: return
        pendingInviteCode = code
        intent.action = null
    }

    /**
     * https://learn.alphonsoecosystem.app/?ref=<code>: kept until the account exists (the first code wins). The app link
     * association covers /invite/ only today, so this waits on that infra; the manual code field is the fallback.
     */
    private fun handleReferralLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW) return
        val code = ReferralLink.codeFromUrl(uri.toString()) ?: return
        ReferralPending.capture(code, container.referralStore, System.currentTimeMillis())
        intent.action = null
    }

    /**
     * Tells the server the device's time zone (so streaks and daily goals follow the learner's local day): on every
     * foreground and whenever a sign-in lands while the app is open, but only when it differs from the last zone sent
     * for this account (TimeZoneReporter). Forgotten on sign-out. Silent on any failure.
     */
    private fun startTimeZoneSync() {
        val prefs = container.prefs
        val reporter = TimeZoneReporter(
            read = { prefs.getString(TimeZoneReporter.KEY, null) },
            write = { v -> prefs.edit().apply { if (v == null) remove(TimeZoneReporter.KEY) else putString(TimeZoneReporter.KEY, v) }.apply() },
        )
        lifecycleScope.launch {
            // The state starts SignedOut until the stored session is restored; only a real sign-out forgets.
            var wasSignedIn = false
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                container.session.state.collect { state ->
                    if (FirstRunDevice.isBlocked) return@collect
                    if (state is AuthState.SignedIn) {
                        wasSignedIn = true
                        reporter.syncIfChanged(state.session.userId, java.time.ZoneId.systemDefault().id) {
                            container.progressClient.setMyTimeZone(it)
                        }
                    } else if (state is AuthState.SignedOut && wasSignedIn) {
                        wasSignedIn = false
                        reporter.forget()
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (FirstRunDevice.isBlocked) return
        lifecycleScope.launch { container.syncCoordinator.triggerSync() }
        lifecycleScope.launch { container.aiConsent.refresh() }
    }

    override fun onStop() {
        super.onStop()
        container.podcastPlayer.onBackground()
    }

    private fun handleOAuthCallback(intent: Intent?) {
        if (intent?.action != ACTION_OAUTH_CALLBACK) return
        val uri = intent.data?.toString() ?: return
        intent.action = null
        lifecycleScope.launch { container.session.completeGoogleSignIn(uri) }
    }

    companion object {
        const val ACTION_OAUTH_CALLBACK = "com.obsidianmedia.learnwithalphonso.OAUTH_CALLBACK"
    }
}
