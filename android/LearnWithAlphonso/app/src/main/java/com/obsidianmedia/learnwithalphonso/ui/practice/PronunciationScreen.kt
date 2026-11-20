package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.Pronunciation
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationPhase
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationSession
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationSpeech
import com.obsidianmedia.learnwithalphonso.core.logic.SayItRight
import com.obsidianmedia.learnwithalphonso.core.logic.SayItRightPose
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Space
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Type
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PronunciationUi(
    val session: PronunciationSession,
    /** The completed-lesson list is being read: the session cannot start until it is known. */
    val loading: Boolean = true,
    val loadFailed: Boolean = false,
    val error: String? = null,
    /** The microphone is denied, or a capture or transcription failed: "Hear it" and the skip are the way on. */
    val micUnavailable: Boolean = false,
)

/**
 * Say it right ("Talk with Alphonso"): a warm 1:1 lesson. The word is the hero, in Alphonso's speech bubble with a
 * "Hear it" model button; he reacts in pose with a varied line, and the learner's mic sits opposite him. A miss replays
 * the model and allows one retry, then the session goes on. No hearts, no penalty.
 *
 * Mirrors the web's SayItRight.tsx (PR #616) and the iOS PronunciationView. Speech goes through the existing /api/stt
 * (the speaking quota, `stt` kind) and the model through /api/tts ([PronunciationSpeech]); the verdict bands are
 * [Pronunciation.judge] (the web's two thresholds). The word pool is the vocabulary of the lessons the learner has
 * completed, derived LIVE every time a session starts ([Pronunciation.learnedPool]), never cached.
 */
class PronunciationViewModel(
    recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    ai: AiConversationClient,
    private val course: Course,
    /** The learned words, read from the live completed-lesson ids; null when they could not be read. Every session start. */
    private val loadPool: suspend () -> List<VocabItem>?,
    /** Hand-picked words to drill (Say the picture's missed words). Null draws from the learned pool as usual. */
    private val seedWords: List<VocabItem>? = null,
    private val voice: () -> String?,
    /** Plays the fetched model audio; false when it could not play. */
    private val play: suspend (ByteArray) -> Boolean,
    /** The on-device voice, when the model audio cannot be fetched or played. */
    private val deviceSpeak: (String) -> Unit,
) : ViewModel() {
    private val speech = PronunciationSpeech(ai)
    val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> speech.transcribe(audio, course, timing) }, viewModelScope)
    private val _state = MutableStateFlow(PronunciationUi(PronunciationSession(emptyList())))
    val state: StateFlow<PronunciationUi> = _state.asStateFlow()

    init {
        startSession()
        viewModelScope.launch {
            engine.events.collect { event ->
                when (event) {
                    is TurnEvent.Transcribed -> onTranscript(event.text, event.confidence)
                    TurnEvent.Empty, TurnEvent.TooShort -> _state.update { it.copy(error = "Didn't catch that. Try again.") }
                    TurnEvent.MicDenied -> _state.update {
                        it.copy(micUnavailable = true, error = "Microphone access is off. Turn it on in Settings > Apps > Learn with Alphonso > Permissions. You can still hear each word.")
                    }
                    // A failure (quota, network) must never leave a dead end: the word can always be heard.
                    is TurnEvent.Failed -> _state.update {
                        it.copy(micUnavailable = it.micUnavailable || !event.consentRequired, error = if (event.consentRequired) null else "Couldn't check that just now. You can still hear the word.")
                    }
                }
            }
        }
    }

    /** A fresh session from the LIVE learned pool; also "Practise more" and "Try again". Too few words is an empty run. */
    fun startSession() {
        _state.update { it.copy(loading = true, loadFailed = false, error = null) }
        viewModelScope.launch {
            val pool = seedWords?.takeIf { it.isNotEmpty() } ?: runCatching { loadPool() }.getOrNull()
            _state.update {
                when {
                    seedWords != null && seedWords.isNotEmpty() -> it.copy(session = PronunciationSession(seedWords), loading = false, loadFailed = false)
                    pool == null -> it.copy(loading = false, loadFailed = true)
                    pool.size < Pronunciation.MIN_POOL -> it.copy(session = PronunciationSession(pool), loading = false, loadFailed = false)
                    else -> it.copy(session = PronunciationSession(Pronunciation.draw(pool)), loading = false, loadFailed = false)
                }
            }
        }
    }

    private fun onTranscript(text: String, confidence: Double?) {
        val (next, outcome) = _state.value.session.submit(text, confidence, course)
        _state.update { it.copy(session = next, error = if (outcome == PronunciationOutcome.Unheard) "Didn't catch that. Try again." else null) }
        if (outcome is PronunciationOutcome.Retry) next.current?.let { playModel(it.term) }
    }

    fun pressBegan() { _state.update { it.copy(error = null) }; engine.pressBegan() }
    fun pressEnded() = engine.pressEnded()

    fun next() = _state.update { it.copy(session = it.session.next(), error = null) }

    /** The model pronunciation from /api/tts, with the on-device voice when it cannot be fetched or played. */
    fun playModel(term: String) {
        viewModelScope.launch {
            val audio = runCatching { speech.modelAudio(term, voice(), course) }.getOrNull()
            if (audio == null || !play(audio)) deviceSpeak(term)
        }
    }

    override fun onCleared() = engine.tearDown()
}

