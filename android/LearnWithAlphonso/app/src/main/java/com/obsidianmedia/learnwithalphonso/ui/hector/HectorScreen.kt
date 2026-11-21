package com.obsidianmedia.learnwithalphonso.ui.hector

import androidx.compose.foundation.border
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.Analytics
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference
import com.obsidianmedia.learnwithalphonso.ui.paywall.ProPaywallScreen
import com.obsidianmedia.learnwithalphonso.ui.paywall.ProWelcomeScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.call.PracticeCallScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation
import com.obsidianmedia.learnwithalphonso.ui.practice.call.hectorKit
import com.obsidianmedia.learnwithalphonso.ui.practice.call.systemMotionReduced
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState
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
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
import com.obsidianmedia.learnwithalphonso.ui.explain.ExplainInMyLanguage
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeBinding
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeCallEffects
import com.obsidianmedia.learnwithalphonso.ui.practice.call.ApplyStoredHandsFree
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeSwitch
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeNoteDialog
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import androidx.compose.ui.platform.testTag
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordCopy
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryContext
import com.obsidianmedia.learnwithalphonso.core.logic.HectorAllowance
import com.obsidianmedia.learnwithalphonso.core.logic.HectorGreeting
import com.obsidianmedia.learnwithalphonso.core.logic.HectorChip
import com.obsidianmedia.learnwithalphonso.core.logic.HectorChips
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrection
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrections
import androidx.compose.ui.focus.FocusRequester
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.core.logic.HectorRecordingCap
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import com.obsidianmedia.learnwithalphonso.core.net.fetchNameStatus
import com.obsidianmedia.learnwithalphonso.ui.practice.OpenerSpeaker
import com.obsidianmedia.learnwithalphonso.ui.practice.OpenerSpeechCache
import kotlinx.coroutines.CompletableDeferred
import com.obsidianmedia.learnwithalphonso.core.logic.billingPeriodDescription
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.fetchHectorAllowanceUsedUp
import com.obsidianmedia.learnwithalphonso.core.net.fetchWeaknessTrend
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentGate
import com.obsidianmedia.learnwithalphonso.ui.ai.AiReportStatusHost
import com.obsidianmedia.learnwithalphonso.ui.ai.ReportableAiMessage
import com.obsidianmedia.learnwithalphonso.ui.ai.accessibilityActions
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascot
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHintLine
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Port of HectorConversationView: the tutor service gets the memory priming
 * turn once at the head of the history (Plan 3 Review Focus 4), then every
 * turn so far.
 */
