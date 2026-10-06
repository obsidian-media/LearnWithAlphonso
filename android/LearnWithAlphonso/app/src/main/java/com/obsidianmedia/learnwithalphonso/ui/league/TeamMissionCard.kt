package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.getTeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionModel
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionStatus
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Thin wrapper over [TeamMissionModel] (the refresh logic, including the stale-answer guard, lives and is tested in
 * :core). The Learn tab and the team screen each keep their own instance, and ask for a refresh whenever they are shown.
 */
class TeamMissionViewModel(client: ProgressSyncClient) : ViewModel() {
    private val model = TeamMissionModel { client.getTeamMission() }

    /** Null while loading, without a team, or when the last refresh failed: the card then renders nothing. */
    val state: StateFlow<TeamMission?> = model.state

    fun refresh() { viewModelScope.launch { model.refresh() } }
}

/**
 * A team's weekly shared mission (BACKLOG 0.0-ac #2, docs/superpowers/specs/2026-10-06-study-together-design.md). It
 * renders what `get_team_mission` returns and does no mission maths: the server computes the target, the progress and
 * the payout, and `TeamMission` (tested in :core against the shared fixtures) owns the wording, which is word-for-word
 * the web card's. Stateless on purpose, so callers can skip the list item entirely while there is nothing to show.
 */
@Composable
fun TeamMissionCard(mission: TeamMission, modifier: Modifier = Modifier) {
    val palette = AlphonsoColor.palette
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(palette.parchment).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        AlphonsoSectionHeader("Team mission")
        Text(mission.headline, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
        if (mission.status != TeamMissionStatus.NEEDS_MEMBERS) {
            AlphonsoProgressBar(
                mission.percent / 100f,
                Modifier.semantics { contentDescription = "Team mission progress, ${mission.percent} percent" },
            )
        }
        if (mission.footer.isNotEmpty()) {
            Text(mission.footer, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
        }
    }
}