@Composable
fun PronunciationScreen(container: AppContainer, course: Course, seedWords: List<VocabItem>? = null, onExit: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val playback = remember { container.newPlayback() }
    val vm: PronunciationViewModel = viewModel(key = if (seedWords == null) "say-it-right-${course.code}" else "say-it-right-${course.code}-picked-${seedWords.joinToString { it.term }}") {
        PronunciationViewModel(
            container.newRecorder(), { container.micPermission.request() }, container.aiClient, course,
            // The live pool: the bundle's units and the account's completed lessons, read now, so a lesson finished since
            // the last session is in this one. A failed read is null, not an empty pool.
            seedWords = seedWords,
            loadPool = {
                val ids = runCatching { container.progressClient.fetchCompletedLessonIds(course.code) }.getOrNull()
                ids?.let { Pronunciation.learnedPool(container.content.bundle(course).units, it.toSet(), course) }
            },
            voice = { container.voicePrefs.voice(VoiceCharacter.Alphonso, course.code) },
            play = { playback.play(it) },
            deviceSpeak = { Speech.get(context).speak(it, course) },
        )
    }
    val ui by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val isConnected by container.connectivity.isConnected.collectAsState()
    val consent by container.aiConsent.state.collectAsState()
    val consentStatus = container.aiConsent.statusOf(consent)
    val hasAiConsent = consentStatus == AiConsentStatus.GRANTED
    var showConsent by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    DisposableEffect(Unit) { onDispose { vm.engine.cancel(); playback.stop() } }
    BackHandler(onBack = onExit)

    val session = ui.session
    val canCapture = isConnected && hasAiConsent && !ui.micUnavailable
    val reduceMotion = rememberReduceMotion()

    Column(
        Modifier.testTag("say-it-right").fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(Space.gutter),
        verticalArrangement = Arrangement.spacedBy(Space.s4), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Say it right", style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.semantics { heading() })
        when {
            ui.loading -> SirNote("Getting your words...")
            ui.loadFailed -> {
                SirNote("Couldn't read the words you have learned just now. Check your connection and try again.")
                HubButton("Try again") { vm.startSession() }
            }
            seedWords == null && session.words.size < Pronunciation.MIN_POOL ->
                SirNote("Learn a few words first. Say it right practises the words you have already met in lessons.")
            else -> SayItRightContent(
                session = session, phase = phase, canCapture = canCapture, error = ui.error, reduceMotion = reduceMotion,
                onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
                onHear = vm::playModel, onNext = { if (phase == TurnPhase.IDLE) vm.next() }, onRestart = { vm.startSession() }, onBack = onExit,
                unavailable = {
                    // Graceful: offline, no consent, no microphone, or a failed transcription. The word can always be heard.
                    SirNote(
                        when {
                            ui.micUnavailable -> "Recording needs a microphone and a connection, and this device can't record right now. You can still hear the word."
                            !isConnected -> "You're offline. You can still hear each word."
                            consentStatus == AiConsentStatus.LOADING -> AiConsentCopy.checkingSetting
                            consentStatus == AiConsentStatus.UNAVAILABLE -> AiConsentCopy.checkFailedTitle
                            else -> "Say it right uses AI speech, which is turned off. You can still hear each word."
                        },
                    )
                    if (isConnected && !ui.micUnavailable) when (consentStatus) {
                        AiConsentStatus.DENIED -> HubSecondaryButton(AiConsentCopy.useVoiceInstead) { showConsent = true }
                        AiConsentStatus.UNAVAILABLE -> HubSecondaryButton(AiConsentCopy.retry) { scope.launch { container.aiConsent.refresh() } }
                        else -> Unit
                    }
                },
            )
        }
        if (ui.loading || ui.loadFailed || (seedWords == null && session.words.size < Pronunciation.MIN_POOL)) HubSecondaryButton("Back to Practice", onExit)
        if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
    }
}

