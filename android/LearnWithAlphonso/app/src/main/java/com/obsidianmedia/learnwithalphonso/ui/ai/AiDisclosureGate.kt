package com.obsidianmedia.learnwithalphonso.ui.ai

import android.content.SharedPreferences
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Port of AIDisclosureGate.swift: acknowledged once per install, stored under the same key. */
object AiDisclosure {
    const val KEY = "aiDisclosureAcknowledged"
    fun isAcknowledged(prefs: SharedPreferences): Boolean = prefs.getBoolean(KEY, false)
    fun acknowledge(prefs: SharedPreferences) = prefs.edit().putBoolean(KEY, true).apply()
}

/**
 * Shows the disclosure once, non-dismissable, before any screen that sends
 * audio or written answers to an AI provider. Wrap the screen's content.
 */
@Composable
fun AiDisclosureGate(prefs: SharedPreferences, content: @Composable () -> Unit) {
    var show by remember { mutableStateOf(!AiDisclosure.isAcknowledged(prefs)) }
    val palette = AlphonsoColor.palette
    val uriHandler = LocalUriHandler.current
    content()
    if (show) {
        AlertDialog(
            onDismissRequest = { },
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
            title = { Text("How Alphonso uses AI", textAlign = TextAlign.Center) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Your voice recordings, and written answers you submit for grading, are sent to our speech-processing and AI providers so Alphonso can transcribe your speech and check your answers.",
                        style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center,
                    )
                    TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }) { Text("Read our Privacy Policy", color = palette.moss) }
                }
            },
            confirmButton = { AlphonsoPrimaryButton("Got it", onClick = { AiDisclosure.acknowledge(prefs); show = false }, fullWidth = false) },
        )
    }
}
