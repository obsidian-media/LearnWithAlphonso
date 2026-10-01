package com.obsidianmedia.learnwithalphonso.auth

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.browser.customtabs.CustomTabsIntent
import com.obsidianmedia.learnwithalphonso.MainActivity

object GoogleSignIn {
    const val REDIRECT_URI = "com.obsidianmedia.learnwithalphonso://login-callback"

    /** Opens Supabase's Google authorize URL in a Custom Tab; the OS routes the redirect back to OAuthCallbackActivity. */
    fun launch(activity: Activity, authorizeUrl: String) {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, Uri.parse(authorizeUrl))
    }
}

/**
 * Receives the `com.obsidianmedia.learnwithalphonso://login-callback` redirect
 * and hands the URI to MainActivity (singleTask), which completes the PKCE
 * exchange. Nothing here trusts the URI: the code is only useful together
 * with the verifier SessionManager kept in memory.
 */
class OAuthCallbackActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val callback = intent?.data
        val forward = Intent(this, MainActivity::class.java).apply {
            action = MainActivity.ACTION_OAUTH_CALLBACK
            data = callback
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(forward)
        finish()
    }
}