/**
 * The Say it right lesson itself, drawn from state alone (no recorder, consent or network), so a visual test can put
 * every state on screen. A warm 1:1 lesson: Alphonso in pose with the word in his speech bubble, the learner's mic
 * opposite him (blue at rest, red while recording), and a wrap with stars and "N of M clearly".
 */
@Composable
internal fun SayItRightContent(
    session: PronunciationSession,
    phase: TurnPhase,
    canCapture: Boolean,
    error: String?,
    reduceMotion: Boolean,
    unavailable: @Composable () -> Unit,
    onPressBegan: () -> Unit,
    onPressEnded: () -> Unit,
    onHear: (String) -> Unit,
    onNext: () -> Unit,
    onRestart: () -> Unit,
    onBack: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    // At large text sizes the pose hides, so the bubble (the word and the line) never clips.
    val largeText = LocalDensity.current.fontScale > 1.3f
    if (session.phase == PronunciationPhase.DONE) {
        val pose = rememberFirstRunAsset(SayItRightPose.CHEER.asset)
        Column(
            Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4),
            verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (!largeText) pose?.let {
                Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.testTag("sir-pose-image").height(160.dp).clearAndSetSemantics { })
            }
            PracticeStars(session.stars, prominent = true)
            Text("Practised ${session.words.size} words", style = Type.title.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center)
            Text(session.clearlyLine, style = Type.headline.toTextStyle(), color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.testTag("sir-clearly"))
            Text("Every word you say out loud sticks a little more.", style = Type.body.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
            HubButton("Practise more", onRestart)
            HubSecondaryButton("Back", onBack)
        }
        return
    }
    val word = session.current ?: return
    val recording = phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC
    val busy = phase == TurnPhase.TRANSCRIBING
    val pose = session.pose(recording || busy)
    val image = rememberFirstRunAsset(pose.asset)
    val line = when {
        recording -> SayItRight.LISTENING_LINE
        busy -> SayItRight.CHECKING_LINE
        session.phase == PronunciationPhase.ASK -> SayItRight.ASK_LINE
        else -> session.line ?: SayItRight.ASK_LINE
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s4), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Word ${session.index + 1} of ${session.words.size}", style = Type.caption.toTextStyle(), color = ds.inkSoft)
        // Alphonso, in pose, with the word in his speech bubble.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            if (!largeText) {
                Box(Modifier.testTag("sir-pose").height(176.dp).width(110.dp).clearAndSetSemantics { }, contentAlignment = Alignment.BottomStart) {
                    image?.let { Image(it, null, contentScale = ContentScale.Fit, alignment = Alignment.BottomStart, modifier = Modifier.testTag("sir-pose-image").fillMaxHeight()) }
                }
            }
            Column(
                Modifier.testTag("sir-bubble").weight(1f).padding(bottom = Space.s5)
                    .background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble))
                    .border(1.5.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4),
                verticalArrangement = Arrangement.spacedBy(Space.s2), horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    line, style = Type.footnote.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("sir-line").semantics { liveRegion = LiveRegionMode.Polite },
                )
                Text(word.term, style = Type.title.toTextStyle(), color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.testTag("sir-word"))
                if (word.meaning.isNotEmpty()) Text(word.meaning, style = Type.caption.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
                // Always available, in every state: a microphone, consent or STT failure is never a dead end.
                HubSecondaryButton("Hear it") { onHear(word.term) }
            }
        }
        if (session.phase == PronunciationPhase.RESULT) {
            HubButton(session.nextLabel, onNext)
        } else {
            if (canCapture) {
                // The learner's mic sits opposite Alphonso.
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { SirMic(recording, busy, reduceMotion, onPressBegan, onPressEnded) }
                Text(
                    when {
                        recording -> "Listening. Let go or tap to send."
                        busy -> SayItRight.CHECKING_LINE
                        session.phase == PronunciationPhase.RETRY -> SayItRight.RETRY_HINT
                        else -> "Hold to talk, or tap to start and tap to stop."
                    },
                    style = Type.footnote.toTextStyle(), color = ds.inkSoft, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            } else {
                unavailable()
            }
            error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
            HubSecondaryButton(session.skipLabel) { onNext() }
        }
    }
}

