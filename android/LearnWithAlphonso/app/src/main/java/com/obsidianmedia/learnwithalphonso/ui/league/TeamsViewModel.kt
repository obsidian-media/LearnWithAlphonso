package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.MyTeam
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.SeasonStatus
import com.obsidianmedia.learnwithalphonso.core.net.TeamLeaderboardRow
import com.obsidianmedia.learnwithalphonso.core.net.TeamMember
import com.obsidianmedia.learnwithalphonso.core.net.autoJoinTeam
import com.obsidianmedia.learnwithalphonso.core.net.createTeam
import com.obsidianmedia.learnwithalphonso.core.net.getMyTeam
import com.obsidianmedia.learnwithalphonso.core.net.getSeasonStatus
import com.obsidianmedia.learnwithalphonso.core.net.getTeamLeaderboard
import com.obsidianmedia.learnwithalphonso.core.net.getTeamMembers
import com.obsidianmedia.learnwithalphonso.core.net.joinTeamByCode
import com.obsidianmedia.learnwithalphonso.core.net.kickTeamMember
import com.obsidianmedia.learnwithalphonso.core.net.leaveTeam
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TeamsUiState(
    val isLoading: Boolean = true,
    val myTeam: MyTeam? = null,
    val members: List<TeamMember> = emptyList(),
    val leaderboard: List<TeamLeaderboardRow> = emptyList(),
    val error: String? = null,
    val nowMillis: Long = 0,
) {
    val canLeave: Boolean get() = myTeam != null && myTeam.switchLockedUntilMillis <= nowMillis
}

/** Port of TeamsView.swift. */
class TeamsViewModel(private val client: ProgressSyncClient, private val nowMillis: () -> Long = System::currentTimeMillis) : ViewModel() {
    private val _state = MutableStateFlow(TeamsUiState())
    val state: StateFlow<TeamsUiState> = _state.asStateFlow()

    init { loadAll() }

    fun loadAll() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            val team = runCatching { client.getMyTeam() }.getOrNull()
            val members = if (team != null) runCatching { client.getTeamMembers() }.getOrDefault(emptyList()) else emptyList()
            val board = runCatching { client.getTeamLeaderboard() }.getOrDefault(emptyList())
            _state.update { it.copy(isLoading = false, myTeam = team, members = members, leaderboard = board, nowMillis = nowMillis()) }
        }
    }

    fun joinByCode(code: String) = outcome { client.joinTeamByCode(code.trim()).let { it.ok to it.reason } }
    fun autoJoin() = outcome { client.autoJoinTeam().let { it.ok to it.reason } }
    fun createTeam(name: String, visibility: String) = outcome { client.createTeam(name.trim(), visibility).let { it.ok to it.reason } }
    fun leave() = outcome { client.leaveTeam().let { it.ok to it.reason } }
    fun kick(member: TeamMember) = outcome { client.kickTeamMember(member.userId).let { it.ok to it.reason } }

    private fun outcome(call: suspend () -> Pair<Boolean, String?>) {
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            val result = runCatching { call() }.getOrElse { false to "Check your connection and try again." }
            if (result.first) loadAll() else _state.update { it.copy(error = result.second ?: "Something went wrong. Try again.") }
        }
    }

    /** Share text for the join code, same wording as iOS. */
    fun shareText(team: MyTeam): String =
        "Join my team \"${team.name}\" on Learn with Alphonso! Enter code ${team.joinCode} under Teams → Join a team."
}

data class SeasonUiState(val isLoading: Boolean = true, val status: SeasonStatus? = null)

class SeasonViewModel(private val client: ProgressSyncClient) : ViewModel() {
    private val _state = MutableStateFlow(SeasonUiState())
    val state: StateFlow<SeasonUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val status = runCatching { client.getSeasonStatus() }.getOrNull()
            _state.value = SeasonUiState(isLoading = false, status = status)
        }
    }
}
