package com.obsidianmedia.learnwithalphonso.ui.friends

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.league.ScreenHeader
import com.obsidianmedia.learnwithalphonso.ui.league.SectionCard
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun FriendsScreen(container: AppContainer, onBack: () -> Unit, onOpenDuels: () -> Unit, onEnterCode: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    val vm: FriendsViewModel = viewModel { FriendsViewModel(container.progressClient, container.nudgeCache, container.session.userId, BuildConfig.API_BASE_URL) }
    val state by vm.state.collectAsState()
    val buddyVm: BuddyViewModel = viewModel { BuddyViewModel(container.progressClient) }
    var removeTarget by remember { mutableStateOf<FriendProgress?>(null) }
    var blockTarget by remember { mutableStateOf<FriendProgress?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var manualCode by remember { mutableStateOf("") }

    LifecycleResumeEffect(Unit) { vm.checkForNudges(); onPauseOrDispose { } }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Friends", onBack) { TextButton(onClick = onOpenDuels) { Text("Duels", color = palette.moss) } }
        ToastBanner(state.toast, onClear = vm::clearToast)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SectionCard("Invite a friend") {
                Text("Share your link. When they open it, you're automatically friends.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                state.inviteLink?.let { link ->
                    AlphonsoPrimaryButton("Share invite link", fullWidth = false, onClick = {
                        val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, link) }
                        context.startActivity(Intent.createChooser(send, "Share invite link"))
                    })
                }
                Text("Got a code from a friend?", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = manualCode, onValueChange = { manualCode = it }, label = { Text("Friend code") }, singleLine = true, modifier = Modifier.weight(1f))
                    AlphonsoSecondaryButton("Add", onClick = { onEnterCode(manualCode.trim()); manualCode = "" }, enabled = manualCode.isNotBlank(), fullWidth = false)
                }
            }
            BuddySection(buddyVm, state.friends)
            SectionCard(if (state.friends.isEmpty()) "Your friends" else "${state.friends.size} friend${if (state.friends.size == 1) "" else "s"}") {
                when {
                    state.isLoading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
                    state.error != null -> Text(state.error!!, color = palette.inkSoft)
                    state.friends.isEmpty() -> Text("No friends yet. Share your invite link to get started.", color = palette.inkSoft)
                    else -> state.friends.forEach { f ->
                        FriendRow(
                            friend = f, canNudge = remember(state.nudgeVersion, f.userId) { vm.canNudge(f) },
                            onNudge = { vm.nudge(f) }, onRemove = { removeTarget = f },
                            onBlock = { blockTarget = f }, onReport = { reportTarget = SocialTarget(f.userId, f.displayName) },
                        )
                    }
                }
            }
            if (state.activity.isNotEmpty()) {
                SectionCard("Activity") {
                    state.activity.forEach { e ->
                        val icon = when (e.eventType) { "lesson_completed" -> "✓"; "streak_milestone" -> "🔥"; "league_promotion" -> "⬆"; else -> "●" }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(icon, color = palette.moss)
                            Text(vm.activityCopy(e), style = MaterialTheme.typography.bodyMedium, color = palette.ink)
                        }
                    }
                }
            }
        }
    }

    removeTarget?.let { f ->
        AlertDialog(
            onDismissRequest = { removeTarget = null },
            title = { Text("Remove ${f.displayName}?") },
            text = { Text("You won't see each other's activity or streaks anymore.") },
            confirmButton = { TextButton(onClick = { vm.remove(f); removeTarget = null }) { Text("Remove", color = palette.destructive) } },
            dismissButton = { TextButton(onClick = { removeTarget = null }) { Text("Cancel") } },
        )
    }
    BlockConfirmDialog(blockTarget?.let { SocialTarget(it.userId, it.displayName) }, onConfirm = { t -> blockTarget?.let(vm::block); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
}

@Composable
private fun FriendRow(friend: FriendProgress, canNudge: Boolean, onNudge: () -> Unit, onRemove: () -> Unit, onBlock: () -> Unit, onReport: () -> Unit) {
    val palette = AlphonsoColor.palette
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        AvatarCircle(friend.avatarSeed, friend.displayName, 40.dp)
        Column(Modifier.weight(1f)) {
            Text(friend.displayName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.ink)
            Text("🔥 ${friend.streak}-day streak", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${friend.weekXp}", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.ink)
            Text("XP this week", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
        }
        AlphonsoSecondaryButton("👋", onClick = onNudge, enabled = canNudge, fullWidth = false)
        Box {
            SocialSafetyMenu(onBlock = onBlock, onReport = onReport)
        }
        TextButton(onClick = onRemove) { Text("Remove", color = palette.destructive, style = MaterialTheme.typography.labelMedium) }
    }
}

/** The in-app landing for an invite link or a typed code. */
@Composable
fun InviteAcceptScreen(container: AppContainer, code: String, onDone: () -> Unit) {
    val palette = AlphonsoColor.palette
    val vm: InviteAcceptViewModel = viewModel(key = "invite-$code") { InviteAcceptViewModel(container.progressClient, code) }
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Friend invite", onDone)
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
            when (val s = state) {
                InviteState.Loading -> CircularProgressIndicator(color = palette.moss)
                InviteState.Self -> Text("That's your own invite link. Share it with a friend instead.", color = palette.ink, textAlign = TextAlign.Center)
                InviteState.Invalid -> Text("This invite link doesn't look right. Ask your friend for a fresh one.", color = palette.ink, textAlign = TextAlign.Center)
                is InviteState.Ready -> {
                    Text("Add ${s.inviterName} as a friend?", style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
                    AlphonsoPrimaryButton("Add friend", onClick = vm::accept)
                }
                is InviteState.Accepted -> {
                    Text("You and ${s.inviterName} are now friends.", style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
                    AlphonsoPrimaryButton("Done", onClick = onDone)
                }
                is InviteState.Error -> Text(s.message, color = palette.destructive, textAlign = TextAlign.Center)
            }
        }
    }
}
