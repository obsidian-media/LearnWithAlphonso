package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.Analytics
import com.obsidianmedia.learnwithalphonso.audio.SoundEffectsPlayer
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.avatar.ReplyVerdict
import com.obsidianmedia.learnwithalphonso.core.content.Campaign
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Scenario
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeBinding
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.async
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.cancelAndJoin
import com.obsidianmedia.learnwithalphonso.core.logic.PracticeResult
import java.util.UUID

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
    /** The first scene of a transcript resumed from the hub. */
    val sceneOffset: Int = 0,
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
    /** Hands-free (Practice tuning: 2.5 s of quiet ends a turn). Off whenever a call starts; the call sheet's switch turns it on. */
    override val handsFree = HandsFreeBinding.newController(HandsFreeLoop.Tuning.PRACTICE, press = { pressBegan() }, release = { pressEnded() }, cancel = { HandsFreeBinding.releaseMic(engine) })
    private var analysed = false
    /** The after-call recap (CallRecapUi.kt): started when the result arrives, one attempt per call. */
    val recap = CallRecapController(ai, viewModelScope)
    /** The stored hands-free choice starts a call only after the opener has finished (never under it). */
    private val storedStart = HandsFreeBinding.StoredStart(handsFree) { isCallOver }
    override fun armAutoStartHandsFree(check: () -> Boolean) = storedStart.arm(check)

    // The opener being fetched or spoken; a press cancels it, which stops its playback.
    private val opener by lazy {
        OpenerSpeaker(
            viewModelScope, _state, { engine.phase.value == com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase.IDLE },
            // The cache key carries the character: the same words in Hector's voice are not Alphonso's audio.
            player, openerCache, course.code + (speechCharacter?.let { ":${it.wire}" } ?: ""), onFinished = { storedStart.openerFinished() },
        ) { text, voice -> ai.synthesizeSpeech(text, voice = voice, course = course.code, character = speechCharacter) }
    }

    /** Whose voice speaks the replies: null is Alphonso (the server's default); a Hector rehearsal says Hector. */
    protected open val speechCharacter: com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter? get() = null

    /** The words under the call for a refused reply; a rehearsal adds its own (and may open the Pro screen). */
    protected open fun chatErrorMessage(e: Throwable): String = AiErrorCopy.userMessage(e)

    var callId: String = UUID.randomUUID().toString()
        private set
    var startedAt = System.currentTimeMillis()
        private set
    var elapsedSeconds = 0
        private set
    var slip: Pair<String, String>? = null
        private set
    private val _result = MutableStateFlow<PracticeResult?>(null)
    val result = _result.asStateFlow()
    private var finishing = false
    private var sending = false
    private var judging = false
    private var replyAudioJob: Deferred<Unit>? = null
    private var finishJob: Deferred<PracticeResult?>? = null
    protected val awaitingResult get() = finishing && _result.value == null
    var chatMode = false
    fun sendText(text: String) {
        if (text.isBlank() || sending || finishing) return
        stopOpener()
        viewModelScope.launch { sendTurn(text.trim(), null) }
    }
    suspend fun finishPractice(): PracticeResult? {
        finishJob?.let { return it.await() }
        finishing = true
        handsFree.disable()
        stopOpener()
        engine.cancel()
        val id = callId
        val job = viewModelScope.async {
            // /api/chat must record the judged reply before finishing; speech can stop immediately.
            while (judging) delay(50)
            replyAudioJob?.cancelAndJoin()
            elapsedSeconds = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
            val r = runCatching { ai.finishPractice(id) }.getOrNull()
            if (r != null) analyticsScenarioId?.let { Analytics.track(AnalyticsEvent.PRACTICE_CALL_COMPLETED, mapOf("scenario_id" to it, "stars" to r.stars)) }
            _result.value = r
            if (r != null) recap.start(id, callTurns(), analyticsScenarioId)
            r
        }
        finishJob = job
        return job.await()
    }
    fun resetPractice() {
        _result.value = null; callId = UUID.randomUUID().toString(); startedAt = System.currentTimeMillis(); slip = null; finishing = false; finishJob = null
        recap.reset()
    }
    fun retryScenario(speak: Boolean = true) {
        resetPractice()
        _state.update { it.copy(turns = it.turns.take(1), openerIndices = setOf(0), error = null) }
        if (speak && !chatMode) speakOpener()
    }

    protected abstract fun systemPrompt(): String

    /** Where the partner comes from: a scenario sends its prompt, a rehearsal only its id and stage (the server builds the prompt). */
    protected open val callSource: com.obsidianmedia.learnwithalphonso.core.rehearsal.CallSource get() = com.obsidianmedia.learnwithalphonso.core.rehearsal.CallSource.Scenario

    /** Set by a Practice scenario so its finished call is counted (analytics); a campaign scene leaves it null. */
    protected open val analyticsScenarioId: String? get() = null

    init {
        viewModelScope.launch { _state.update { it.copy(cefrLevel = runCatching { progress.fetchCefrLevel(course.code) }.getOrNull()) } }
        viewModelScope.launch {
            engine.events.collect { event ->
                // Hands-free hears the failure or the empty transcript first, before the phase returns to idle.
                HandsFreeBinding.onTurnEvent(handsFree, event)
                when (event) {
                    is TurnEvent.Transcribed -> sendTurn(event.text, event.confidence)
                    TurnEvent.Empty, TurnEvent.TooShort -> _state.update { it.copy(error = HandsFreeBinding.errorFor(handsFree.isOn, event, "Didn't catch that. Try again."), phase = ConversationPhase.IDLE) }
                    TurnEvent.MicDenied -> _state.update { it.copy(error = "Couldn't access the microphone. Check Settings > Apps > Learn with Alphonso > Permissions.", phase = ConversationPhase.IDLE) }
                    is TurnEvent.Failed -> _state.update { it.copy(error = "Something went wrong. Try again.", phase = ConversationPhase.IDLE) }
                }
            }
        }
    }

    init { HandsFreeBinding.feedPhases(viewModelScope, handsFree, engine, _state) }

    /** The microphone level while recording (the call's "You" tile), null otherwise. */
    override fun micLevelDBFS(): Double? = try { recorder.levelDBFS() } catch (e: Exception) { handsFree.failed(); null }

    override fun pressBegan() { if (finishing) return; stopOpener(); _state.update { it.copy(error = null, phase = ConversationPhase.IDLE) }; engine.pressBegan() }
    override fun pressEnded() {
        // Marked before the engine is told: the conversation must already be busy when the engine returns to idle, or
        // hands-free would see a gap between "heard" and "thinking" and open the mic during the reply.
        if (engine.phase.value == com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase.RECORDING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) }
        engine.pressEnded()
    }

    /** Campaign only: a finished campaign has no line left to say. */
    protected open val conversationFinished: Boolean get() = false
    override val isCallOver: Boolean get() = conversationFinished

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
    fun speakOpener() { if (!chatMode) opener.speak({ pendingOpener }, { alphonsoVoice(course.code) }) }

    /** The learner talked over the opener, or left: cancel it, which stops its playback. */
    private fun stopOpener() = opener.stop()

    private suspend fun sendTurn(text: String, confidence: Double?) {
        if (sending || finishing) return
        sending = true
        judging = true
        val attemptId = callId
        _state.update { s ->
            s.copy(
                turns = s.turns + ChatMessage("user", text),
                confidenceByTurn = if (confidence != null) s.confidenceByTurn + (s.turns.size to confidence) else s.confidenceByTurn,
                phase = ConversationPhase.THINKING,
            )
        }
        try {
            val chatReply = try { ai.chatReply(_state.value.turns, systemPrompt(), _state.value.cefrLevel, course.code, attemptId, callSource) } finally { judging = false }
            val reply = chatReply.content
            if (slip == null && chatReply.verdict == ReplyVerdict.CORRECTED) slip = text to reply
            _state.update {
                it.copy(turns = it.turns + ChatMessage("assistant", reply), phase = ConversationPhase.SPEAKING, verdictSerial = it.verdictSerial + 1, verdict = chatReply.verdict)
            }
            onReply(reply)
            if (chatMode || finishing) { _state.update { it.copy(phase = ConversationPhase.IDLE) }; return }
            val audioJob = viewModelScope.async {
                val audio = ai.synthesizeSpeech(reply, voice = alphonsoVoice(course.code), course = course.code, character = speechCharacter)
                if (!finishing && callId == attemptId && !player.play(audio)) _state.update { it.copy(error = "Got a reply, but couldn't play it back.") }
            }
            replyAudioJob = audioJob
            audioJob.await()
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            if (callId == attemptId) {
                // A failed reply pauses hands-free instead of listening again; one tap resumes.
                if (!finishing) handsFree.failed()
                _state.update { it.copy(error = if (finishing) null else chatErrorMessage(e), phase = ConversationPhase.IDLE) }
            }
        } finally { sending = false; judging = false }
    }

    protected open fun onReply(reply: String) {}

    /** The turns of the call that just finished, for its recap: the whole scenario, or the current scene of a campaign. */
    protected open fun callTurns(): List<ChatMessage> = _state.value.turns

    /** Plays just that phrase from the recap, in Alphonso's chosen voice (the same path and cost as any spoken line). */
    fun speakPhrase(text: String) {
        viewModelScope.launch {
            recap.speaking(text)
            runCatching { player.play(ai.synthesizeSpeech(text, voice = alphonsoVoice(course.code), course = course.code, character = speechCharacter)) }
            recap.speaking(null)
        }
    }

    /** The composable left (rotation, tab switch): cancel any recording; the view model and its transcript survive. */
    fun onLeave() { handsFree.disable(); stopOpener(); engine.cancel() }

    /** The screen is really gone: tear down and, with a real conversation behind us, analyse it once, best effort. */
    /** Public (wider than ViewModel's protected) so the test can drive the real clear path. */
    public override fun onCleared() {
        handsFree.disable()
        engine.tearDown()
        // The recap already sent this call once and recorded its topic labels; a second send would bill twice.
        if (analysed || recap.attempted || _state.value.turns.size < 4) return
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
    override val analyticsScenarioId: String get() = scenario.id

    init {
        Analytics.track(AnalyticsEvent.PRACTICE_CALL_STARTED, mapOf("scenario_id" to scenario.id))
    }
}

