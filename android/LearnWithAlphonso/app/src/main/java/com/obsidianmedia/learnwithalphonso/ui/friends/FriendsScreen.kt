package com.obsidianmedia.learnwithalphonso.ui.friends

import com.obsidianmedia.learnwithalphonso.core.logic.InviteLink
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.FriendsPresentation
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDivider
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner

@Composable
fun FriendsScreen(container: AppContainer, onBack: () -> Unit, onOpenDuels: () -> Unit, onEnterCode: (String) -> Unit, seededVm: FriendsViewModel? = null, seededBuddyVm: BuddyViewModel? = null) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val vm: FriendsViewModel = seededVm ?: viewModel { FriendsViewModel(container.progressClient, container.nudgeCache, container.session.userId, BuildConfig.API_BASE_URL) }
    val state by vm.state.collectAsState()
    val buddyVm: BuddyViewModel = seededBuddyVm ?: viewModel { BuddyViewModel(container.progressClient) }
    var knownAgeRange by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { knownAgeRange = runCatching { container.learnerProfileClient.fetch().answers.ageRange }.getOrNull() }
    var removeTarget by remember { mutableStateOf<FriendProgress?>(null) }
    var blockTarget by remember { mutableStateOf<FriendProgress?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var manualCode by remember { mutableStateOf("") }

    LifecycleResumeEffect(Unit) { vm.checkForNudges(); onPauseOrDispose { } }

    DsSceneScreen(DsScene.PRACTICE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Profile", onBack) { DsGlassChip("Duels", onOpenDuels) }
            ToastBanner(state.toast, onClear = vm::clearToast)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Friends", FriendsPresentation.countLine(state.friends.size))
                DsCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        Icon(painterResource(R.drawable.ds_friends), null, tint = ds.xp, modifier = Modifier.size(AlphonsoTokens.Space.s12))
                        Column(Modifier.weight(1f)) {
                            Text("Invite a friend", style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
                            Text("Share your link. When they open it and tap Add friend, you're friends.", style = FootnoteType, color = ds.inkSoft)
                        }
                    }
                    state.inviteLink?.let { link ->
                        LessonEdgeButton("Share invite link", EdgeVariant.PRIMARY, {
                            val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, link) }
                            context.startActivity(Intent.createChooser(send, "Share invite link"))
                        })
                    }
                    Text("Got a link or code from a friend?", style = CaptionType, color = ds.inkSoft)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        Box(Modifier.weight(1f)) { DsField(manualCode, { manualCode = it }, "Friend link or code") }
                        val code = InviteLink.codeFromEntry(manualCode)
                        DsCompactButton("Add", { code?.let { onEnterCode(it); manualCode = "" } }, enabled = code != null)
                    }
                }
                DsOverline("Study buddy")
                BuddySection(buddyVm, state.friends, knownAgeRange, onReport = { reportTarget = it })
                DsOverline(FriendsPresentation.friendsHeader(state.friends.size))
                DsCard(padding = AlphonsoTokens.Space.s2, spacing = 0.dp) {
                    when {
                        state.isLoading -> Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s2), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
                        state.error != null -> Text(state.error!!, style = FootnoteType, color = ds.inkSoft, modifier = Modifier.padding(AlphonsoTokens.Space.s2))
                        state.friends.isEmpty() -> Text("No friends yet. Share your invite link to get started.", style = FootnoteType, color = ds.inkSoft, modifier = Modifier.padding(AlphonsoTokens.Space.s2))
                        else -> state.friends.forEachIndexed { index, f ->
                            if (index > 0) DsDivider()
                            FriendRow(
                                friend = f, canNudge = remember(state.nudgeVersion, f.userId) { vm.canNudge(f) },
                                onNudge = { vm.nudge(f) }, onRemove = { removeTarget = f },
                                onBlock = { blockTarget = f }, onReport = { reportTarget = SocialTarget(f.userId, f.displayName) },
                            )
                        }
                    }
                }
                if (state.activity.isNotEmpty()) {
                    DsOverline("Activity")
                    DsCard {
                        state.activity.forEach { e ->
                            val icon = when (e.eventType) { "lesson_completed" -> R.drawable.ds_check; "streak_milestone" -> R.drawable.ds_flame_solid; "league_promotion" -> R.drawable.ds_trophy; else -> R.drawable.ds_star_solid }
                            val tint = when (e.eventType) { "lesson_completed" -> ds.right; "streak_milestone" -> ds.flame; else -> ds.xp }
                            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3), verticalAlignment = Alignment.CenterVertically) {
                                Icon(painterResource(icon), null, tint = tint, modifier = Modifier.size(AlphonsoTokens.Space.s6))
                                Text(vm.activityCopy(e), style = BodyType, color = ds.ink)
                            }
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
            confirmButton = { TextButton(onClick = { vm.remove(f); removeTarget = null }) { Text("Remove", color = ds.wrongInk) } },
            dismissButton = { TextButton(onClick = { removeTarget = null }) { Text("Cancel") } },
        )
    }
    BlockConfirmDialog(blockTarget?.let { SocialTarget(it.userId, it.displayName) }, onConfirm = { t -> blockTarget?.let(vm::block); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
}

@Composable
private fun FriendRow(friend: FriendProgress, canNudge: Boolean, onNudge: () -> Unit, onRemove: () -> Unit, onBlock: () -> Unit, onReport: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        modifier = Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).padding(AlphonsoTokens.Space.s2),
    ) {
        AvatarCircle(friend.avatarSeed, friend.displayName, AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s2)
        Column(Modifier.weight(1f)) {
            Text(friend.displayName, style = HeadlineType, color = ds.ink)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                Icon(painterResource(R.drawable.ds_flame_solid), null, tint = ds.flame, modifier = Modifier.size(AlphonsoTokens.Space.s3 + AlphonsoTokens.Space.s1))
                Text("${friend.streak}-day streak", style = CaptionType, color = ds.inkSoft)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${friend.weekXp}", style = HeadlineType, color = ds.ink)
            Text("XP this week", style = CaptionType, color = ds.inkSoft)
        }
        DsCompactButton("👋", onNudge, enabled = canNudge)
        SocialSafetyMenu(onBlock = onBlock, onReport = onReport)
    }
}

