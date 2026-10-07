package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyCopy
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyMessage
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyPool
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyRequest
import com.obsidianmedia.learnwithalphonso.core.buddy.MyBuddy
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.cancelBuddyRequest
import com.obsidianmedia.learnwithalphonso.core.net.endBuddy
import com.obsidianmedia.learnwithalphonso.core.net.blockUser
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyMessages
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.joinBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.leaveBuddyPool
import com.obsidianmedia.learnwithalphonso.core.net.getBuddyRequests
import com.obsidianmedia.learnwithalphonso.core.net.getMyBuddy
import com.obsidianmedia.learnwithalphonso.core.net.requestBuddy
import com.obsidianmedia.learnwithalphonso.core.net.respondBuddyRequest
import com.obsidianmedia.learnwithalphonso.core.net.sendBuddyMessage
import com.obsidianmedia.learnwithalphonso.ui.league.SectionCard
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BuddyUiState(
    val isLoading: Boolean = true,
    /** The first result arrived; later reloads keep the section on screen instead of a spinner. */
    val hasLoaded: Boolean = false,
    /** The lookup itself failed: that is not "no buddy", and the section must not offer to ask a friend. */
    val loadFailed: Boolean = false,
    val buddy: MyBuddy? = null,
    val requests: List<BuddyRequest> = emptyList(),
    /** The active pair's newest messages, oldest first (empty while unpaired). */
    val messages: List<BuddyMessage> = emptyList(),
    /** Opt-in matching state while unpaired (null while paired). */
    val pool: BuddyPool? = null,
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

    /** True when this reload's result was applied (it was still the newest one). */
    private suspend fun reload(): Boolean {
        val generation = ++loadGeneration
        _state.update { it.copy(isLoading = true) }
        return try {
            val buddy = client.getMyBuddy()
            val requests = client.getBuddyRequests()
            // Messages only while paired; their failure is a load failure, never an empty history.
            val messages = if (buddy == null) emptyList() else client.getBuddyMessages()
            // Matching state only while unpaired; its failure is a load failure, never "matching is off".
            val pool = if (buddy == null) client.getBuddyPool() else null
            if (generation != loadGeneration) return false
            // An answer describes the state before this reload; it must not outlive it (web: the stamp in BuddyCard).
            _state.update {
                it.copy(isLoading = false, hasLoaded = true, loadFailed = false, buddy = buddy, requests = requests, messages = messages, pool = pool, message = null)
            }
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (generation == loadGeneration) _state.update { it.copy(isLoading = false, loadFailed = true) }
            false
        }
    }

    fun ask(friendId: String) = act { client.requestBuddy(friendId) }
    fun respond(request: BuddyRequest, accept: Boolean) = act { client.respondBuddyRequest(request.requestId, accept) }
    fun cancel(request: BuddyRequest) = act { client.cancelBuddyRequest(request.requestId) }
    fun end() = act { client.endBuddy() }
    fun send(presetId: String) = act { client.sendBuddyMessage(presetId) }
    fun join(course: String, ageConfirmed: Boolean) = act { client.joinBuddyPool(course, ageConfirmed) }
    fun leave() = act { client.leaveBuddyPool() }

    /** Blocking a matched buddy ends the pair on the server (trigger); reload to show it. */
    fun block(userId: String) {
        _state.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            val blocked = try {
                client.blockUser(userId).first
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                false
            }
            reload()
            _state.update { it.copy(busy = false, message = if (blocked) it.message else BuddyCopy.statusMessage("unknown")) }
        }
    }

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
            // The answer is shown only with the state its own reload produced; a superseded reload drops it.
            val applied = reload()
            _state.update { it.copy(busy = false, message = if (applied) text else it.message) }
        }
    }
}

@Composable
fun BuddySection(vm: BuddyViewModel, friends: List<FriendProgress>, onReport: (SocialTarget) -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    var confirmingEnd by remember { mutableStateOf(false) }
    var choosingPreset by remember { mutableStateOf(false) }
    var blockTarget by remember { mutableStateOf<SocialTarget?>(null) }
    // Declared-age confirmation for matching (owner decision: minimum age 13); the server refuses without it.
    var ageConfirmed by remember { mutableStateOf(false) }

    // Refreshes when the screen comes back and every minute while it is visible (no realtime socket); stops in the background.
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(vm, lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            // Load on every return to the foreground, then every minute while visible.
            while (true) {
                vm.load()
                delay(60_000)
            }
        }
    }

    SectionCard("Study buddy") {
        val buddy = state.buddy
        when {
            !state.hasLoaded && !state.loadFailed ->
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            state.loadFailed -> {
                Text(BuddyCopy.LOAD_FAILED, color = palette.ink)
                TextButton(onClick = { vm.load() }) { Text("Try again", color = palette.moss) }
            }
            buddy != null -> {
                Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(buddy.buddyName, style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.weight(1f))
                        if (buddy.isMatch) {
                            Text(BuddyCopy.MATCHED_LABEL, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                            // A matched buddy is not a friend: block and report live right here (guideline 1.2).
                            SocialSafetyMenu(
                                onBlock = { blockTarget = SocialTarget(buddy.buddyId, buddy.buddyName) },
                                onReport = { onReport(SocialTarget(buddy.buddyId, buddy.buddyName)) },
                            )
                        }
                    }
                    Text(BuddyCopy.weekLine(buddy.myCount, buddy.buddyCount, buddy.goal), color = palette.ink)
                    Text(BuddyCopy.streakLine(buddy.streakWeeks), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    Text(BuddyCopy.graceLine(buddy.graceAvailable), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                }
                Box {
                    TextButton(onClick = { choosingPreset = true }, enabled = !state.busy) {
                        Text("Send ${buddy.buddyName} a message", color = palette.moss)
                    }
                    DropdownMenu(expanded = choosingPreset, onDismissRequest = { choosingPreset = false }) {
                        BuddyCopy.PRESETS.forEach { preset ->
                            DropdownMenuItem(text = { Text(preset.text) }, onClick = { choosingPreset = false; vm.send(preset.id) })
                        }
                    }
                }
                state.messages.takeLast(10).forEach { m ->
                    BuddyCopy.messageLine(m.isMine, buddy.buddyName, m.presetId)?.let { line ->
                        Text(line, style = MaterialTheme.typography.bodySmall, color = palette.ink)
                    }
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
                // Opt-in matching. A waiting learner can always stop looking, even while matching is switched off.
                val pool = state.pool
                // A local copy: BuddyPool lives in :core, and Kotlin does not smart-cast another module's properties.
                val waitingCourse = pool?.takeIf { it.waiting }?.course
                if (pool != null && waitingCourse != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(BuddyCopy.waitingLine(waitingCourse), color = palette.ink, modifier = Modifier.weight(1f))
                        TextButton(onClick = { vm.leave() }, enabled = !state.busy) { Text(BuddyCopy.STOP_LOOKING, color = palette.inkSoft) }
                    }
                } else if (pool != null && pool.matchingEnabled && pool.courses.isNotEmpty()) {
                    Text(BuddyCopy.POOL_INTRO, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = ageConfirmed, onCheckedChange = { ageConfirmed = it })
                        Text(BuddyCopy.AGE_CONFIRM, color = palette.ink)
                    }
                    pool.courses.forEach { course ->
                        TextButton(onClick = { vm.join(course, ageConfirmed) }, enabled = !state.busy && ageConfirmed) {
                            Text(BuddyCopy.findButton(course), color = palette.moss)
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

    BlockConfirmDialog(blockTarget, onConfirm = { t -> blockTarget = null; vm.block(t.id) }, onDismiss = { blockTarget = null })

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
