package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoPalettes
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Port of SettingsView.swift's theme, account and sign-out sections. Display name and avatar arrive with Plan 2. */
@Composable
fun SettingsScreen(container: AppContainer, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val theme by container.themeManager.theme.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    var exportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDelete by remember { mutableStateOf(false) }
    var confirmText by remember { mutableStateOf("") }

    val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val bytes = exportBytes
        if (uri != null && bytes != null) {
            runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }.onFailure { error = "Couldn't save the export. Try again." }
        }
        exportBytes = null
    }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
            Text("Settings", style = MaterialTheme.typography.titleMedium, color = palette.ink)
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Section("Theme") {
                AlphonsoThemeId.entries.forEach { id ->
                    val p = AlphonsoPalettes.light.getValue(id)
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            container.themeManager.setTheme(id)
                            container.session.userId?.let { uid -> scope.launch { runCatching { container.progressClient.updateProfileTheme(id.raw, uid) } } }
                        }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(p.surface)) { Box(Modifier.size(28.dp, 14.dp).background(p.moss)) }
                        Text(id.displayName, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
                        if (theme == id) Text("✓", color = palette.moss, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Section("Account", footer = "Download the data in your Alphonso account, or permanently erase it.") {
                RowButton("Export My Data", enabled = !busy) {
                    scope.launch {
                        busy = true; error = null
                        val bytes = runCatching { withContext(Dispatchers.IO) { container.accountClient.exportMyData() } }.getOrNull()
                        busy = false
                        if (bytes == null) error = "Couldn't export your data. Try again."
                        else { exportBytes = bytes; saveExport.launch("alphonso-my-data.json") }
                    }
                }
                RowButton("Delete My Account", enabled = !busy, destructive = true) { confirmText = ""; showDelete = true }
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive) }
            }
            Section("About") {
                RowButton("Privacy Policy") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }
                RowButton("Terms of Use") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") }
                RowButton("Support") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/support") }
            }
            Section("Session") {
                RowButton("Sign out", destructive = true) { container.session.signOut() }
            }
        }
    }

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete your account?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("This permanently deletes your account, progress, streaks, achievements, and review history. It cannot be undone. Type DELETE to confirm.")
                    Text("This does not cancel an active Alphonso Pro subscription. Google Play bills that separately, so cancel it yourself in the Play Store under Subscriptions.")
                    OutlinedTextField(value = confirmText, onValueChange = { confirmText = it }, label = { Text("Type DELETE to confirm") }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(enabled = confirmText == "DELETE" && !busy, onClick = {
                    scope.launch {
                        busy = true; error = null
                        val ok = runCatching { container.accountClient.deleteMyAccount() }.isSuccess
                        busy = false
                        showDelete = false
                        if (ok) container.session.signOut() else error = "Couldn't delete your account. Try again."
                    }
                }) { Text("Delete Forever", color = palette.destructive) }
            },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Section(title: String, footer: String? = null, content: @Composable () -> Unit) {
    val palette = AlphonsoColor.palette
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        AlphonsoSectionHeader(title)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(horizontal = 12.dp, vertical = 4.dp)) { content() }
        footer?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
    }
}

@Composable
private fun RowButton(label: String, enabled: Boolean = true, destructive: Boolean = false, onClick: () -> Unit) {
    val palette = AlphonsoColor.palette
    Text(
        label,
        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
        color = if (destructive) palette.destructive else palette.ink,
        modifier = Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(vertical = 12.dp),
    )
}
