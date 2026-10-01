package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileIdentity
import com.obsidianmedia.learnwithalphonso.core.net.updateProfileAvatarSeed
import com.obsidianmedia.learnwithalphonso.core.net.updateProfileDisplayName
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.random.Random

data class IdentityUiState(val displayName: String = "", val avatarSeed: String = "", val saving: Boolean = false, val shuffling: Boolean = false, val error: String? = null)

/** The Profile section of SettingsView.swift: display name (40 chars) and avatar seed shuffle. */
class IdentityViewModel(private val client: ProgressSyncClient, private val userId: String?, private val random: Random = Random.Default) : ViewModel() {
    private val _state = MutableStateFlow(IdentityUiState())
    val state: StateFlow<IdentityUiState> = _state.asStateFlow()

    init {
        userId?.let { id ->
            viewModelScope.launch {
                runCatching { client.fetchProfileIdentity(id) }.getOrNull()?.let { i -> _state.update { it.copy(displayName = i.displayName, avatarSeed = i.avatarSeed) } }
            }
        }
    }

    fun editName(value: String) = _state.update { it.copy(displayName = value.take(MAX_NAME)) }

    fun saveName() {
        val id = userId ?: return
        val trimmed = _state.value.displayName.trim().take(MAX_NAME)
        if (trimmed.isEmpty()) return
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            val ok = runCatching { client.updateProfileDisplayName(trimmed, id) }.isSuccess
            _state.update { it.copy(saving = false, displayName = if (ok) trimmed else it.displayName, error = if (ok) null else "Couldn't save your name. Try again.") }
        }
    }

    fun shuffleAvatar() {
        val id = userId ?: return
        val next = buildString { repeat(8) { append("0123456789abcdef"[random.nextInt(16)]) } }
        _state.update { it.copy(shuffling = true, error = null) }
        viewModelScope.launch {
            val ok = runCatching { client.updateProfileAvatarSeed(next, id) }.isSuccess
            _state.update { it.copy(shuffling = false, avatarSeed = if (ok) next else it.avatarSeed, error = if (ok) null else "Couldn't shuffle your avatar. Try again.") }
        }
    }

    companion object { const val MAX_NAME = 40 }
}
