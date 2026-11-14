package com.obsidianmedia.learnwithalphonso.ui.social

import androidx.compose.ui.res.painterResource
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.SafetyPresentation
import com.obsidianmedia.learnwithalphonso.core.net.reportTeamName
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogBody
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Ports of SocialSafetyControls.swift: the block/report affordances every user-facing row carries. */

/** [isTeamName] reports a team's name (the id is the team's) instead of a person. */
data class SocialTarget(val id: String, val displayName: String, val isTeamName: Boolean = false)

enum class ReportReason(val raw: String, val label: String) {
    SPAM("spam", "Spam"),
    HARASSMENT("harassment", "Harassment or bullying"),
    INAPPROPRIATE("inappropriate_content", "Inappropriate content"),
    FAKE_ACCOUNT("fake_account", "Fake account"),
    OTHER("other", "Something else"),
}

object SocialSafetyCopy {
    fun blockConfirmationMessage(displayName: String): String =
        "$displayName won't be able to add you as a friend or challenge you to a duel, and you won't see them in friends, activity, or leaderboards. Contact support@alphonsoecosystem.app if you need help with this."
}

@Composable
fun SocialSafetyMenu(onBlock: () -> Unit, onReport: () -> Unit, contentDescription: String = "More options") {
    var open by remember { mutableStateOf(false) }
    val ds = LocalAlphonsoTokens.current
    Box {
        MenuButton(contentDescription) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = ds.card) {
            DropdownMenuItem(text = { Text("Block User", style = FootnoteType, color = ds.wrongInk) }, onClick = { open = false; onBlock() })
            DropdownMenuItem(text = { Text(SafetyPresentation.reportMenuLabel(false), style = FootnoteType, color = ds.ink) }, onClick = { open = false; onReport() })
        }
    }
}

/** The "more" button on a row: a round touch target in the design system's ink, not a Material icon button. */
@Composable
private fun MenuButton(label: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Filled.MoreVert, contentDescription = null, tint = ds.inkSoft) }
}

/** The menu on a team's name in the top teams list: report the name, nothing else. */
@Composable
fun TeamNameMenu(teamName: String, onReport: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val ds = LocalAlphonsoTokens.current
    Box {
        MenuButton("More options for $teamName") { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = ds.card) {
            DropdownMenuItem(text = { Text(SafetyPresentation.reportMenuLabel(true), style = FootnoteType, color = ds.ink) }, onClick = { open = false; onReport() })
        }
    }
}

@Composable
fun BlockConfirmDialog(target: SocialTarget?, onConfirm: (SocialTarget) -> Unit, onDismiss: () -> Unit, title: String? = null) {
    if (target == null) return
    DsConfirmDialog(
        title = title ?: SafetyPresentation.blockTitle(target.displayName),
        message = SocialSafetyCopy.blockConfirmationMessage(target.displayName),
        confirmLabel = "Block", onConfirm = { onConfirm(target) }, onDismiss = onDismiss, destructive = true,
    )
}

/** Reason picker, submit, then the confirmation copy with the report address. A team name reports through the team's creator. */
@Composable
fun ReportSheet(target: SocialTarget?, container: AppContainer, onDismiss: () -> Unit) {
    if (target == null) return
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf(ReportReason.SPAM) }
    var submitting by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    DsDialog(onDismiss) {
        DsDialogTitle(SafetyPresentation.reportTitle(target.displayName))
        if (submitted) {
            Icon(painterResource(R.drawable.ds_check), null, tint = ds.right, modifier = Modifier.size(AlphonsoTokens.Space.s12))
            Text("Report submitted", style = HeadlineType, color = ds.ink)
            DsDialogBody("Thanks for letting us know. Our team reviews every report. If you need to follow up, contact support@alphonsoecosystem.app.")
            DsCompactButton("Done", onDismiss, primary = true)
        } else {
            DsOverline(SafetyPresentation.reasonQuestion(target.isTeamName))
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                ReportReason.entries.forEach { r -> DsChip(r.label, reason == r, onClick = { reason = r }, modifier = Modifier.fillMaxWidth()) }
            }
            error?.let { Text(it, style = FootnoteType, color = ds.wrongInk, textAlign = TextAlign.Center) }
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                DsCompactButton("Cancel", onDismiss)
                AlphonsoPrimaryButton("Submit Report", busy = submitting, fullWidth = false, onClick = {
                    scope.launch {
                        submitting = true; error = null
                        val result = runCatching {
                            if (target.isTeamName) container.progressClient.reportTeamName(target.id, reason.raw) else { container.progressClient.reportUser(target.id, reason.raw); true }
                        }
                        submitting = false
                        result.fold(
                            onSuccess = { filed -> if (filed) submitted = true else error = SafetyPresentation.NO_CREATOR },
                            onFailure = { error = SafetyPresentation.SUBMIT_FAILED },
                        )
                    }
                })
            }
        }
    }
}

/** The learner's picture: their animal, or the initial tinted from the seed (same colour rule as iOS and web). */
@Composable
fun AvatarCircle(seed: String, displayName: String, size: Dp = 36.dp) {
    // A chosen animal (profiles.avatar_seed "animal:<id>") shows its picture; any other seed keeps the initial.
    if (com.obsidianmedia.learnwithalphonso.core.firstrun.ProfileAvatars.animalFromSeed(seed) != null) {
        com.obsidianmedia.learnwithalphonso.ui.firstrun.ProfileAvatar(seed, displayName, size)
        return
    }
    val (r, g, b) = avatarRgb(seed)
    Box(Modifier.size(size).clip(CircleShape).background(Color(r, g, b)), contentAlignment = Alignment.Center) {
        Text(displayName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.38f).sp)
    }
}

/** A short banner at the top of a screen that clears itself after three seconds. */
@Composable
fun ToastBanner(message: String?, onClear: () -> Unit) {
    if (message == null) return
    val ds = LocalAlphonsoTokens.current
    LaunchedEffect(message) { delay(3_000); onClear() }
    Text(
        message,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(AlphonsoRadius.lg))
            .background(ds.actionTint)
            .padding(10.dp)
            .semantics { contentDescription = message },
        style = FootnoteType,
        color = ds.ink,
        textAlign = TextAlign.Center,
    )
}
