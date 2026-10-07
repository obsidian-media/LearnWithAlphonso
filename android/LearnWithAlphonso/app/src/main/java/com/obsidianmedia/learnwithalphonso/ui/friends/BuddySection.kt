package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyCopy
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyRequest
import com.obsidianmedia.learnwithalphonso.core.buddy.MyBuddy
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.cancelBuddyRequest
import com.obsidianmedia.learnwithalphonso.core.net.endBuddy
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyRequests
import com.obsidianmedia.learnwithalphonso.core.net.getMyBuddy
import com.obsidianmedia.learnwithalphonso.core.net.requestBuddy
import com.obsidianmedia.learnwithalphonso.core.net.respondBuddyRequest
import com.obsidianmedia.learnwithalphonso.ui.league.SectionCard
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BuddyUiState(
    val isLoading: Boolean = true,
    /** The lookup itself failed: that is not "no buddy", and the section must not offer to ask a friend. */
    val loadFailed: Boolean = false,
    val buddy: MyBuddy? = null,
    val requests: List<BuddyRequest> = emptyList(),
    /** An action is running, or its reload has not landed yet: a second tap could act on a request that is gone. */
    val busy: Boolean = false,
    /** The last action's answer in fixed wording (BuddyCopy.statusMessage). */
    val message: String? = null,
) {
    /** Friends with no pending request either way (the server answers the rest, but offering them would only fail). */
    fun askable(friends: List<FriendProgress>): List<FriendProgress> {
        val pending = requests.map { it.otherId }.toSet()
        return friends.filter { it.userId !in pending }
    }
}

/**
 * The Friends screen's study buddy section (study together Phase 4; web: src/components/BuddyCard.tsx, iOS:
 * BuddySectionView.swift). Only the newest load is applied; a cancelled load is rethrown, never reported as a failure.
 */
class BuddyViewModel(private val client: ProgressSyncClient) : ViewModel() {
    private val _state = MutableStateFlow(BuddyUiState())
    val state: StateFlow<BuddyUiState> = _state.asStateFlow()
    private var loadGeneration = 0

    init { load() }

    fun load() { viewModelScope.launch { reload() } }

    private suspend fun reload() {
        val generation = ++loadGeneration
        _state.update { it.copy(isLoading = true) }
        try {
            val buddy = client.getMyBuddy()
            val requests = client.getBuddyRequests()
            if (generation != loadGeneration) return
            _state.update { it.copy(isLoading = false, loadFailed = false, buddy = buddy, requests = requests) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (generation != loadGeneration) return
            _state.update { it.copy(isLoading = false, loadFailed = true) }
        }
    }

    fun ask(friendId: String) = act { client.requestBuddy(friendId) }
    fun respond(request: BuddyRequest, accept: Boolean) = act { client.respondBuddyRequest(request.requestId, accept) }
    fun cancel(request: BuddyRequest) = act { client.cancelBuddyRequest(request.requestId) }
    fun end() = act { client.endBuddy() }

    private fun act(action: suspend () -> String) {
        _state.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            val text = try {
                BuddyCopy.statusMessage(action())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                BuddyCopy.statusMessage("unknown")
            }
            reload()
            _state.update { it.copy(busy = false, message = text) }
        }
    }
}

@Composable
fun BuddySection(vm: BuddyViewModel, friends: List<FriendProgress>) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    var confirmingEnd by remember { mutableStateOf(false) }

    SectionCard("Study buddy") {
        val buddy = state.buddy
        when {
            state.isLoading && buddy == null && !state.loadFailed ->
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            state.loadFailed -> {
                Text(BuddyCopy.LOAD_FAILED, color = palette.ink)
                TextButton(onClick = { vm.load() }) { Text("Try again", color = palette.moss) }
            }
            buddy != null -> {
                Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(buddy.buddyName, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                    Text(BuddyCopy.weekLine(buddy.myCount, buddy.buddyCount, buddy.goal), color = palette.ink)
                    Text(BuddyCopy.streakLine(buddy.streakWeeks), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    Text(BuddyCopy.graceLine(buddy.graceAvailable), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                }
                TextButton(onClick = { confirmingEnd = true }, enabled = !state.busy) { Text("End study buddy", color = palette.destructive) }
            }
            else -> {
                Text(BuddyCopy.INTRO, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                state.requests.forEach { r ->
                    if (r.direction == BuddyRequest.Direction.INCOMING) {
                        Text(BuddyCopy.incomingLine(r.otherName), color = palette.ink)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { vm.respond(r, accept = true) }, enabled = !state.busy) { Text("Accept", color = palette.moss) }
                            TextButton(onClick = { vm.respond(r, accept = false) }, enabled = !state.busy) { Text("Decline", color = palette.inkSoft) }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(BuddyCopy.outgoingLine(r.otherName), color = palette.ink, modifier = Modifier.weight(1f))
                            TextButton(onClick = { vm.cancel(r) }, enabled = !state.busy) { Text("Cancel request", color = palette.inkSoft) }
                        }
                    }
                }
                val askable = state.askable(friends)
                if (askable.isNotEmpty()) {
                    Text("Ask a friend to be your study buddy", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    askable.forEach { f ->
                        TextButton(onClick = { vm.ask(f.userId) }, enabled = !state.busy) { Text(f.displayName, color = palette.moss) }
                    }
                }
            }
        }
        state.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
    }

    if (confirmingEnd) {
        AlertDialog(
            onDismissRequest = { confirmingEnd = false },
            title = { Text(BuddyCopy.endConfirm(state.buddy?.buddyName ?: "your buddy")) },
            confirmButton = {
                TextButton(onClick = { confirmingEnd = false; vm.end() }) { Text("Yes, end", color = palette.destructive) }
            },
            dismissButton = { TextButton(onClick = { confirmingEnd = false }) { Text("Keep") } },
        )
    }
}
