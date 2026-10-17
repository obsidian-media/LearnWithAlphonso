package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The account's AI switch (profiles.ai_consent_at), same as the iOS Settings section and the web's AI features
 * setting. Turning it on is informed consent, so it opens the same sheet rather than writing silently; turning it off
 * withdraws at once. A setting that could not be read shows a retry, never a switch that reads "off".
 */
@Composable
internal fun AiFeaturesSection(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val store = container.aiConsent
    val consent by store.state.collectAsState()
    val status = store.statusOf(consent)
    val scope = rememberCoroutineScope()
    var updating by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var showConsent by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) { store.refresh() }
    LaunchedEffect(status) { error = null }

    Section(AiConsentCopy.settingsTitle, footer = AiConsentCopy.settingsFooter) {
        if (status == AiConsentStatus.UNAVAILABLE) {
            // The setting could not be read: say so and offer a retry.
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(AiConsentCopy.checkFailedTitle, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
                TextButton(onClick = { scope.launch { store.refresh() } }) { Text(AiConsentCopy.retry, color = palette.moss) }
            }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(AiConsentCopy.settingsTitle, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
                Switch(
                    checked = status == AiConsentStatus.GRANTED,
                    enabled = !updating && status != AiConsentStatus.LOADING,
                    onCheckedChange = { wantsOn ->
                        if (wantsOn) {
                            showConsent = true
                        } else {
                            updating = true; error = null
                            scope.launch {
                                try {
                                    store.set(false)
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = AiConsentCopy.saveFailed
                                } finally {
                                    updating = false
                                }
                            }
                        }
                    },
                )
            }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive) }
    }
    if (showConsent) AiConsentDialog(store, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
}