/**
 * The learner's mic: BLUE at rest, RED while recording (deliberately not Say the picture's gold), in a ring that fills
 * over [SayItRight.MAX_RECORD_MS]; when it is full the recording stops and is sent. Hold to talk; for TalkBack it is a
 * button that says how to use it and whether it is recording, and activating it toggles.
 */
@Composable
internal fun SirMic(recording: Boolean, busy: Boolean, reduceMotion: Boolean, onPressBegan: () -> Unit, onPressEnded: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val fill = remember { Animatable(0f) }
    LaunchedEffect(recording, reduceMotion) {
        when {
            reduceMotion -> fill.snapTo(if (recording) 1f else 0f)
            recording -> { fill.snapTo(0f); fill.animateTo(1f, tween(SayItRight.MAX_RECORD_MS, easing = LinearEasing)) }
            else -> fill.animateTo(0f, tween(200))
        }
    }
    // The ring is full: stop and send.
    LaunchedEffect(recording) {
        if (recording) { kotlinx.coroutines.delay(SayItRight.MAX_RECORD_MS.toLong()); onPressEnded() }
    }
    val recordingNow by rememberUpdatedState(recording)
    if (busy) return
    val size = 98.dp
    val track = ds.ink.copy(alpha = 0.1f)
    Box(
        Modifier.testTag("sir-mic").size(size)
            .semantics {
                contentDescription = "Hold to say the word. Press and hold, say the word, then let go to send it. Or tap to start, and tap to stop."
                stateDescription = if (recording) "Recording" else "Ready"
                role = Role.Button
                onClick(label = if (recording) "Stop and send" else "Start recording") { if (recording) onPressEnded() else onPressBegan(); true }
            }
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    // A second tap on a latched recording stops it; a quick first tap latches the recording on; a real hold
                    // is hold-to-talk and its release sends. The 6 s ring still stops a latched recording.
                    val wasRecording = recordingNow
                    val pressedAt = System.currentTimeMillis()
                    onPressBegan()
                    tryAwaitRelease()
                    if (SayItRight.releaseStops(System.currentTimeMillis() - pressedAt, wasRecording)) onPressEnded()
                })
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 4.dp.toPx()
            val inset = stroke / 2
            val arc = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            drawArc(ds.wrong, -90f, 360f * fill.value, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Box(Modifier.size(size - 22.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxSize().offset(y = 4.dp).clip(CircleShape).background(if (recording) ds.wrongEdge else ds.choiceEdge))
            Box(Modifier.fillMaxSize().clip(CircleShape).background(if (recording) ds.wrong else ds.choice), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Mic, contentDescription = null, tint = if (recording) ds.onWrong else ds.onChoice, modifier = Modifier.size(32.dp).clearAndSetSemantics { })
            }
        }
    }
}

@Composable
private fun SirNote(text: String) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text, style = Type.body.toTextStyle(), color = ds.inkSoft,
        modifier = Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s4).semantics { liveRegion = LiveRegionMode.Polite },
    )
}
