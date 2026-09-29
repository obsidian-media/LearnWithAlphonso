package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.Duel
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.blockUser
import com.obsidianmedia.learnwithalphonso.core.net.createDuel
import com.obsidianmedia.learnwithalphonso.core.net.fetchFriendsProgress
import com.obsidianmedia.learnwithalphonso.core.net.fetchMyDuels
import com.obsidianmedia.learnwithalphonso.core.net.joinOpenDuelQueue
import com.obsidianmedia.learnwithalphonso.core.net.leaveOpenDuelQueue
import com.obsidianmedia.learnwithalphonso.core.net.respondToDuel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DuelsUiState(
    val isLoading: Boolean = true,
    val duels: List<Duel> = emptyList(),
    val friends: List<FriendProgress> = emptyList(),
    val error: String? = null,
    val queueing: Boolean = false,
    val waitingInQueue: Boolean = false,
)

/** Port of DuelsView.swift. */
class DuelsViewModel(private val client: ProgressSyncClient, private val userId: String?) : ViewModel() {
    private val _state = MutableStateFlow(DuelsUiState())
    val state: StateFlow<DuelsUiState> = _state.asStateFlow()

    val pending: List<Duel> get() = _state.value.duels.filter { it.status == "pending" && it.opponentId == userId }
    val active: List<Duel> get() = _state.value.duels.filter { it.status == "active" }
    val finished: List<Duel> get() = _state.value.duels.filter { it.status == "completed" || it.status == "declined" }

    init { loadAll() }

    fun loadAll() {
        viewModelScope.launch {
            val duels = runCatching { client.fetchMyDuels() }.getOrDefault(emptyList())
            val friends = runCatching { client.fetchFriendsProgress() }.getOrDefault(emptyList())
            _state.update { it.copy(isLoading = false, duels = duels, friends = friends) }
        }
    }

    fun respond(duel: Duel, accept: Boolean) {
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            val r = runCatching { client.respondToDuel(duel.duelId, accept) }.getOrNull()
            if (r == null) _state.update { it.copy(error = "Check your connection and try again.") }
            else if (r.ok) loadAll() else _state.update { it.copy(error = r.reason) }
        }
    }

    fun challenge(friendId: String, course: String) {
        if (friendId.isEmpty()) return
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            val r = runCatching { client.createDuel(friendId, course) }.getOrNull()
            if (r == null) _state.update { it.copy(error = "Check your connection and try again.") }
            else if (r.ok) loadAll() else _state.update { it.copy(error = r.reason) }
        }
    }

    fun joinQueue(course: String, matchByLevel: Boolean) {
        _state.update { it.copy(queueing = true, error = null) }
        viewModelScope.launch {
            val r = runCatching { client.joinOpenDuelQueue(course, matchByLevel) }.getOrNull()
            when {
                r == null -> _state.update { it.copy(queueing = false, error = "Check your connection and try again.") }
                r.first -> { _state.update { it.copy(queueing = false, waitingInQueue = false) }; loadAll() }
                else -> _state.update { it.copy(queueing = false, waitingInQueue = true) }
            }
        }
    }

    fun leaveQueue() {
        viewModelScope.launch {
            runCatching { client.leaveOpenDuelQueue() }
            _state.update { it.copy(waitingInQueue = false) }
        }
    }

    fun block(opponentId: String) {
        viewModelScope.launch {
            val r = runCatching { client.blockUser(opponentId) }.getOrNull()
            _state.update { it.copy(error = if (r?.first == true) null else (r?.second?.takeIf { m -> m.isNotEmpty() } ?: "Couldn't block. Try again.")) }
            if (r?.first == true) loadAll()
        }
    }

    fun opponentId(d: Duel): String = if (d.challengerId == userId) d.opponentId else d.challengerId
    fun myDelta(d: Duel): Int = if (d.challengerId == userId) d.challengerXpNow - d.challengerXpStart else d.opponentXpNow - d.opponentXpStart
    fun theirDelta(d: Duel): Int = if (d.challengerId == userId) d.opponentXpNow - d.opponentXpStart else d.challengerXpNow - d.challengerXpStart

    fun resultLabel(d: Duel): String = when {
        d.status == "declined" -> "Declined"
        d.winnerId == userId -> "You won"
        d.winnerId != null -> "You lost"
        else -> "Tied"
    }
}