data class CampaignProgress(val sceneIndex: Int = 0, val sceneAnchor: Int = 0, val finished: Boolean = false)

/** Adds scenes with a minimum of user turns each, continue and restart, to the shared pipeline. */
class CampaignConversationViewModel(
    val campaign: Campaign,
    recorder: RecorderPort, requestMic: suspend () -> Boolean, ai: AiConversationClient, progress: ProgressSyncClient, player: ReplyPlayer,
    course: Course = Course.ENGLISH,
    alphonsoVoice: (String) -> String? = { null },
    openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
    startScene: Int = 0,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, campaign.scenes[startScene.coerceIn(campaign.scenes.indices)].opener, course, alphonsoVoice, openerCache) {
    private val _campaign = MutableStateFlow(CampaignProgress(sceneIndex = startScene.coerceIn(campaign.scenes.indices)))
    val campaignState: StateFlow<CampaignProgress> = _campaign.asStateFlow()
    init { _state.update { it.copy(sceneOffset = startScene.coerceIn(campaign.scenes.indices)) } }

    val scene get() = campaign.scenes[_campaign.value.sceneIndex]
    val isLastScene get() = _campaign.value.sceneIndex == campaign.scenes.size - 1
    val userTurnsInScene get() = _state.value.turns.drop(_campaign.value.sceneAnchor).count { it.role == "user" }
    val canContinue get() = userTurnsInScene >= scene.minTurns

    override fun systemPrompt(): String = "${campaign.premise}\n\n${scene.systemPrompt}"

    /** This scene's call only (its opener onward), never the earlier scenes. */
    override fun callTurns(): List<ChatMessage> = _state.value.turns.drop(_campaign.value.sceneAnchor)

    fun continueToNextScene(speak: Boolean = true) {
        if (awaitingResult) return
        if (!canContinue) return
        if (isLastScene) { _campaign.update { it.copy(finished = true) }; return }
        resetPractice()
        val next = campaign.scenes[_campaign.value.sceneIndex + 1]
        _state.update { it.copy(turns = it.turns + ChatMessage("assistant", next.opener), openerIndices = it.openerIndices + it.turns.size, error = null) }
        _campaign.update { it.copy(sceneIndex = it.sceneIndex + 1, sceneAnchor = _state.value.turns.size - 1) }
        if (speak) speakOpener()
    }

    override val conversationFinished: Boolean get() = _campaign.value.finished

    private var rearmHandsFree = false

    /**
     * The learner moves on to the next scene of this run (the Continue button): hands-free was on, so it is turned on
     * again for that scene's call, carried across the scenes of one run as on iOS. A restart, a retry or ending the
     * call forgets it.
     */
    fun carryHandsFreeToNextScene() { rearmHandsFree = handsFree.isOn }

    fun forgetHandsFreeCarry() { rearmHandsFree = false }

    /** The next scene's call screen is up: turn hands-free back on if the learner had it on, unless the campaign is over. */
    fun rearmHandsFreeIfCarried() {
        val carried = rearmHandsFree
        rearmHandsFree = false
        if (carried && !_campaign.value.finished) handsFree.enable()
    }

    fun restartScene(speak: Boolean = true) {
        if (awaitingResult) return
        rearmHandsFree = false
        resetPractice()
        val anchor = _campaign.value.sceneAnchor
        _state.update { it.copy(turns = it.turns.take(anchor + 1), openerIndices = it.openerIndices.filter { i -> i <= anchor }.toSet(), error = null) }
        if (speak) speakOpener()
    }
}