class HectorViewModel(
    private val recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    private val tutor: TutorConversationClient,
    private val ai: AiConversationClient,
    private val progress: ProgressSyncClient,
    private val player: ReplyPlayer,
    private val sessionId: String = UUID.randomUUID().toString(),
    /** The learner's active course: the tutor speaks it, and speech is transcribed and spoken in it. */
    val course: Course = Course.ENGLISH,
    /** Hector's own chosen voice for a course (Settings > Voices), never Alphonso's; null lets the server decide. */
    private val hectorVoice: (String) -> String? = { null },
    /** Spoken lines already fetched (shared with Alphonso's openers); tests pass their own. */
    private val openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
    /** The daily Hector limit as the server tells it (GET /api/app-config); null (unknown) fails open. */
    private val hectorLimit: suspend () -> Int? = { null },
    /** A tapped recording is stopped and sent after this long (a held button was bounded by the finger). */
    private val recordingCapMs: Long = HectorRecordingCap.MILLIS,
) : ViewModel(), CallConversation {
    // Hector's endpoint returns no verdict on the learner's turn, so verdictSerial never changes and he does not react.
    private val _state = MutableStateFlow(ConversationUiState(openerIndices = emptySet()))
    override val state: StateFlow<ConversationUiState> = _state.asStateFlow()
    override val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", course.code, timing) }, viewModelScope)
    /** Hands-free (Hector tuning: 1.2 s of quiet ends a turn). Off whenever a call starts; the call sheet's switch turns it on. Pro by location: Hector is. */
    override val handsFree = HandsFreeBinding.newController(HandsFreeLoop.Tuning.HECTOR, press = { pressBegan() }, release = { pressEnded() }, cancel = { HandsFreeBinding.releaseMic(engine) })
    /** Suggestion chips under the greeting, built from the same context (weak spot, streak); the fixed set until it has loaded. */
    private val _chips = MutableStateFlow(HectorChips.FALLBACK)
    val chips: StateFlow<List<HectorChip>> = _chips.asStateFlow()
    /** Hector's corrections, by the index of the learner's turn each answers (a card under that bubble). */
    private val _corrections = MutableStateFlow<Map<Int, HectorCorrection>>(emptyMap())
    val corrections: StateFlow<Map<Int, HectorCorrection>> = _corrections.asStateFlow()
    /** The learner refused the microphone: "Try again" then puts the cursor in the composer instead. */
    @Volatile var micDenied: Boolean = false
        private set
    private var memoryContext: ChatMessage? = null
    private var cefrLevel: String? = null
    private var analysed = false
    /** Hector speaks first (BACKLOG 0.0-bp): his greeting, built locally once the learner context has loaded. */
    private val greeting = CompletableDeferred<String>()
    /** Today's Hector allowance is used up (BACKLOG 0.0-bq #5): no greeting, no speech, the out-for-today message. */
    private var allowanceUsedUp = false
    /** The stored hands-free choice starts a call only after the greeting has finished (never under it). */
    private val storedStart = HandsFreeBinding.StoredStart(handsFree) { false }
    override fun armAutoStartHandsFree(check: () -> Boolean) = storedStart.arm(check)

    // Hector's greeting goes through the same player as Alphonso's openers, in Hector's own voice.
    private val opener by lazy {
        OpenerSpeaker(viewModelScope, _state, { engine.phase.value == TurnPhase.IDLE }, player, openerCache, course.code, onFinished = { storedStart.openerFinished() }) { text, voice ->
            ai.synthesizeSpeech(text, voice = voice, course = course.code, character = VoiceCharacter.Hector)
        }
    }

    init {
        viewModelScope.launch {
            val level = runCatching { progress.fetchCefrLevel(course.code) }.getOrNull()
            val trend = runCatching { progress.fetchWeaknessTrend() }.getOrDefault(emptyList())
            val open = trend.filter { it.openCount > 0 }.map { it.category }
            // A name the learner chose; an unconfirmed one is a generated handle.
            val name = runCatching { progress.fetchNameStatus() }.getOrNull()?.takeIf { it.nameConfirmed }?.displayName
            cefrLevel = level
            memoryContext = TutorMemoryContext.buildPrimingMessage(level, open)
            allowanceUsedUp = progress.fetchHectorAllowanceUsedUp(hectorLimit())
            val weakSpot = HectorGreeting.recentWeakSpot(trend)
            _chips.value = HectorChips.build(course, weakSpot, 0)
            greeting.complete(HectorGreeting.build(course, level, name, weakSpot))
            // The streak is best effort and never holds the greeting: its chip joins when it arrives.
            val streak = runCatching { progress.fetchProgress() }.getOrNull()?.streak ?: 0
            if (streak > 0) _chips.value = HectorChips.build(course, weakSpot, streak)
        }
        viewModelScope.launch {
            engine.events.collect { event ->
                // Hands-free hears the failure or the empty transcript first, before the phase returns to idle.
                HandsFreeBinding.onTurnEvent(handsFree, event)
                when (event) {
                    is TurnEvent.Transcribed -> sendTurn(event.text)
                    TurnEvent.Empty, TurnEvent.TooShort -> _state.update { it.copy(error = HandsFreeBinding.errorFor(handsFree.isOn, event, "Didn't catch that. Try again."), phase = ConversationPhase.IDLE) }
                    TurnEvent.MicDenied -> {
                        micDenied = true
                        _state.update { it.copy(error = "Couldn't access the microphone. Check Settings > Apps > Learn with Alphonso > Permissions.", phase = ConversationPhase.IDLE) }
                    }
                    is TurnEvent.Failed -> _state.update { it.copy(error = "Something went wrong. Try again.", phase = ConversationPhase.IDLE) }
                }
            }
        }
    }

    init { HandsFreeBinding.feedPhases(viewModelScope, handsFree, engine, _state) }

    override fun micLevelDBFS(): Double? = try { recorder.levelDBFS() } catch (e: Exception) { handsFree.failed(); null }

    override fun pressBegan() { opener.stop(); _state.update { it.copy(error = null) }; engine.pressBegan() }

    /** The greeting Hector still has to say: the latest turn when it is his greeting (the learner has not answered). */
    val pendingGreeting: String?
        get() {
            val s = _state.value
            val last = s.turns.lastIndex
            if (last < 0 || last !in s.openerIndices) return null
            return s.turns[last].content.trim().ifEmpty { null }
        }

    /**
     * Hector speaks first. The screen calls this once the AI consent gate is passed (and on "Call again"): a
     * conversation with no turns yet opens with his greeting, which is shown as his first turn, so it is also in the
     * history the tutor gets with the learner's first turn. It is said in Hector's chosen voice, and said again from
     * the cache while the learner has not answered. The mic waits while it loads; holding to talk cuts it off.
     */
    fun greet() {
        viewModelScope.launch {
            val text = greeting.await()
            if (allowanceUsedUp) {
                _state.update { it.copy(error = HectorAllowance.OUT_FOR_TODAY) }
                return@launch
            }
            _state.update { if (it.turns.isEmpty()) it.copy(turns = listOf(ChatMessage("assistant", text)), openerIndices = setOf(0)) else it }
            opener.speak({ pendingGreeting }, { hectorVoice(course.code) })
        }
    }
    private var capJob: Job? = null

    /**
     * The mic button: starts a turn by voice, and stops and sends it after [recordingCapMs] if the learner has not
     * (the stop button, or hands-free's own limits, normally end it first).
     */
    fun tapMicBegan() {
        pressBegan()
        capJob?.cancel()
        capJob = viewModelScope.launch {
            delay(recordingCapMs)
            if (engine.phase.value == TurnPhase.RECORDING) pressEnded()
        }
    }

    override fun pressEnded() {
        capJob?.cancel()
        // Marked before the engine is told: the conversation must already be busy when the engine returns to idle, or
        // hands-free would see a gap between "heard" and "thinking" and open the mic during the reply.
        if (engine.phase.value == TurnPhase.RECORDING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) }
        engine.pressEnded()
    }

    /** Free to take a typed turn: idle, or only his greeting is still being fetched or spoken (it is cut off). */
    fun canSend(): Boolean = canSend(_state.value, engine.phase.value)

    /**
     * A typed message (or a tapped chip) as the learner's turn: the same path a transcribed voice turn takes. Ignored
     * when blank or while a turn is already under way; it cuts the greeting off, like holding to talk does.
     */
    fun sendTyped(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || !canSend()) return
        opener.stop()
        _state.update { it.copy(error = null) }
        viewModelScope.launch { sendTurn(trimmed) }
    }

    /**
     * "Try again" on a correction: the phrase, said once more. The tap-to-talk path (so its cap applies); in hands-free
     * the loop opens the mic itself once nothing is playing; where the microphone was refused the cursor goes to the
     * composer ([focusComposer]) instead.
     */
    fun tryAgain(focusComposer: () -> Unit) {
        if (handsFree.isOn) return
        if (micDenied) focusComposer() else tapMicBegan()
    }

    /** Exposed for tests: the history the tutor receives for the next turn. */
    fun historyForTutor(): List<ChatMessage> = listOfNotNull(memoryContext) + _state.value.turns

    private suspend fun sendTurn(text: String) {
        val call = callGeneration
        _state.update { it.copy(turns = it.turns + ChatMessage("user", text), phase = ConversationPhase.THINKING) }
        try {
            val reply = tutor.respond(sessionId, text, course.code, historyForTutor(), course = course.code, cefrLevel = cefrLevel, voice = hectorVoice(course.code))
            // A reply that comes back after the learner hung up joins the transcript but is never spoken.
            val live = call == callGeneration
            // The server already took the block out; parsing the reply here too means a tag can never be shown.
            val parsed = HectorCorrections.extract(reply.reply)
            val shown = parsed.text.ifEmpty { "…" }
            _state.update { it.copy(turns = it.turns + ChatMessage("assistant", shown), phase = if (live) ConversationPhase.SPEAKING else it.phase) }
            // The card belongs under the learner's turn this reply answers: the one just before it.
            (reply.correction ?: parsed.correction)?.let { c -> val at = _state.value.turns.size - 2; if (at >= 0) _corrections.update { m -> m + (at to c) } }
            if (live) reply.audioBytes()?.let { if (!player.play(it)) _state.update { s -> s.copy(error = "Got a reply, but couldn't play it back.") } }
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            // A failed reply pauses hands-free instead of listening again; one tap resumes.
            handsFree.failed()
            _state.update { it.copy(error = AiErrorCopy.userMessage(e), phase = ConversationPhase.IDLE) }
        }
    }

    /** The composable left (rotation, tab switch): cancel any recording; the view model survives. */
    fun onLeave() { handsFree.disable(); capJob?.cancel(); opener.stop(); engine.cancel() }

    /** Bumped on hang-up: a turn that started before it may still get its reply, but never plays the audio. */
    @Volatile private var callGeneration = 0

    /** The red button: cancel any recording, and silence a reply that is still on its way. */
    fun hangUp() {
        capJob?.cancel()
        callGeneration++
        handsFree.disable()
        opener.stop()
        engine.cancel()
    }

    companion object {
        /** True when nothing but his own greeting (which the learner's first turn cuts off) is under way. */
        fun canSend(state: ConversationUiState, engine: TurnPhase): Boolean {
            if (engine != TurnPhase.IDLE) return false
            if (state.phase == ConversationPhase.IDLE) return true
            val last = state.turns.lastIndex
            return last >= 0 && last in state.openerIndices
        }
    }

    public override fun onCleared() {
        handsFree.disable()
        engine.tearDown()
        if (analysed || _state.value.turns.size < 4) return
        analysed = true
        val transcript = _state.value.turns
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { runCatching { ai.analyzeWeaknesses(transcript, course.code) } }
    }
}

