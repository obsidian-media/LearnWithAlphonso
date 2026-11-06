package com.obsidianmedia.learnwithalphonso.ui.auth

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.obsidianmedia.learnwithalphonso.core.auth.BotCheckGate
import kotlinx.coroutines.delay

/** The bot check on the email form: the gate's state for Compose, plus the page to reset after a token is spent. */
class BotCheckState {
    private val gate = BotCheckGate()
    var canSend by mutableStateOf(gate.canSend)
        private set
    internal var webView: WebView? = null

    internal fun receive(json: String) {
        gate.receive(json)
        canSend = gate.canSend
    }

    internal fun pageTimedOut() {
        gate.pageTimedOut()
        canSend = gate.canSend
    }

    /** The token for one email request, or null without a bot check. A spent token makes the page render a new widget. */
    fun spend(): String? {
        val token = gate.spend()
        canSend = gate.canSend
        if (token != null) webView?.evaluateJavascript("window.alphonsoCaptchaReset && window.alphonsoCaptchaReset()", null)
        return token
    }
}

/**
 * Cloudflare Turnstile only runs in a web page, so the email form shows ours (`/native-captcha`) in a small WebView.
 * The page talks back only through the `AlphonsoCaptcha` JavaScript interface; navigation away from our site and
 * Cloudflare's challenge is refused.
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
@Composable
fun BotCheckWebView(state: BotCheckState, pageUrl: String) {
    val ownHost = Uri.parse(pageUrl).host
    LaunchedEffect(state) {
        delay(BotCheckGate.PAGE_TIMEOUT_MS)
        state.pageTimedOut()
    }
    AndroidView(
        modifier = Modifier.fillMaxWidth().height(70.dp).semantics { contentDescription = "Security check" },
        factory = { context ->
            WebView(context).apply {
                val webView = this
                setBackgroundColor(Color.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun post(json: String) {
                            // Called on a WebView thread; the state is Compose state, so hop to the main thread.
                            webView.post { state.receive(json) }
                        }
                    },
                    "AlphonsoCaptcha",
                )
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val host = request.url.host
                        return !(host == ownHost || host == "challenges.cloudflare.com")
                    }

                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) state.pageTimedOut()
                    }
                }
                state.webView = this
                loadUrl(pageUrl)
            }
        },
        onRelease = { webView ->
            if (state.webView === webView) state.webView = null
            webView.removeJavascriptInterface("AlphonsoCaptcha")
            webView.destroy()
        },
    )
}
