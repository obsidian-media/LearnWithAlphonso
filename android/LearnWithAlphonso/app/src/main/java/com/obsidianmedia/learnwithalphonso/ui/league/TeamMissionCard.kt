package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.R
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.Alignment
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.getTeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionModel
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionStatus
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
    val ds = LocalAlphonsoTokens.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        DsOverline("Team mission")
        DsCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                Icon(painterResource(R.drawable.ds_target), null, tint = ds.heart, modifier = Modifier.size(AlphonsoTokens.Space.s8))
                Text(mission.headline, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
            }
            if (mission.status != TeamMissionStatus.NEEDS_MEMBERS) {
                DsProgressBar(
                    mission.percent / 100f,
                    label = "Team mission progress", value = "${mission.percent} percent",
                )
            }
            if (mission.footer.isNotEmpty()) {
                Text(mission.footer, style = FootnoteType, color = ds.inkSoft)
            }
        }
    }
}
