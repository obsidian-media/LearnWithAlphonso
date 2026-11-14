package com.obsidianmedia.learnwithalphonso.ui.settings

import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.obsidianmedia.learnwithalphonso.Analytics

private const val TITLE = "Share anonymous usage data"

/**
 * Optional usage analytics, off until the learner chooses it (first-sign-in step or this switch). Turning it off stops
 * sending at once and resets the anonymous id. Hidden in a build without a PostHog key.
 */
@Composable
internal fun AnalyticsSection() {
    if (!Analytics.isAvailable) return
    val ds = LocalAlphonsoTokens.current
    var on by remember { mutableStateOf(Analytics.hasConsent) }
    Section(TITLE, footer = "Which lessons and screens are used, never what you type or say, and never your name or email. Turn it off any time.") {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
            DsSwitch(checked = on, onChange = { wantsOn -> on = wantsOn; Analytics.setConsent(wantsOn) })
        }
    }
}
