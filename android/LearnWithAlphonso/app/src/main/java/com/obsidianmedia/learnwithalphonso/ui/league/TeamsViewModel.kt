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
import kotlin.coroutines.cancellation.CancellationException
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
    /** The team lookup itself failed: that is not "no team", and the screen must not offer create/join. */
    val teamLoadFailed: Boolean = false,
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
            // Cancellation must stop the load, not be recorded as a failed lookup.
            val teamResult = try {
                Result.success(client.getMyTeam())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
            // A failed refresh keeps the team already on screen; only a first load with no team to show is a failure.
            val team = if (teamResult.isFailure) _state.value.myTeam else teamResult.getOrNull()
            // A failed refresh keeps the members with the team; otherwise a team with no members would show.
            val members = when {
                teamResult.isFailure -> _state.value.members
                team != null -> runCatching { client.getTeamMembers() }.getOrDefault(emptyList())
                else -> emptyList()
            }
            val board = runCatching { client.getTeamLeaderboard() }.getOrDefault(emptyList())
            _state.update { it.copy(isLoading = false, myTeam = team, members = members, leaderboard = board, teamLoadFailed = teamResult.isFailure && team == null, nowMillis = nowMillis()) }
        }
    }

    fun joinByCode(code: String) = outcome { client.joinTeamByCode(code.trim()).let { it.ok to it.reason } }
    fun autoJoin() = outcome { client.autoJoinTeam().let { it.ok to it.reason } }
    fun createTeam(name: String, visibility: String) = outcome { client.createTeam(name.trim(), visibility).let { it.ok to it.reason } }
    fun leave() = outcome(clearTeamOnSuccess = true) { client.leaveTeam().let { it.ok to it.reason } }
    fun kick(member: TeamMember) = outcome { client.kickTeamMember(member.userId).let { it.ok to it.reason } }

    private fun outcome(clearTeamOnSuccess: Boolean = false, call: suspend () -> Pair<Boolean, String?>) {
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            val result = runCatching { call() }.getOrElse { false to "Check your connection and try again." }
            if (result.first) {
                // Clear first: if the reload fails, a kept stale team would show the team the user just left.
                if (clearTeamOnSuccess) _state.update { it.copy(myTeam = null, members = emptyList()) }
                loadAll()
            } else _state.update { it.copy(error = result.second ?: "Something went wrong. Try again.") }
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
