package com.obsidianmedia.learnwithalphonso.ui.league

import android.content.Intent
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun ScreenHeader(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    val palette = AlphonsoColor.palette
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
        Text(title, style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.weight(1f))
        actions()
    }
}

@Composable
fun SectionCard(title: String, content: @Composable () -> Unit) {
    val palette = AlphonsoColor.palette
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        AlphonsoSectionHeader(title)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
    }
}

@Composable
fun TeamsScreen(container: AppContainer, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    val vm: TeamsViewModel = viewModel { TeamsViewModel(container.progressClient) }
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    var newName by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("public") }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Teams", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val team = state.myTeam
            if (team != null) {
                SectionCard(team.name) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Join code: ${team.joinCode}", color = palette.ink, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, vm.shareText(team)) }
                            context.startActivity(Intent.createChooser(send, "Share join code"))
                        }) { Text("Share", color = palette.moss) }
                    }
                    Text("${team.thisWeekXp} XP this week", style = MaterialTheme.typography.titleMedium, color = palette.ink)
                    if (state.canLeave) TextButton(onClick = vm::leave) { Text("Leave team", color = palette.destructive) }
                    else Text("Can't leave until ${DateUtils.formatDateTime(context, team.switchLockedUntilMillis, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH)}", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                }
                // The mission card follows the member count: an owner removing someone turns a two-person mission
                // into "invite a friend" on the server, and the card must follow (a refresh also fires on entry).
                val missionVm: TeamMissionViewModel = viewModel(key = "team-mission-teams") { TeamMissionViewModel(container.progressClient) }
                val mission by missionVm.state.collectAsState()
                LaunchedEffect(state.members.size) { missionVm.refresh() }
                mission?.let { TeamMissionCard(it) }
                SectionCard("Members") {
                    state.members.forEach { m ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(m.displayName, color = palette.ink, modifier = Modifier.weight(1f))
                            if (m.isOwner) Text("Owner", style = MaterialTheme.typography.labelSmall, color = palette.ember, fontWeight = FontWeight.SemiBold)
                            if (team.isOwner && !m.isOwner) TextButton(onClick = { vm.kick(m) }) { Text("Remove", color = palette.destructive) }
                        }
                    }
                }
            } else {
                SectionCard("Join a team") {
                    OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Join code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    AlphonsoSecondaryButton("Join by code", onClick = { vm.joinByCode(code) }, enabled = code.isNotBlank())
                    AlphonsoSecondaryButton("Put me on a team", onClick = vm::autoJoin)
                }
                SectionCard("Create a team") {
                    OutlinedTextField(value = newName, onValueChange = { newName = it }, label = { Text("Team name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        listOf("public" to "Public", "private" to "Private").forEachIndexed { i, (raw, label) ->
                            SegmentedButton(selected = visibility == raw, onClick = { visibility = raw }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(label) }
                        }
                    }
                    AlphonsoPrimaryButton("Create team", onClick = { vm.createTeam(newName, visibility); newName = "" }, enabled = newName.isNotBlank())
                }
            }
            SectionCard("This week's top teams") {
                if (state.isLoading) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
                else if (state.leaderboard.isEmpty()) Text("No teams have earned XP this week yet.", color = palette.inkSoft)
                else state.leaderboard.forEachIndexed { i, t -> AlphonsoRowCard("${i + 1}. ${t.name}", "${t.weeklyXp} XP this week") }
            }
            state.error?.let { Text(it, color = palette.destructive, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
fun SeasonScreen(container: AppContainer, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val vm: SeasonViewModel = viewModel { SeasonViewModel(container.progressClient) }
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Season", onBack)
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                state.isLoading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
                state.status == null -> Text("Couldn't load your season status.", color = palette.inkSoft)
                else -> {
                    val s = state.status!!
                    SectionCard("This week") {
                        Text("Division ${s.division}", style = MaterialTheme.typography.headlineMedium, color = palette.ink)
                        Text("Rank ${s.rankInCohort} of ${s.cohortSize} this week", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                    }
                    s.lastWeekResult?.let { lw ->
                        SectionCard("Last week") { Text("Division ${lw.division}, rank ${lw.rankInCohort} of ${lw.cohortSize}", color = palette.ink) }
                    }
                }
            }
        }
    }
}
