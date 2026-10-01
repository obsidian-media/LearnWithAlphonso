package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.logic.LeaderboardSnapshotEntry
import com.obsidianmedia.learnwithalphonso.core.logic.isLeaguePromotion
import com.obsidianmedia.learnwithalphonso.core.logic.mondayDateString
import com.obsidianmedia.learnwithalphonso.core.logic.wasOvertaken
import com.obsidianmedia.learnwithalphonso.core.net.LeaderboardRow
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.blockUser
import com.obsidianmedia.learnwithalphonso.core.net.fetchActivityXp
import com.obsidianmedia.learnwithalphonso.core.net.fetchLeaderboard
import com.obsidianmedia.learnwithalphonso.data.LeaderboardSnapshotCache
import com.obsidianmedia.learnwithalphonso.data.LeagueTierCache
import com.obsidianmedia.learnwithalphonso.data.WeeklyRecapCache
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class LeaderboardScope(val raw: String, val label: String) { GLOBAL("global", "Global"), FRIENDS("friends", "Friends"), COUNTRY("country", "Country") }
enum class LeaderboardPeriod(val raw: String, val label: String) { WEEKLY("weekly", "Weekly"), ALL_TIME("all-time", "All-time") }

data class LeaderboardUiState(
    val scope: LeaderboardScope = LeaderboardScope.GLOBAL,
    val period: LeaderboardPeriod = LeaderboardPeriod.WEEKLY,
    val rows: List<LeaderboardRow> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val toast: String? = null,
) {
    val emptyTitle: String get() = when (scope) { LeaderboardScope.FRIENDS -> "Add friends to compete"; LeaderboardScope.COUNTRY -> "Set your country"; LeaderboardScope.GLOBAL -> "Nothing here yet" }
    val emptyBody: String get() = when (scope) { LeaderboardScope.FRIENDS -> "Add friends to compete side by side."; LeaderboardScope.COUNTRY -> "Set your country on your profile to see this board."; LeaderboardScope.GLOBAL -> "Finish a lesson to appear on the board." }
}

data class RecapState(val isLoading: Boolean = true, val lastWeekXp: Int = 0, val currentRank: Int? = null, val promotedToTier: String? = null)

/** Port of LeaderboardView.swift plus its WeeklyRecapView. */
class LeaderboardViewModel(
    private val client: ProgressSyncClient,
    private val snapshotCache: LeaderboardSnapshotCache,
    private val recapCache: WeeklyRecapCache,
    private val tierCache: LeagueTierCache,
    private val userId: String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(LeaderboardUiState())
    val state: StateFlow<LeaderboardUiState> = _state.asStateFlow()

    private val _recap = MutableStateFlow(RecapState())
    val recap: StateFlow<RecapState> = _recap.asStateFlow()

    init {
        load()
        checkForOvertake()
    }

    fun select(scope: LeaderboardScope = _state.value.scope, period: LeaderboardPeriod = _state.value.period) {
        _state.update { it.copy(scope = scope, period = period) }
        load()
    }

    fun load() {
        val (scope, period) = _state.value.let { it.scope to it.period }
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = runCatching { client.fetchLeaderboard(scope.raw, period.raw) }
            if (_state.value.scope != scope || _state.value.period != period) return@launch
            _state.update {
                it.copy(isLoading = false, rows = result.getOrDefault(it.rows), error = if (result.isFailure) "Check your connection and try again." else null)
            }
        }
    }

    /** Compares the live global weekly board with the cached one; toasts once when someone passed the learner. */
    fun checkForOvertake() {
        val me = userId ?: return
        viewModelScope.launch {
            val live = runCatching { client.fetchLeaderboard("global", "weekly") }.getOrNull() ?: return@launch
            val current = live.map { LeaderboardSnapshotEntry(it.userId, it.xp) }
            val previous = snapshotCache.lastSnapshot
            if (previous != null && wasOvertaken(previous, current, me)) showToast("Someone passed you on the leaderboard!")
            snapshotCache.lastSnapshot = current
        }
    }

    fun block(target: SocialTarget) {
        viewModelScope.launch {
            val ok = runCatching { client.blockUser(target.id) }.getOrNull()?.first == true
            if (ok) {
                _state.update { it.copy(rows = it.rows.filterNot { r -> r.userId == target.id }) }
                showToast("${target.displayName} blocked.")
            } else {
                showToast("Couldn't block ${target.displayName}. Try again.")
            }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }

    private fun showToast(message: String) = _state.update { it.copy(toast = message) }

    /** Last week's XP between the two Mondays, today's global weekly rank, and a promotion since the last recap. */
    fun loadRecap() {
        val me = userId ?: run { _recap.value = RecapState(isLoading = false); return }
        _recap.value = RecapState()
        viewModelScope.launch {
            val now = nowMillis()
            val xp = runCatching { client.fetchActivityXp(me, mondayDateString(1, now), mondayDateString(0, now)) }.getOrDefault(0)
            val rank = runCatching { client.fetchLeaderboard("global", "weekly") }.getOrNull()?.indexOfFirst { it.userId == me }?.takeIf { it >= 0 }?.plus(1)
            val current = tierCache.lastKnownTier
            val previous = recapCache.lastRecapLeagueTier
            val promoted = if (current != null && previous != null && isLeaguePromotion(previous, current)) current else null
            recapCache.lastRecapLeagueTier = current
            _recap.value = RecapState(isLoading = false, lastWeekXp = xp, currentRank = rank, promotedToTier = promoted)
        }
    }
}
