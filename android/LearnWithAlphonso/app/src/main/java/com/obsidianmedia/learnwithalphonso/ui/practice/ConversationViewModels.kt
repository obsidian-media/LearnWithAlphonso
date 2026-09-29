package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.Campaign
import com.obsidianmedia.learnwithalphonso.core.content.Scenario
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ConversationPhase { IDLE, TRANSCRIBING, THINKING, SPEAKING }

data class ConversationUiState(
    val turns: List<ChatMessage> = emptyList(),
    val phase: ConversationPhase = ConversationPhase.IDLE,
    val error: String? = null,
    val confidenceByTurn: Map<Int, Double> = emptyMap(),
    val cefrLevel: String? = null,
)

/** Plays reply audio; the app passes AudioPlayback, tests a no-op. */
fun interface ReplyPlayer { suspend fun play(bytes: ByteArray): Boolean }

/**
 * Shared transcribe-think-speak pipeline behind Practice scenarios and
 * Campaigns (ConversationView.swift, CampaignView.swift). `systemPrompt()`
 * is what differs between them.
 */
abstract class BaseConversationViewModel(
    recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    protected val ai: AiConversationClient,
    private val progress: ProgressSyncClient,
    private val player: ReplyPlayer,
    opener: String,
) : ViewModel() {
    protected val _state = MutableStateFlow(ConversationUiState(turns = listOf(ChatMessage("assistant", opener))))
    val state: StateFlow<ConversationUiState> = _state.asStateFlow()
    val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", null, timing) }, viewModelScope)
    private var analysed = false

    protected abstract fun systemPrompt(): String

    init {
        viewModelScope.launch { _state.update { it.copy(cefrLevel = runCatching { progress.fetchCefrLevel("en") }.getOrNull()) } }
        viewModelScope.launch {
            engine.events.collect { event ->
                when (event) {
                    is TurnEvent.Transcribed -> sendTurn(event.text, event.confidence)
                    TurnEvent.Empty -> _state.update { it.copy(error = "Didn't catch that. Try again.", phase = ConversationPhase.IDLE) }
                    TurnEvent.MicDenied -> _state.update { it.copy(error = "Couldn't access the microphone. Check Settings > Apps > Learn with Alphonso > Permissions.", phase = ConversationPhase.IDLE) }
                    is TurnEvent.Failed -> _state.update { it.copy(error = "Something went wrong. Try again.", phase = ConversationPhase.IDLE) }
                }
            }
        }
    }

    fun pressBegan() { _state.update { it.copy(error = null, phase = ConversationPhase.IDLE) }; engine.pressBegan() }
    fun pressEnded() { engine.pressEnded(); if (engine.phase.value == com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase.TRANSCRIBING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) } }

    private suspend fun sendTurn(text: String, confidence: Double?) {
        _state.update { s ->
            s.copy(
                turns = s.turns + ChatMessage("user", text),
                confidenceByTurn = if (confidence != null) s.confidenceByTurn + (s.turns.size to confidence) else s.confidenceByTurn,
                phase = ConversationPhase.THINKING,
            )
        }
        try {
            val reply = ai.chat(_state.value.turns, systemPrompt(), _state.value.cefrLevel)
            _state.update { it.copy(turns = it.turns + ChatMessage("assistant", reply), phase = ConversationPhase.SPEAKING) }
            onReply(reply)
            val audio = ai.synthesizeSpeech(reply)
            if (!player.play(audio)) _state.update { it.copy(error = "Got a reply, but couldn't play it back.") }
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            val message = (e as? AiConversationError.Server)?.serverMessage?.takeIf { it.isNotEmpty() } ?: "Something went wrong. Try again."
            _state.update { it.copy(error = message, phase = ConversationPhase.IDLE) }
        }
    }

    protected open fun onReply(reply: String) {}

    /** Leaving: cancel any recording and, with a real conversation behind us, analyse it once, best effort. */
    fun onLeave() {
        engine.tearDown()
        if (analysed || _state.value.turns.size < 4) return
        analysed = true
        val transcript = _state.value.turns
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { runCatching { ai.analyzeWeaknesses(transcript) } }
    }

    override fun onCleared() = onLeave()

    companion object {
        fun clarityLabel(confidence: Double): String = when {
            confidence >= 0.85 -> "🟢 Clear"
            confidence >= 0.6 -> "🟡 Okay"
            else -> "🔴 Unclear"
        }
    }
}

class ScenarioConversationViewModel(
    val scenario: Scenario,
    recorder: RecorderPort, requestMic: suspend () -> Boolean, ai: AiConversationClient, progress: ProgressSyncClient, player: ReplyPlayer,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, scenario.opener) {
    override fun systemPrompt(): String = scenario.systemPrompt
}

data class CampaignProgress(val sceneIndex: Int = 0, val sceneAnchor: Int = 0, val finished: Boolean = false)

/** Adds scenes with a minimum of user turns each, continue and restart, to the shared pipeline. */
class CampaignConversationViewModel(
    val campaign: Campaign,
    recorder: RecorderPort, requestMic: suspend () -> Boolean, ai: AiConversationClient, progress: ProgressSyncClient, player: ReplyPlayer,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, campaign.scenes[0].opener) {
    private val _campaign = MutableStateFlow(CampaignProgress())
    val campaignState: StateFlow<CampaignProgress> = _campaign.asStateFlow()

    val scene get() = campaign.scenes[_campaign.value.sceneIndex]
    val isLastScene get() = _campaign.value.sceneIndex == campaign.scenes.size - 1
    val userTurnsInScene get() = _state.value.turns.drop(_campaign.value.sceneAnchor).count { it.role == "user" }
    val canContinue get() = userTurnsInScene >= scene.minTurns

    override fun systemPrompt(): String = "${campaign.premise}\n\n${scene.systemPrompt}"

    fun continueToNextScene() {
        if (!canContinue) return
        if (isLastScene) { _campaign.update { it.copy(finished = true) }; return }
        val next = campaign.scenes[_campaign.value.sceneIndex + 1]
        _state.update { it.copy(turns = it.turns + ChatMessage("assistant", next.opener), error = null) }
        _campaign.update { it.copy(sceneIndex = it.sceneIndex + 1, sceneAnchor = _state.value.turns.size - 1) }
    }

    fun restartScene() {
        _state.update { it.copy(turns = it.turns.take(_campaign.value.sceneAnchor + 1), error = null) }
    }
}