/** The in-app landing for an invite link or a typed code. */
@Composable
fun InviteAcceptScreen(container: AppContainer, code: String, onDone: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val vm: InviteAcceptViewModel = viewModel(key = "invite-$code") { InviteAcceptViewModel(container.progressClient, code) }
    val state by vm.state.collectAsState()
    DsSceneScreen(DsScene.PRACTICE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Friends", onDone)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Friend invite", null)
                DsCard {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        when (val s = state) {
                            InviteState.Loading -> CircularProgressIndicator(color = ds.choice)
                            InviteState.Self -> Text("That's your own invite link. Share it with a friend instead.", style = BodyType, color = ds.ink, textAlign = TextAlign.Center)
                            InviteState.Invalid -> Text("This invite link doesn't look right. Ask your friend for a fresh one.", style = BodyType, color = ds.ink, textAlign = TextAlign.Center)
                            is InviteState.Ready -> {
                                Text("Add ${s.inviterName} as a friend?", style = TitleType, color = ds.ink, textAlign = TextAlign.Center)
                                LessonEdgeButton("Add friend", EdgeVariant.PRIMARY, vm::accept)
                            }
                            is InviteState.Accepted -> {
                                Text("You and ${s.inviterName} are now friends.", style = TitleType, color = ds.ink, textAlign = TextAlign.Center)
                                LessonEdgeButton("Done", EdgeVariant.PRIMARY, onDone)
                            }
                            is InviteState.Error -> Text(s.message, style = BodyType, color = ds.wrongInk, textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
}
