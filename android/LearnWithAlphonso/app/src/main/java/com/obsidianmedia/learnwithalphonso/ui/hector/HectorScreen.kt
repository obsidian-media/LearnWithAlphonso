package com.obsidianmedia.learnwithalphonso.ui.hector

import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
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
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordCopy
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryContext
import com.obsidianmedia.learnwithalphonso.core.logic.HectorGreeting
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
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
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
) : ViewModel(), CallConversation {
    // Hector's endpoint returns no verdict on the learner's turn, so verdictSerial never changes and he does not react.
    private val _state = MutableStateFlow(ConversationUiState(openerIndices = emptySet()))
    override val state: StateFlow<ConversationUiState> = _state.asStateFlow()
    override val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", course.code, timing) }, viewModelScope)
    private var memoryContext: ChatMessage? = null
    private var cefrLevel: String? = null
    private var analysed = false
    /** Hector speaks first (BACKLOG 0.0-bp): his greeting, built locally once the learner context has loaded. */
    private val greeting = CompletableDeferred<String>()
    // Hector's greeting goes through the same player as Alphonso's openers, in Hector's own voice.
    private val opener by lazy {
        OpenerSpeaker(viewModelScope, _state, { engine.phase.value == TurnPhase.IDLE }, player, openerCache, course.code) { text, voice ->
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
            greeting.complete(HectorGreeting.build(course, level, name, HectorGreeting.recentWeakSpot(trend)))
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

    override fun micLevelDBFS(): Double? = recorder.levelDBFS()

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
            _state.update { if (it.turns.isEmpty()) it.copy(turns = listOf(ChatMessage("assistant", text)), openerIndices = setOf(0)) else it }
            opener.speak({ pendingGreeting }, { hectorVoice(course.code) })
        }
    }
    override fun pressEnded() { engine.pressEnded(); if (engine.phase.value == TurnPhase.TRANSCRIBING) _state.update { it.copy(phase = ConversationPhase.TRANSCRIBING) } }

    /** Exposed for tests: the history the tutor receives for the next turn. */
    fun historyForTutor(): List<ChatMessage> = listOfNotNull(memoryContext) + _state.value.turns

    private suspend fun sendTurn(text: String) {
        val call = callGeneration
        _state.update { it.copy(turns = it.turns + ChatMessage("user", text), phase = ConversationPhase.THINKING) }
        try {
            val reply = tutor.respond(sessionId, text, course.code, historyForTutor(), course = course.code, cefrLevel = cefrLevel, voice = hectorVoice(course.code))
            // A reply that comes back after the learner hung up joins the transcript but is never spoken.
            val live = call == callGeneration
            _state.update { it.copy(turns = it.turns + ChatMessage("assistant", reply.reply), phase = if (live) ConversationPhase.SPEAKING else it.phase) }
            if (live) reply.audioBytes()?.let { if (!player.play(it)) _state.update { s -> s.copy(error = "Got a reply, but couldn't play it back.") } }
            _state.update { it.copy(phase = ConversationPhase.IDLE) }
        } catch (e: Exception) {
            _state.update { it.copy(error = AiErrorCopy.userMessage(e), phase = ConversationPhase.IDLE) }
        }
    }

    /** The composable left (rotation, tab switch): cancel any recording; the view model survives. */
    fun onLeave() { opener.stop(); engine.cancel() }

    /** Bumped on hang-up: a turn that started before it may still get its reply, but never plays the audio. */
    @Volatile private var callGeneration = 0

    /** The red button: cancel any recording, and silence a reply that is still on its way. */
    fun hangUp() {
        callGeneration++
        opener.stop()
        engine.cancel()
    }

    public override fun onCleared() {
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

/** Hector's bubbles and the "tap a word" hint: the middle of the classic screen, and the body of the call's sheet. */
@Composable
private fun HectorTranscript(container: AppContainer, vm: HectorViewModel, modifier: Modifier) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size - 1) }
    val saveWord = LocalSaveWordHandler.current
    Column(modifier) {
        // Words are plain-looking links, so say they are tappable.
            SaveWordHintLine(container, SavedWordCopy.HECTOR_HINT, limited = false)
            LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                itemsIndexed(state.turns) { index, turn ->
                    val isUser = turn.role == "user"
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
                        if (!isUser) Image(painterResource(R.drawable.mascot_hector), contentDescription = "Hector", contentScale = ContentScale.Crop, modifier = Modifier.size(26.dp).clip(CircleShape))
                        else Spacer(Modifier.width(40.dp))
                        Spacer(Modifier.width(6.dp))
                        // Every Hector reply is the model's, so reportable; his greeting is our own fixed text.
                        ReportableAiMessage(
                            enabled = !isUser && index !in state.openerIndices, sender = container.aiReports,
                            makeReport = { reason -> AiReplyReports.hector(turn.content, vm.course.code, reason) },
                        ) { reportModifier, reportActions ->
                            val bubble = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(AlphonsoRadius.xl)).then(reportModifier).background(if (isUser) palette.ember else palette.parchment).padding(horizontal = 14.dp, vertical = 10.dp)
                            // Hector's replies are in the language being practiced, so every word is a word of the course.
                            if (!isUser && saveWord != null) {
                                TappableText(turn.content, vm.course.code, SaveWordMode.AllWords, saveWord, modifier = bubble, style = MaterialTheme.typography.bodyLarge, color = palette.ink, extraActions = reportActions)
                            } else {
                                Text(turn.content, modifier = bubble.accessibilityActions(reportActions), style = MaterialTheme.typography.bodyLarge, color = if (isUser) palette.onAccent else palette.ink)
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun HectorConversation(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val playback = remember { container.newPlayback() }
    // Hector follows the course chosen on the Learn tab; a course switch starts a fresh conversation in the new language.
    val course by container.activeCourse.course.collectAsState()
    val vm: HectorViewModel = viewModel(key = "hector-${course.code}") {
        HectorViewModel(container.newRecorder(), { container.micPermission.request() }, container.tutorClient, container.aiClient, container.progressClient, { playback.play(it) }, course = course, hectorVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Hector, c) })
    }
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val context = LocalContext.current
    // "Show Alphonso while practicing" (Settings, on by default) covers Hector's call too: one switch decides.
    val showCall = remember { container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT) }
    // Hanging up stops the session; "Call again" starts it again. Hector is a tab, so there is no screen to leave.
    var callEnded by rememberSaveable { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { vm.onLeave() } }

    AiConsentGate(container) {
      // Hector speaks first: his greeting, inside the gate so nothing is fetched before consent; again on each
      // return, from the cache, while the learner has not answered it.
      LaunchedEffect(Unit) { vm.greet() }
      SaveWordHost(container) {
        if (showCall) {
            if (callEnded) {
                Column(Modifier.fillMaxSize().background(palette.surface), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("Call ended", style = MaterialTheme.typography.headlineMedium, color = palette.ink)
                    AlphonsoPrimaryButton("Call again", onClick = { callEnded = false; vm.greet() })
                }
            } else {
                PracticeCallScreen(
                    kit = remember { hectorKit(context) }, title = "Your AI tutor", scenarioId = "hector", course = course,
                    vm = vm, playback = playback, reducedMotion = systemMotionReduced(context),
                    onEnd = { vm.hangUp(); playback.stop(); callEnded = true },
                    talkLabel = "Hold to talk to Hector",
                    statusHost = { AiReportStatusHost(container.aiReports) },
                    transcript = { HectorTranscript(container, vm, Modifier) },
                )
            }
            return@SaveWordHost
        }
        Column(Modifier.fillMaxSize().background(palette.surface)) {
            AiReportStatusHost(container.aiReports)
            Text("Hector", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp))
            HectorTranscript(container, vm, Modifier.weight(1f))
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
}
