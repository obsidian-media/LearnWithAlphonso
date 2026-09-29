package com.obsidianmedia.learnwithalphonso

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
import com.obsidianmedia.learnwithalphonso.ui.RootScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as AlphonsoApplication).container
    private var pendingInviteCode by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleOAuthCallback(intent)
        handleInviteLink(intent)
        setContent {
            val themeId by container.themeManager.theme.collectAsState()
            AlphonsoTheme(themeId, isSystemInDarkTheme()) {
                RootScreen(container, pendingInviteCode, onInviteConsumed = { pendingInviteCode = null })
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
        val segments = uri.pathSegments
        if (segments.size == 2 && segments[0] == "invite" && segments[1].isNotBlank()) {
            pendingInviteCode = segments[1]
            intent.action = null
        }
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { container.syncCoordinator.triggerSync() }
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
