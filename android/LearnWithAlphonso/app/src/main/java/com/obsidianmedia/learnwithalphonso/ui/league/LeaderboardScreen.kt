package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.net.LeaderboardRow
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.learn.LeagueTierPalette
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun LeaderboardScreen(container: AppContainer, onBack: () -> Unit, onOpenTeams: () -> Unit, onOpenSeason: () -> Unit) {
    val palette = AlphonsoColor.palette
    val userId = container.session.userId
    val vm: LeaderboardViewModel = viewModel {
        LeaderboardViewModel(container.progressClient, container.snapshotCache, container.recapCache, container.tierCache, userId)
    }
    val state by vm.state.collectAsState()
    var blockTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var showRecap by remember { mutableStateOf(false) }

    LifecycleResumeEffect(Unit) { vm.checkForOvertake(); onPauseOrDispose { } }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
            Text("League", style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.weight(1f))
            TextButton(onClick = onOpenTeams) { Text("Teams", color = palette.moss) }
            TextButton(onClick = onOpenSeason) { Text("Season", color = palette.moss) }
            TextButton(onClick = { showRecap = true; vm.loadRecap() }) { Text("Recap", color = palette.moss) }
        }
        ToastBanner(state.toast, onClear = vm::clearToast)
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                LeaderboardScope.entries.forEachIndexed { i, s ->
                    SegmentedButton(selected = state.scope == s, onClick = { vm.select(scope = s) }, shape = SegmentedButtonDefaults.itemShape(i, LeaderboardScope.entries.size)) { Text(s.label) }
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                LeaderboardPeriod.entries.forEachIndexed { i, p ->
                    SegmentedButton(selected = state.period == p, onClick = { vm.select(period = p) }, shape = SegmentedButtonDefaults.itemShape(i, LeaderboardPeriod.entries.size)) { Text(p.label) }
                }
            }
        }
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            state.error != null -> EmptyState("Couldn't load the leaderboard", state.error!!)
            state.rows.isEmpty() -> EmptyState(state.emptyTitle, state.emptyBody)
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(state.rows, key = { _, r -> r.userId }) { index, row ->
                    LeaderboardRowView(
                        rank = index + 1, row = row, isYou = row.userId == userId,
                        onBlock = { blockTarget = SocialTarget(row.userId, row.displayName) },
                        onReport = { reportTarget = SocialTarget(row.userId, row.displayName) },
                    )
                }
            }
        }
    }

    BlockConfirmDialog(blockTarget, onConfirm = { vm.block(it); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
    if (showRecap) WeeklyRecapDialog(vm, onDismiss = { showRecap = false })
}

@Composable
private fun LeaderboardRowView(rank: Int, row: LeaderboardRow, isYou: Boolean, onBlock: () -> Unit, onReport: () -> Unit) {
    val palette = AlphonsoColor.palette
    val badge = when (rank) { 1 -> Color(0xFFF2D34F); 2 -> Color(0xFFD1D1D1); 3 -> Color(0xFFF0A860); else -> palette.surface }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(if (isYou) palette.emberSoft else palette.parchment).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(badge), contentAlignment = Alignment.Center) { Text("$rank", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = palette.ink) }
        AvatarCircle(row.avatarSeed, row.displayName)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(row.displayName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = palette.ink)
                if (isYou) Text("YOU", fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = palette.onAccent, modifier = Modifier.clip(CircleShape).background(palette.ember).padding(horizontal = 6.dp, vertical = 2.dp))
            }
            row.country?.let { Text(it.uppercase(), style = MaterialTheme.typography.labelSmall, color = palette.inkSoft) }
        }
        Text("${row.xp} XP", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.ink)
        if (!isYou) SocialSafetyMenu(onBlock, onReport)
    }
}

@Composable
fun EmptyState(title: String, body: String) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
    }
}

@Composable
private fun WeeklyRecapDialog(vm: LeaderboardViewModel, onDismiss: () -> Unit) {
    val palette = AlphonsoColor.palette
    val recap by vm.recap.collectAsState()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Weekly recap") },
        text = {
            if (recap.isLoading) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            else Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Last week you earned", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                Text("${recap.lastWeekXp} XP", style = MaterialTheme.typography.displayMedium, color = palette.ink)
                recap.currentRank?.let {
                    Text("Your rank today (global, weekly)", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    Text("#$it", style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                    Text("Approximate. This app doesn't keep a historical snapshot of last week's exact standings.", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, textAlign = TextAlign.Center)
                }
                recap.promotedToTier?.let {
                    Text("You moved up to ${it.replaceFirstChar { c -> c.uppercase() }}!", style = MaterialTheme.typography.titleMedium, color = LeagueTierPalette.color(it))
                }
                Spacer(Modifier.size(4.dp))
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}