@Composable
fun HectorTab(container: AppContainer) {
    val entitlement by container.entitlements.state.collectAsState()
    // A purchase or restore started from the paywall: when Pro lands, Hector's welcome shows before the conversation.
    var acted by rememberSaveable { mutableStateOf(false) }
    when {
        !entitlement.isPro -> ProPaywallScreen(container, onPurchaseStarted = { acted = true })
        acted -> ProWelcomeScreen(container, onCall = { acted = false })
        else -> HectorConversation(container)
    }
}

/** Hector's bubbles, the greeting's suggestion chips and the "tap a word" hint: the middle of the classic screen, and the body of the call's sheet. */
@Composable
private fun HectorTranscript(container: AppContainer, vm: HectorViewModel, modifier: Modifier, focusComposer: () -> Unit = {}, stopReply: () -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val corrections by vm.corrections.collectAsState()
    val handsFreeStatus by vm.handsFree.status.collectAsState()
    val state by vm.state.collectAsState()
    val chips by vm.chips.collectAsState()
    val enginePhase by vm.engine.phase.collectAsState()
    val listState = rememberLazyListState()
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size - 1) }
    val saveWord = LocalSaveWordHandler.current
    // Chips are Hector's offer after his greeting; the first message of the learner's own ends them.
    val showChips = state.turns.isNotEmpty() && state.turns.none { it.role == "user" }
    Column(modifier) {
        // Words are plain-looking links, so say they are tappable.
        SaveWordHintLine(container, SavedWordCopy.HECTOR_HINT, limited = false)
        LazyColumn(state = listState, modifier = Modifier.weight(1f).testTag("hector-transcript"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(state.turns) { index, turn ->
                val isUser = turn.role == "user"
                Column(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
                        if (!isUser) HectorMiniAvatar() else Spacer(Modifier.width(40.dp))
                        Spacer(Modifier.width(9.dp))
                        // Every Hector reply is the model's, so reportable; his greeting is our own fixed text.
                        ReportableAiMessage(
                            enabled = !isUser && index !in state.openerIndices, sender = container.aiReports,
                            makeReport = { reason -> AiReplyReports.hector(turn.content, vm.course.code, reason) },
                        ) { reportModifier, reportActions ->
                            val shape = if (isUser) LearnerBubbleShape else HectorBubbleShape
                            val bubble = Modifier.widthIn(max = 300.dp).clip(shape).then(reportModifier).background(if (isUser) ds.choice else ds.card).padding(horizontal = 14.dp, vertical = 10.dp)
                            // Hector's replies are in the language being practiced, so every word is a word of the course.
                            if (!isUser && saveWord != null) {
                                TappableText(turn.content, vm.course.code, SaveWordMode.AllWords, saveWord, modifier = bubble, style = BodyType, color = ds.ink, extraActions = reportActions)
                            } else {
                                Text(turn.content, modifier = bubble.accessibilityActions(reportActions), style = BodyType, color = if (isUser) ds.onChoice else ds.ink)
                            }
                        }
                    }
                    // Hector's gentle correction, under the learner's bubble it answers. "Hear it" is the device's own voice.
                    if (isUser) corrections[index]?.let { correction ->
                        Spacer(Modifier.height(8.dp))
                        HectorCorrectionCard(
                            correction, canHear = remember(vm.course) { Speech.get(context).canSpeak(vm.course) },
                            tryAgainEnabled = enginePhase != TurnPhase.RECORDING && HectorViewModel.canSend(state, enginePhase),
                            // One voice at a time: Hector's own reply stops first, and the open mic is never spoken into.
                            hearEnabled = enginePhase != TurnPhase.RECORDING && handsFreeStatus != HandsFreeLoop.Status.Listening && handsFreeStatus != HandsFreeLoop.Status.Hearing,
                            onHear = { stopReply(); Speech.get(context).speak(correction.fix, vm.course) },
                            onTryAgain = { Speech.get(context).stop(); vm.tryAgain(focusComposer) },
                        )
                    }
                    // "Say that in <language>" under each of Hector's bubbles; his calls spend Hector's own Pro allowance.
                    if (!isUser) ExplainInMyLanguage(container, remember(turn.content, vm.course.code) { ExplainRules.message(turn.content, vm.course.code, hector = true) }, Modifier.padding(start = 39.dp, top = 4.dp))
                }
            }
            if (showChips) item(key = "hector-chips") {
                HectorChipRow(chips, enabled = HectorViewModel.canSend(state, enginePhase), onChip = { vm.sendTyped(it.message) })
            }
        }
    }
}

