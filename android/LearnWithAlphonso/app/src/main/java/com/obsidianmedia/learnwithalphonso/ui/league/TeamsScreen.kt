package com.obsidianmedia.learnwithalphonso.ui.league

import android.content.Intent
import android.text.format.DateUtils
import androidx.compose.foundation.background
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.Share
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.core.logic.LeaguePresentation
import com.obsidianmedia.learnwithalphonso.core.logic.TeamsPresentation
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDivider
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsHeroCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsRankBadge
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.components.DsSegmented
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
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
fun TeamsScreen(container: AppContainer, onBack: () -> Unit, seededVm: TeamsViewModel? = null, seededMission: TeamMission? = null) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val vm: TeamsViewModel = seededVm ?: viewModel { TeamsViewModel(container.progressClient) }
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    var newName by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("public") }

    DsSceneScreen(DsScene.PROFILE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("League", onBack)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                val team = state.myTeam
                if (team != null) {
                    DsHeroCard {
                        Text("YOUR TEAM", style = OverlineType, color = ds.onHeroKick)
                        Text(team.name, style = DisplayType, color = ds.onHero, modifier = Modifier.semantics { heading() })
                        Text("${team.thisWeekXp} XP this week", style = HeadlineType, color = ds.onHeroKick)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                            Text(
                                "Join code: ${team.joinCode}", style = FootnoteType, color = ds.onHero,
                                modifier = Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
                                    .background(ds.onHero.copy(alpha = 0.14f)).padding(horizontal = AlphonsoTokens.Space.s3).wrapContentHeight(Alignment.CenterVertically),
                            )
                            Box(
                                Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).background(ds.action)
                                    .clickable(role = Role.Button) {
                                        val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, vm.shareText(team)) }
                                        context.startActivity(Intent.createChooser(send, "Share join code"))
                                    }
                                    .semantics { contentDescription = "Share team invite" },
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.Share, null, tint = ds.onAction, modifier = Modifier.size(AlphonsoTokens.Space.s5)) }
                        }
                        if (!state.canLeave) {
                            Text(
                                "Can't leave until ${DateUtils.formatDateTime(context, team.switchLockedUntilMillis, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH)}",
                                style = CaptionType, color = ds.onHeroSoft,
                            )
                        }
                    }
                    // The mission card follows the member count: an owner removing someone turns a two-person mission
                    // into "invite a friend" on the server, and the card must follow (a refresh also fires on entry).
                    val missionVm: TeamMissionViewModel = viewModel(key = "team-mission-teams") { TeamMissionViewModel(container.progressClient) }
                    val fetchedMission by missionVm.state.collectAsState()
                    val mission = seededMission ?: fetchedMission
                    LaunchedEffect(state.members.size) { if (seededMission == null) missionVm.refresh() }
                    // Only a mission that belongs to the team on screen: after leaving one team and joining another here, the
                    // view-model still holds the old team's mission until the new refresh returns.
                    mission?.takeIf { it.teamId == team.teamId }?.let { TeamMissionCard(it) }
                    DsOverline("Members")
                    DsCard(padding = AlphonsoTokens.Space.s2, spacing = 0.dp) {
                        state.members.forEachIndexed { index, m ->
                            if (index > 0) DsDivider()
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).padding(vertical = AlphonsoTokens.Space.s2, horizontal = AlphonsoTokens.Space.s2),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                            ) {
                                AvatarCircle(m.avatarSeed, m.displayName, AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s2)
                                Text(m.displayName, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                                if (m.isOwner) DsPill("Owner", DsPillTone.GOLD)
                                // Only the owner's list contains blocked members; shown so they can be removed.
                                if (m.isBlocked) DsPill("Blocked", DsPillTone.BAD)
                                if (team.isOwner && !m.isOwner) DsCompactButton("Remove", { vm.kick(m) }, danger = true)
                            }
                        }
                    }
                } else {
                    DsGlassTitle("Teams", TeamsPresentation.SUBTITLE)
                    if (state.teamLoadFailed) {
                        DsOverline("Your team")
                        DsCard {
                            Text("Couldn't load your team.", style = HeadlineType, color = ds.ink)
                            DsCompactButton("Try again", { vm.loadAll() })
                        }
                    } else {
                        DsOverline("Join a team")
                        DsCard {
                            DsField(code, { code = it }, "Join code")
                            LessonEdgeButton("Join by code", EdgeVariant.PRIMARY, { vm.joinByCode(code) }, enabled = TeamsPresentation.canJoin(code))
                            LessonEdgeButton("Put me on a team", EdgeVariant.SECONDARY, vm::autoJoin)
                        }
                        DsOverline("Create a team")
                        DsCard {
                            DsField(newName, { newName = it }, "Team name")
                            DsSegmented(listOf("public" to "Public", "private" to "Private"), visibility, { visibility = it }, "Team visibility")
                            LessonEdgeButton("Create team", EdgeVariant.PRIMARY, { vm.createTeam(newName, visibility); newName = "" }, enabled = TeamsPresentation.canCreate(newName))
                        }
                    }
                }
                DsOverline("This week's top teams")
                when {
                    state.isLoading -> DsCard { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) } }
                    state.leaderboard.isEmpty() -> DsCard { Text("No teams have earned XP this week yet.", style = FootnoteType, color = ds.inkSoft) }
                    else -> DsCard(padding = AlphonsoTokens.Space.s2, spacing = 0.dp) {
                        state.leaderboard.forEachIndexed { i, t ->
                            if (i > 0) DsDivider()
                            val mine = t.teamId == team?.teamId
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
                                    .background(if (mine) ds.choiceTint else Color.Transparent).padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                            ) {
                                DsRankBadge(i + 1, LeaguePresentation.medal(i + 1))
                                Column(Modifier.weight(1f).semantics(mergeDescendants = true) { }) {
                                    Text(t.name, style = HeadlineType, color = ds.ink)
                                    Text("${t.weeklyXp} XP this week", style = CaptionType, color = ds.inkSoft)
                                }
                            }
                        }
                    }
                }
                if (team != null && state.canLeave) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { DsCompactButton("Leave team", vm::leave, danger = true) }
                }
                state.error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
            }
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
