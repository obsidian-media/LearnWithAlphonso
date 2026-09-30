package com.obsidianmedia.learnwithalphonso.ui.hector

import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.audio.HoldToTalkButton
import com.obsidianmedia.learnwithalphonso.billing.EntitlementStore
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryContext
import com.obsidianmedia.learnwithalphonso.core.logic.billingPeriodDescription
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationError
import com.obsidianmedia.learnwithalphonso.core.net.fetchWeaknessTrend
import com.obsidianmedia.learnwithalphonso.ui.ai.AiDisclosureGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascot
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class HectorUiState(val turns: List<ChatMessage> = emptyList(), val phase: ConversationPhase = ConversationPhase.IDLE, val error: String? = null)

/**
 * Port of HectorConversationView: the tutor service gets the memory priming
 * turn once at the head of the history (Plan 3 Review Focus 4), then every
 * turn so far.
 */
class HectorViewModel(
    recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    private val tutor: TutorConversationClient,
    private val ai: AiConversationClient,
    private val progress: ProgressSyncClient,
    private val player: ReplyPlayer,
    private val sessionId: String = UUID.randomUUID().toString(),
) : ViewModel() {
    private val _state = MutableStateFlow(HectorUiState())
    val state: StateFlow<HectorUiState> = _state.asStateFlow()
    val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", null, timing) }, viewModelScope)
    private var memoryContext: ChatMessage? = null
    private var analysed = false

    init {
        viewModelScope.launch {
            val level = runCatching { progress.fetchCefrLevel("en") }.getOrNull()
            val open = runCatching { progress.fetchWeaknessTrend() }.getOrDefault(emptyList()).filter { it.openCount > 0 }.map { it.category }
            memoryContext = TutorMemoryContext.buildPrimingMessage(level, open)
        }
        viewModelScope.launch {
            engine.events.collect { event ->
                when (event) {
                    is TurnEvent.Transcribed -> sendTurn(event.text)
                    TurnEvent.Empty -> _state.update { it.copy(error = "Didn't catch that. Try again.", phase = ConversationPhase.IDLE) }
                    TurnEvent.MicDenied -> _state.update { it.copy(error = "Couldn't access the microphone. Check Settings > Apps > Learn with Alphonso > Permissions.", phase = ConversationPhase.IDLE) }
                    is TurnEvent.Failed -> _state.update { it.copy(error = "Something went wrong. Try again.", phase = ConversationPhase.IDLE) }
                }
            }
        }
    }

    fun pressBegan() { _state.update { it.copy(error = null) }; engine.pressBegan() }
    fun pressEnded() { engine.pressEnded(); if (engine.phase.value == TurnPhase.TRANSCRIBING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) } }

    /** Exposed for tests: the history the tutor receives for the next turn. */
    fun historyForTutor(): List<ChatMessage> = listOfNotNull(memoryContext) + _state.value.turns

    private suspend fun sendTurn(text: String) {
        _state.update { it.copy(turns = it.turns + ChatMessage("user", text), phase = ConversationPhase.THINKING) }
        try {
            val reply = tutor.respond(sessionId, text, "en", historyForTutor())
            _state.update { it.copy(turns = it.turns + ChatMessage("assistant", reply.reply), phase = ConversationPhase.SPEAKING) }
            reply.audioBytes()?.let { if (!player.play(it)) _state.update { s -> s.copy(error = "Got a reply, but couldn't play it back.") } }
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            val message = (e as? TutorConversationError.Server)?.serverMessage ?: (e as? AiConversationError.Server)?.serverMessage
            _state.update { it.copy(error = message?.takeIf { m -> m.isNotEmpty() } ?: "Something went wrong. Try again.", phase = ConversationPhase.IDLE) }
        }
    }

    /** The composable left (rotation, tab switch): cancel any recording; the view model survives. */
    fun onLeave() = engine.cancel()

    public override fun onCleared() {
        engine.tearDown()
        if (analysed || _state.value.turns.size < 4) return
        analysed = true
        val transcript = _state.value.turns
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { runCatching { ai.analyzeWeaknesses(transcript) } }
    }
}

