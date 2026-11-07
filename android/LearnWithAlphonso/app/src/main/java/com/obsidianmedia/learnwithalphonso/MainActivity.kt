package com.obsidianmedia.learnwithalphonso

import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.obsidianmedia.learnwithalphonso.core.logic.InviteLink
import com.obsidianmedia.learnwithalphonso.ui.RootScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as AlphonsoApplication).container
    private var pendingInviteCode by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        container.micPermission.register(this)
        container.notificationPermission.register(this)
        handleOAuthCallback(intent)
        handleInviteLink(intent)
        setContent {
            val themeId by container.themeManager.theme.collectAsState()
            val paletteId by container.themeManager.palette.collectAsState()
            AlphonsoTheme(themeId, isSystemInDarkTheme(), paletteId) {
                RootScreen(
                    container, pendingInviteCode, onInviteConsumed = { pendingInviteCode = null },
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
    }

    /** https://learn.alphonsoecosystem.app/invite/{code}, opened as an App Link or from a share. */
    private fun handleInviteLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW || uri.scheme != "https") return
        val code = InviteLink.codeFrom(uri.pathSegments) ?: return
        pendingInviteCode = code
        intent.action = null
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
