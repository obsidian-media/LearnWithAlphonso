package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.FriendActivityEvent
import com.obsidianmedia.learnwithalphonso.core.net.FriendInvitePreview
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.acceptFriendInvite
import com.obsidianmedia.learnwithalphonso.core.net.blockUser
import com.obsidianmedia.learnwithalphonso.core.net.fetchFriendActivity
import com.obsidianmedia.learnwithalphonso.core.net.fetchFriendsProgress
import com.obsidianmedia.learnwithalphonso.core.net.fetchUnreadNudges
import com.obsidianmedia.learnwithalphonso.core.net.getFriendInvitePreview
import com.obsidianmedia.learnwithalphonso.core.net.getMyFriendCode
import com.obsidianmedia.learnwithalphonso.core.net.markNudgesRead
import com.obsidianmedia.learnwithalphonso.core.net.removeFriend
import com.obsidianmedia.learnwithalphonso.core.net.sendNudge
import com.obsidianmedia.learnwithalphonso.data.NudgeCooldownCache
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FriendsUiState(
    val isLoading: Boolean = true,
    val friends: List<FriendProgress> = emptyList(),
    val activity: List<FriendActivityEvent> = emptyList(),
    val inviteLink: String? = null,
    val error: String? = null,
    val toast: String? = null,
    /** Bumped whenever a nudge is recorded so rows re-evaluate their cooldown. */
    val nudgeVersion: Int = 0,
)

/** Port of FriendsView.swift over the opaque-code invite contract. */
class FriendsViewModel(
    private val client: ProgressSyncClient,
    private val nudgeCache: NudgeCooldownCache,
    private val userId: String?,
    private val apiBaseUrl: String,
) : ViewModel() {
    private val _state = MutableStateFlow(FriendsUiState())
    val state: StateFlow<FriendsUiState> = _state.asStateFlow()

    init { loadAll() }

    fun loadAll() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val friends = runCatching { client.fetchFriendsProgress() }
            val activity = runCatching { client.fetchFriendActivity() }.getOrDefault(emptyList())
            val code = runCatching { client.getMyFriendCode() }.getOrNull()
            _state.update {
                it.copy(
                    isLoading = false,
                    friends = friends.getOrDefault(emptyList()),
                    activity = activity,
                    inviteLink = code?.let { c -> "${apiBaseUrl.trimEnd('/')}/invite/$c" },
                    error = if (friends.isFailure) "Check your connection and try again." else null,
                )
            }
            checkForNudges()
        }
    }

    fun displayName(userId: String): String = when (userId) {
        this.userId -> "You"
        else -> _state.value.friends.firstOrNull { it.userId == userId }?.displayName ?: "A friend"
    }

    fun canNudge(friend: FriendProgress): Boolean = nudgeCache.canNudge(friend.userId)

    fun nudge(friend: FriendProgress) {
        viewModelScope.launch {
            if (runCatching { client.sendNudge(friend.userId) }.isSuccess) {
                nudgeCache.recordNudge(friend.userId)
                _state.update { it.copy(nudgeVersion = it.nudgeVersion + 1) }
            }
        }
    }

    fun remove(friend: FriendProgress) {
        viewModelScope.launch {
            val r = runCatching { client.removeFriend(friend.userId) }.getOrNull()
            if (r?.first == true) _state.update { it.copy(friends = it.friends.filterNot { f -> f.userId == friend.userId }) }
        }
    }

    /** Removes the person from friends and from the activity feed at once (Plan 2 Review Focus 1). */
    fun block(friend: FriendProgress) {
        viewModelScope.launch {
            val ok = runCatching { client.blockUser(friend.userId) }.getOrNull()?.first == true
            if (ok) {
                _state.update {
                    it.copy(
                        friends = it.friends.filterNot { f -> f.userId == friend.userId },
                        activity = it.activity.filterNot { e -> e.userId == friend.userId },
                        toast = "${friend.displayName} blocked.",
                    )
                }
            } else {
                _state.update { it.copy(toast = "Couldn't block ${friend.displayName}. Try again.") }
            }
        }
    }

    fun checkForNudges() {
        viewModelScope.launch {
            val unread = runCatching { client.fetchUnreadNudges() }.getOrNull()?.takeIf { it.isNotEmpty() } ?: return@launch
            val names = unread.map { displayName(it.senderId) }
            val message = if (names.size == 1) "${names[0]} nudged you!" else "${names.size} friends nudged you!"
            _state.update { it.copy(toast = message) }
            runCatching { client.markNudgesRead(unread.map { it.id }) }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }

    fun activityCopy(event: FriendActivityEvent): String {
        val name = displayName(event.userId)
        return when (event.eventType) {
            "lesson_completed" -> "$name completed a lesson (+${event.xpGain ?: 0} XP)"
            "streak_milestone" -> "$name hit a ${event.streak ?: 0}-day streak"
            "league_promotion" -> "$name moved up to ${(event.newTier ?: "a new league").replaceFirstChar { it.uppercase() }}"
            else -> "$name made progress"
        }
    }
}

sealed interface InviteState {
    data object Loading : InviteState
    data object Self : InviteState
    data object Invalid : InviteState
    data class Ready(val inviterName: String) : InviteState
    data class Accepted(val inviterName: String) : InviteState
    data class Error(val message: String) : InviteState
}

/** Port of the web's invite.$code route: preview first, then a single accept. */
class InviteAcceptViewModel(private val client: ProgressSyncClient, private val code: String) : ViewModel() {
    private val _state = MutableStateFlow<InviteState>(InviteState.Loading)
    val state: StateFlow<InviteState> = _state.asStateFlow()
    private var inviterName = "your friend"

    init {
        viewModelScope.launch {
            val preview: FriendInvitePreview? = runCatching { client.getFriendInvitePreview(code) }.getOrNull()
            _state.value = when {
                preview == null -> InviteState.Error("Couldn't load this invite. Check your connection and try again.")
                preview.isSelf -> InviteState.Self
                !preview.ok -> InviteState.Invalid
                else -> { inviterName = preview.displayName ?: "your friend"; InviteState.Ready(inviterName) }
            }
        }
    }

    fun accept() {
        if (_state.value !is InviteState.Ready) return
        viewModelScope.launch {
            val r = runCatching { client.acceptFriendInvite(code) }.getOrNull()
            _state.value = when {
                r == null -> InviteState.Error("Couldn't accept the invite. Try again.")
                r.first -> InviteState.Accepted(inviterName)
                r.second == "invalid-code" -> InviteState.Invalid
                r.second == "cannot invite yourself" -> InviteState.Self
                else -> InviteState.Error("Couldn't accept the invite (${r.second}).")
            }
        }
    }
}
