package com.obsidianmedia.learnwithalphonso.ui.settings

import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.fillMaxWidth
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDivider
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.AvatarPickerDialog
import com.obsidianmedia.learnwithalphonso.ui.firstrun.ProfileAvatar
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonLightScope
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoPalettes
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import com.obsidianmedia.learnwithalphonso.core.logic.ProLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Port of SettingsView.swift's theme, account and sign-out sections. Display name and avatar arrive with Plan 2. */
@Composable
fun SettingsScreen(container: AppContainer, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val theme by container.themeManager.theme.collectAsState()
    val identityVm: IdentityViewModel = viewModel { IdentityViewModel(container.progressClient, container.session.userId) }
    val identity by identityVm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    var exportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDelete by remember { mutableStateOf(false) }
    var confirmText by remember { mutableStateOf("") }
    var pickingAvatar by remember { mutableStateOf(false) }

    val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val bytes = exportBytes
        if (uri != null && bytes != null) {
            runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }.onFailure { error = "Couldn't save the export. Try again." }
        }
        exportBytes = null
    }

    DsSceneScreen(DsScene.PROFILE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Profile", onBack, showBack = false) { DsGlassChip("Done", onBack) }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Settings")
                Section("Profile", footer = "Your name and picture are visible to other learners on leaderboards, friends, and duels.") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        ProfileAvatar(identity.avatarSeed.ifEmpty { "a" }, identity.displayName, AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s4)
                        DsCompactButton("Change picture", { pickingAvatar = true })
                    }
                    DsField(identity.displayName, identityVm::editName, "Display name")
                    LessonEdgeButton("Save Name", EdgeVariant.PRIMARY, { identityVm.saveName() }, enabled = !identity.saving && identity.displayName.isNotBlank())
                    identity.error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
                }
                Section("Theme") {
                    DsChipRow {
                        AlphonsoThemeId.entries.forEach { id ->
                            val swatch = AlphonsoTokens.colors(com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoPaletteId.forTheme(id), false).brand
                            DsChip(
                                if (theme == id) "${id.displayName} ✓" else id.displayName, theme == id,
                                onClick = {
                                    container.themeManager.setTheme(id)
                                    container.session.userId?.let { uid -> scope.launch { runCatching { container.progressClient.updateProfileTheme(id.raw, uid) } } }
                                },
                                accessibilityText = if (theme == id) "${id.displayName}, selected" else id.displayName,
                                leading = { Box(Modifier.size(AlphonsoTokens.Space.s4).clip(CircleShape).background(swatch)) },
                            )
                        }
                    }
                }
                AvatarSection(container)
                SoundEffectsSection(container)
                val entitlement by container.entitlements.state.collectAsState()
                ProLabel.of(entitlement.isPro, entitlement.isGift)?.let { label ->
                    Section("Alphonso Pro") { Text(label, style = HeadlineType, color = ds.ink) }
                }
                ExplainSection(container)
                VoicesSection(container)
                AnalyticsSection()
                AiFeaturesSection(container)
                Section("Account", footer = null) {
                    Text("Download the data in your Alphonso account, or permanently erase it.", style = FootnoteType, color = ds.inkSoft)
                    Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        DsCompactButton("Export My Data", {
                            scope.launch {
                                busy = true; error = null
                                val bytes = runCatching { withContext(Dispatchers.IO) { container.accountClient.exportMyData() } }.getOrNull()
                                busy = false
                                if (bytes == null) error = "Couldn't export your data. Try again."
                                else { exportBytes = bytes; saveExport.launch("alphonso-my-data.json") }
                            }
                        }, enabled = !busy)
                        DsCompactButton("Delete My Account", { confirmText = ""; showDelete = true }, enabled = !busy, danger = true)
                    }
                    error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
                }
                DsCard(padding = AlphonsoTokens.Space.s2, spacing = 0.dp) {
                    RowButton("Privacy Policy") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }
                    DsDivider()
                    RowButton("Terms of Use") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") }
                    DsDivider()
                    RowButton("Support") { uriHandler.openUri("${BuildConfig.API_BASE_URL}/support") }
                    DsDivider()
                    RowButton("Manage subscription") { uriHandler.openUri("https://play.google.com/store/account/subscriptions") }
                }
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    DsCompactButton("Sign out", { container.pushRegistrar.onSignOut(); container.session.signOut() }, danger = true)
                }
            }
        }
    }

    if (pickingAvatar) {
        LessonLightScope(theme, container.themeManager.palette.collectAsState().value) {
            AvatarPickerDialog(container, identity.displayName, identity.avatarSeed.ifEmpty { "a" }, onClose = { pickingAvatar = false }, onSaved = identityVm::avatarSaved)
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
                }) { Text("Delete Forever", color = ds.wrongInk) }
            },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
internal fun Section(title: String, footer: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        DsOverline(title)
        DsCard(spacing = AlphonsoTokens.Space.s2) {
            content()
            footer?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
        }
    }
}

@Composable
private fun RowButton(label: String, enabled: Boolean = true, destructive: Boolean = false, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Text(
        label,
        style = HeadlineType,
        color = if (destructive) ds.wrongInk else ds.ink,
        modifier = Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clickable(enabled = enabled, onClick = onClick).padding(AlphonsoTokens.Space.s3).wrapContentHeight(Alignment.CenterVertically),
    )
}
