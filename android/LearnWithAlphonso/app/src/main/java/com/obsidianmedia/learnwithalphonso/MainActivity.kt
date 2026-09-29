package com.obsidianmedia.learnwithalphonso

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import com.obsidianmedia.learnwithalphonso.ui.RootScreen
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as AlphonsoApplication).container

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleOAuthCallback(intent)
        setContent {
            val themeId by container.themeManager.theme.collectAsState()
            AlphonsoTheme(themeId, isSystemInDarkTheme()) {
                RootScreen(container)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthCallback(intent)
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