@Composable
private fun HectorConversation(container: AppContainer) {
    val ds = LocalAlphonsoTokens.current
    val playback = remember { container.newPlayback() }
    // Hector follows the course chosen on the Learn tab; a course switch starts a fresh conversation in the new language.
    val course by container.activeCourse.course.collectAsState()
    val vm: HectorViewModel = viewModel(key = "hector-${course.code}") {
        HectorViewModel(container.newRecorder(), { container.micPermission.request() }, container.tutorClient, container.aiClient, container.progressClient, { playback.play(it) }, course = course, hectorVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Hector, c) }, hectorLimit = { container.hectorDailyLimit() })
    }
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val context = LocalContext.current
    // "Show Alphonso while practicing" (Settings, on by default) covers Hector's call too: one switch decides.
    val showCall = remember { container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT) }
    // Hanging up stops the session; "Call again" starts it again. Hector is a tab, so there is no screen to leave.
    var callEnded by rememberSaveable { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { Speech.get(context).stop(); vm.onLeave() } }

    AiConsentGate(container) {
      // Hector speaks first: his greeting, inside the gate so nothing is fetched before consent; again on each
      // return, from the cache, while the learner has not answered it.
      LaunchedEffect(Unit) { vm.greet() }
      LaunchedEffect(Unit) { Analytics.track(AnalyticsEvent.HECTOR_OPENED) }
      SaveWordHost(container) {
        val reduced = systemMotionReduced(context)
        var draft by rememberSaveable { mutableStateOf("") }
        val composerFocus = remember { FocusRequester() }
        val listening = phase == TurnPhase.RECORDING
        val busy = !listening && !HectorViewModel.canSend(state, phase)
        // One composer for both screens: the classic screen's bottom bar, and the call's conversation sheet.
        val composer: @Composable () -> Unit = {
            HectorComposer(
                listening = listening, busy = busy, text = draft, onText = { draft = it },
                onSend = { val t = draft; draft = ""; vm.sendTyped(t) },
                onMic = { vm.tapMicBegan() }, onStop = { vm.pressEnded() },
                level = { vm.micLevelDBFS() }, reducedMotion = reduced, focusRequester = composerFocus,
            )
        }
        if (showCall) {
            if (callEnded) {
                Column(Modifier.fillMaxSize().background(ds.surface), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("Call ended", style = TitleType, color = ds.ink)
                    AlphonsoPrimaryButton("Call again", onClick = { callEnded = false; vm.greet() })
                }
            } else {
                PracticeCallScreen(
                    kit = remember { hectorKit(context) }, title = "Your AI tutor", scenarioId = "hector", course = course,
                    vm = vm, playback = playback, reducedMotion = systemMotionReduced(context),
                    onEnd = { vm.hangUp(); playback.stop(); callEnded = true },
                    talkLabel = "Hold to talk to Hector",
                    statusHost = { AiReportStatusHost(container.aiReports) },
                    sheetFooter = composer,
                    transcript = { HectorTranscript(container, vm, Modifier, focusComposer = { composerFocus.requestFocus() }, stopReply = { playback.stop() }) },
                )
            }
            return@SaveWordHost
        }
        // Hands-free is kept on this screen too: its switch is in the header's menu, and a remembered choice starts it.
        HandsFreeCallEffects(vm)
        ApplyStoredHandsFree(vm)
        val handsFreeStatus by vm.handsFree.status.collectAsState()
        var showNote by remember { mutableStateOf(false) }
        Column(Modifier.fillMaxSize().background(ds.surface)) {
            AiReportStatusHost(container.aiReports)
            HectorHeader(
                courseName = hectorCourseName(course), status = HectorStatusUi.from(phase, state.phase), reducedMotion = reduced,
                onBack = null,
                // The switch's first-use note is shown from here: a dialog composed inside the menu goes with the menu.
                menu = { dismiss -> HandsFreeSwitch(vm, "Hector", onNeedNote = { dismiss(); showNote = true }) },
            )
            if (showNote) HandsFreeNoteDialog(vm, "Hector") { showNote = false }
            HectorTranscript(container, vm, Modifier.weight(1f), focusComposer = { composerFocus.requestFocus() }, stopReply = { playback.stop() })
            state.error?.let { Text(it, style = FootnoteType, color = ds.wrongInk, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) }
            // Hands-free can be on from the stored choice with the switch still in the menu: the mic is never live unseen.
            if (handsFreeStatus != HandsFreeLoop.Status.Off) HectorHandsFreeBar(handsFreeStatus, onToggle = vm.handsFree::togglePause)
            composer()
        }
      }
    }
}
