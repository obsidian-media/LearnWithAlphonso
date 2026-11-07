package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.audio.SoundEffectsPlayer
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.avatar.ReplyVerdict
import com.obsidianmedia.learnwithalphonso.core.content.Campaign
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Scenario
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy
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
    /**
     * Positions of turns we wrote ourselves (a scene's fixed opening line) as opposed to model replies. Tracked by
     * position, so a model reply that repeats an opener's words is still a model reply (and reportable).
     */
    val openerIndices: Set<Int> = setOf(0),
    /** The server's verdict on the learner's last turn, numbered so one reply is reacted to once. */
    val verdictSerial: Int = 0,
    val verdict: ReplyVerdict = ReplyVerdict.NONE,
)

/** Plays reply audio; the app passes AudioPlayback, tests a no-op. */
fun interface ReplyPlayer { suspend fun play(bytes: ByteArray): Boolean }

/**
 * Shared transcribe-think-speak pipeline behind Practice scenarios and
 * Campaigns (ConversationView.swift, CampaignView.swift). `systemPrompt()`
 * is what differs between them.
 */
abstract class BaseConversationViewModel(
    private val recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    protected val ai: AiConversationClient,
    private val progress: ProgressSyncClient,
    private val player: ReplyPlayer,
    opener: String,
    /** The course the conversation is in: its scenario text, and the language of transcription, replies and speech. */
    protected val course: Course = Course.ENGLISH,
    /** Alphonso's chosen voice for a course (Settings > Voices); null lets the server pick the default. */
    private val alphonsoVoice: (String) -> String? = { null },
    /** Spoken openers already fetched; tests pass their own. */
    private val openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
) : ViewModel(), com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation {
    protected val _state = MutableStateFlow(ConversationUiState(turns = listOf(ChatMessage("assistant", opener))))
    override val state: StateFlow<ConversationUiState> = _state.asStateFlow()
    override val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", course.code, timing) }, viewModelScope)
    private var analysed = false
    // The opener being fetched or spoken; a press cancels it, which stops its playback.
    private val opener by lazy {
        OpenerSpeaker(
            viewModelScope, _state, { engine.phase.value == com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase.IDLE },
            player, openerCache, course.code,
        ) { text, voice -> ai.synthesizeSpeech(text, voice = voice, course = course.code) }
    }

    protected abstract fun systemPrompt(): String

    init {
        viewModelScope.launch { _state.update { it.copy(cefrLevel = runCatching { progress.fetchCefrLevel(course.code) }.getOrNull()) } }
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

    /** The microphone level while recording (the call's "You" tile), null otherwise. */
    override fun micLevelDBFS(): Double? = recorder.levelDBFS()

    override fun pressBegan() { stopOpener(); _state.update { it.copy(error = null, phase = ConversationPhase.IDLE) }; engine.pressBegan() }
    override fun pressEnded() { engine.pressEnded(); if (engine.phase.value == com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase.TRANSCRIBING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) } }

    /** Campaign only: a finished campaign has no line left to say. */
    protected open val conversationFinished: Boolean get() = false

    /**
     * The opening line Alphonso still has to say: the latest turn when it is one of our own openers (the learner has
     * not answered it yet). The opener is seeded locally, so it never went through [sendTurn]'s synthesize-and-play
     * (build 59 showed it and stayed silent).
     */
    val pendingOpener: String?
        get() {
            val s = _state.value
            val last = s.turns.lastIndex
            if (conversationFinished || last < 0 || last !in s.openerIndices) return null
            return s.turns[last].content.trim().ifEmpty { null }
        }

    /**
     * Says the pending opener in Alphonso's chosen voice through the same player as a reply, so the call's lips and
     * caption follow it. The screen calls it once the AI consent gate is passed; a new scene or a restart calls it
     * too. A reply still playing finishes first. Thinking while the voice loads, speaking while it plays; never over
     * a recording. Holding to talk cancels it, which stops its playback.
     */
    fun speakOpener() = opener.speak({ pendingOpener }, { alphonsoVoice(course.code) })

    /** The learner talked over the opener, or left: cancel it, which stops its playback. */
    private fun stopOpener() = opener.stop()

    private suspend fun sendTurn(text: String, confidence: Double?) {
        _state.update { s ->
            s.copy(
                turns = s.turns + ChatMessage("user", text),
                confidenceByTurn = if (confidence != null) s.confidenceByTurn + (s.turns.size to confidence) else s.confidenceByTurn,
                phase = ConversationPhase.THINKING,
            )
        }
        try {
            val chatReply = ai.chatReply(_state.value.turns, systemPrompt(), _state.value.cefrLevel, course.code)
            val reply = chatReply.content
            _state.update {
                it.copy(turns = it.turns + ChatMessage("assistant", reply), phase = ConversationPhase.SPEAKING, verdictSerial = it.verdictSerial + 1, verdict = chatReply.verdict)
            }
            onReply(reply)
            val audio = ai.synthesizeSpeech(reply, voice = alphonsoVoice(course.code), course = course.code)
            if (!player.play(audio)) _state.update { it.copy(error = "Got a reply, but couldn't play it back.") }
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            _state.update { it.copy(error = AiErrorCopy.userMessage(e), phase = ConversationPhase.IDLE) }
        }
    }

    protected open fun onReply(reply: String) {}

    /** The composable left (rotation, tab switch): cancel any recording; the view model and its transcript survive. */
    fun onLeave() { stopOpener(); engine.cancel() }

    /** The screen is really gone: tear down and, with a real conversation behind us, analyse it once, best effort. */
    /** Public (wider than ViewModel's protected) so the test can drive the real clear path. */
    public override fun onCleared() {
        engine.tearDown()
        if (analysed || _state.value.turns.size < 4) return
        analysed = true
        val transcript = _state.value.turns
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { runCatching { ai.analyzeWeaknesses(transcript, course.code) } }
    }

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
    course: Course = Course.ENGLISH,
    alphonsoVoice: (String) -> String? = { null },
    openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, scenario.opener, course, alphonsoVoice, openerCache) {
    override fun systemPrompt(): String = scenario.systemPrompt
}

data class CampaignProgress(val sceneIndex: Int = 0, val sceneAnchor: Int = 0, val finished: Boolean = false)

/** Adds scenes with a minimum of user turns each, continue and restart, to the shared pipeline. */
class CampaignConversationViewModel(
    val campaign: Campaign,
    recorder: RecorderPort, requestMic: suspend () -> Boolean, ai: AiConversationClient, progress: ProgressSyncClient, player: ReplyPlayer,
    course: Course = Course.ENGLISH,
    alphonsoVoice: (String) -> String? = { null },
    openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, campaign.scenes[0].opener, course, alphonsoVoice, openerCache) {
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
        _state.update { it.copy(turns = it.turns + ChatMessage("assistant", next.opener), openerIndices = it.openerIndices + it.turns.size, error = null) }
        _campaign.update { it.copy(sceneIndex = it.sceneIndex + 1, sceneAnchor = _state.value.turns.size - 1) }
        speakOpener()
    }

    override val conversationFinished: Boolean get() = _campaign.value.finished

    fun restartScene() {
        val anchor = _campaign.value.sceneAnchor
        _state.update { it.copy(turns = it.turns.take(anchor + 1), openerIndices = it.openerIndices.filter { i -> i <= anchor }.toSet(), error = null) }
        speakOpener()
    }
}