@Composable
fun HectorTab(container: AppContainer) {
    val entitlement by container.entitlements.state.collectAsState()
    if (entitlement.isPro) HectorConversation(container) else PaywallScreen(container)
}

@Composable
fun PaywallScreen(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val store: EntitlementStore = container.entitlements
    val state by store.state.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    LaunchedEffect(Unit) { store.loadOffering() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Alphonso Pro", style = MaterialTheme.typography.headlineLarge, color = palette.ink)
        AlphonsoMascotBanner("Meet Hector, your AI tutor", mascot = AlphonsoMascot.HECTOR)
        Text("Hector, your personal AI tutor for voice conversation practice, with memory of your level and weak spots between sessions.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
        when {
            state.isLoading -> CircularProgressIndicator(color = palette.ember)
            state.packages.isEmpty() -> Text("Subscriptions aren't available yet. Check back soon.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center)
            else -> state.packages.forEach { pkg ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    AlphonsoPrimaryButton("Subscribe. ${pkg.priceString}", onClick = { (context as? Activity)?.let { a -> scope.launch { store.purchase(a, pkg) } } })
                    pkg.periodUnit?.let { Text(billingPeriodDescription(it, pkg.periodValue), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            TextButton(onClick = { scope.launch { store.restorePurchases() } }) { Text("Restore Purchases", color = palette.moss) }
            TextButton(onClick = { uriHandler.openUri("https://play.google.com/store/account/subscriptions") }) { Text("Manage Subscription", color = palette.moss) }
        }
        Text("Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period.", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, textAlign = TextAlign.Center)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") }) { Text("Terms of Use", color = palette.inkSoft) }
            TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }) { Text("Privacy Policy", color = palette.inkSoft) }
        }
        state.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, textAlign = TextAlign.Center) }
    }
}

@Composable
private fun HectorConversation(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val playback = remember { container.newPlayback() }
    val vm: HectorViewModel = viewModel {
        HectorViewModel(container.newRecorder(), { container.micPermission.request() }, container.tutorClient, container.aiClient, container.progressClient, { playback.play(it) })
    }
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val listState = rememberLazyListState()
    DisposableEffect(Unit) { onDispose { vm.onLeave() } }
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size - 1) }

    AiDisclosureGate(container.prefs) {
        Column(Modifier.fillMaxSize().background(palette.surface)) {
            Text("Hector", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(16.dp))
            LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                itemsIndexed(state.turns) { _, turn ->
                    val isUser = turn.role == "user"
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
                        if (!isUser) Image(painterResource(R.drawable.mascot_hector), contentDescription = "Hector", contentScale = ContentScale.Crop, modifier = Modifier.size(26.dp).clip(CircleShape))
                        else Spacer(Modifier.width(40.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            turn.content,
                            modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(AlphonsoRadius.xl)).background(if (isUser) palette.ember else palette.parchment).padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodyLarge, color = if (isUser) palette.onAccent else palette.ink,
                        )
                    }
                }
            }
            state.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, modifier = Modifier.padding(horizontal = 16.dp)) }
            val busy = when (state.phase) { ConversationPhase.IDLE -> if (phase == TurnPhase.TRANSCRIBING) "Listening..." else null; ConversationPhase.TRANSCRIBING -> "Listening..."; ConversationPhase.THINKING -> "Thinking..."; ConversationPhase.SPEAKING -> "..." }
            Column(Modifier.padding(16.dp)) {
                HoldToTalkButton(
                    phase = phase, busyLabel = busy, tint = palette.ember,
                    hint = if (phase == TurnPhase.RECORDING) "Listening. Release to send" else "Hold to talk",
                    accessibilityLabel = "Hold to talk to Hector", onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
                )
            }
        }
    }
}
