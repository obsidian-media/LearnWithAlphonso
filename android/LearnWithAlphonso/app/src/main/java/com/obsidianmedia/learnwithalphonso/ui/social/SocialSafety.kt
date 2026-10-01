package com.obsidianmedia.learnwithalphonso.ui.social

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.avatarRgb
import com.obsidianmedia.learnwithalphonso.core.net.reportUser
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Ports of SocialSafetyControls.swift: the block/report affordances every user-facing row carries. */

data class SocialTarget(val id: String, val displayName: String)

enum class ReportReason(val raw: String, val label: String) {
    SPAM("spam", "Spam"),
    HARASSMENT("harassment", "Harassment or bullying"),
    INAPPROPRIATE("inappropriate_content", "Inappropriate content"),
    FAKE_ACCOUNT("fake_account", "Fake account"),
    OTHER("other", "Something else"),
}

object SocialSafetyCopy {
    fun blockConfirmationMessage(displayName: String): String =
        "$displayName won't be able to add you as a friend or challenge you to a duel, and you won't see them in friends, activity, or leaderboards. Contact report@alphonsoecosystem.app if you need help with this."
}

@Composable
fun SocialSafetyMenu(onBlock: () -> Unit, onReport: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val palette = AlphonsoColor.palette
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "More options", tint = palette.inkSoft) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("Block User", color = palette.destructive) }, onClick = { open = false; onBlock() })
            DropdownMenuItem(text = { Text("Report User") }, onClick = { open = false; onReport() })
        }
    }
}

@Composable
fun BlockConfirmDialog(target: SocialTarget?, onConfirm: (SocialTarget) -> Unit, onDismiss: () -> Unit) {
    if (target == null) return
    val palette = AlphonsoColor.palette
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Block ${target.displayName}?") },
        text = { Text(SocialSafetyCopy.blockConfirmationMessage(target.displayName)) },
        confirmButton = { TextButton(onClick = { onConfirm(target) }) { Text("Block", color = palette.destructive) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Reason picker, submit, then the confirmation copy with the report address. */
@Composable
fun ReportSheet(target: SocialTarget?, container: AppContainer, onDismiss: () -> Unit) {
    if (target == null) return
    val palette = AlphonsoColor.palette
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf(ReportReason.SPAM) }
    var submitting by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report ${target.displayName}") },
        text = {
            if (submitted) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Report submitted", style = MaterialTheme.typography.titleMedium, color = palette.ink)
                    Text("Thanks for letting us know. Our team reviews every report. If you need to follow up, contact report@alphonsoecosystem.app.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    AlphonsoSectionHeader("Why are you reporting this person?")
                    ReportReason.entries.forEach { r ->
                        Row(Modifier.fillMaxWidth().clickable { reason = r }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(r.label, color = palette.ink, modifier = Modifier.weight(1f))
                            if (reason == r) Text("✓", color = palette.moss, fontWeight = FontWeight.Bold)
                        }
                    }
                    error?.let { Text(it, color = palette.destructive, style = MaterialTheme.typography.bodySmall) }
                }
            }
        },
        confirmButton = {
            if (submitted) TextButton(onClick = onDismiss) { Text("Done") }
            else AlphonsoPrimaryButton("Submit Report", busy = submitting, fullWidth = false, onClick = {
                scope.launch {
                    submitting = true; error = null
                    val ok = runCatching { container.progressClient.reportUser(target.id, reason.raw) }.isSuccess
                    submitting = false
                    if (ok) submitted = true else error = "Couldn't submit your report. Try again."
                }
            })
        },
        dismissButton = { if (!submitted) TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Initial-letter avatar tinted from the seed, same colour rule as iOS and web. */
@Composable
fun AvatarCircle(seed: String, displayName: String, size: Dp = 36.dp) {
    val (r, g, b) = avatarRgb(seed)
    Box(Modifier.size(size).clip(CircleShape).background(Color(r, g, b)), contentAlignment = Alignment.Center) {
        Text(displayName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.38f).sp)
    }
}

/** A short banner at the top of a screen that clears itself after three seconds. */
@Composable
fun ToastBanner(message: String?, onClear: () -> Unit) {
    if (message == null) return
    val palette = AlphonsoColor.palette
    LaunchedEffect(message) { delay(3_000); onClear() }
    Text(
        message,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(AlphonsoRadius.lg))
            .background(palette.emberSoft)
            .padding(10.dp)
            .semantics { contentDescription = message },
        style = MaterialTheme.typography.labelLarge,
        color = palette.ink,
        textAlign = TextAlign.Center,
    )
}
