package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.audio.HoldToTalkButton
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.Pronunciation
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationPhase
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationSession
import com.obsidianmedia.learnwithalphonso.core.logic.PronunciationSpeech
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
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
 * Say it right (Practice drill): a word the learner has already learned, a "Hear it" model, and a recording judged on
 * how clearly it was understood. A miss replays the model and allows one retry, then the session goes on. No hearts,
 * no penalty.
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
            val pool = runCatching { loadPool() }.getOrNull()
            _state.update {
                when {
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
fun PronunciationScreen(container: AppContainer, course: Course, onExit: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val playback = remember { container.newPlayback() }
    val vm: PronunciationViewModel = viewModel(key = "say-it-right-${course.code}") {
        PronunciationViewModel(
            container.newRecorder(), { container.micPermission.request() }, container.aiClient, course,
            // The live pool: the bundle's units and the account's completed lessons, read now, so a lesson finished since
            // the last session is in this one. A failed read is null, not an empty pool.
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
            session.words.size < Pronunciation.MIN_POOL ->
                SirNote("Learn a few words first. Say it right practises the words you have already met in lessons.")
            session.phase == PronunciationPhase.DONE -> {
                Column(Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally) {
                    PracticeStars(session.stars, prominent = true)
                    Text("Practised ${session.words.size} words", style = Type.title.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center)
                    Text("${session.greatFirst} of ${session.words.size} said clearly first time. Every word you say out loud sticks a little more.", style = Type.body.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
                    HubButton("Practise more") { vm.startSession() }
                    HubSecondaryButton("Back to Practice", onExit)
                }
            }
            else -> session.current?.let { word ->
                Text("Word ${session.index + 1} of ${session.words.size}", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                Column(Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s2), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(word.term, style = Type.title.toTextStyle(), color = ds.brand, textAlign = TextAlign.Center)
                    if (word.meaning.isNotEmpty()) Text(word.meaning, style = Type.caption.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
                    // Always available, in every state: a microphone, consent or STT failure is never a dead end.
                    HubSecondaryButton("Hear it") { vm.playModel(word.term) }
                }
                if (session.phase == PronunciationPhase.RESULT) {
                    Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (session.verdict == Pronunciation.Verdict.GREAT) {
                            Text("★ Great!", style = Type.title.toTextStyle(), color = ds.rightInk)
                        } else {
                            Text("Good try. It gets easier each time.", style = Type.headline.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center)
                        }
                        HubButton(session.nextLabel) { vm.next() }
                    }
                } else {
                    if (canCapture) {
                        if (session.phase == PronunciationPhase.RETRY) session.verdict?.let {
                            Text(verdictMessage(it), style = Type.footnote.toTextStyle(), color = ds.choice, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        }
                        val hint = when (phase) {
                            TurnPhase.RECORDING, TurnPhase.REQUESTING_MIC -> "Listening. Let go when you're done"
                            TurnPhase.TRANSCRIBING -> "Checking how clear that was..."
                            TurnPhase.IDLE -> if (session.phase == PronunciationPhase.RETRY) "Listen, then try once more." else "Hold and say it."
                        }
                        HoldToTalkButton(
                            phase = phase, busyLabel = if (phase == TurnPhase.TRANSCRIBING) "Checking how clear that was..." else null,
                            tint = ds.choice, hint = hint, accessibilityLabel = "Hold to say the word",
                            onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
                        )
                    } else {
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
                    }
                    ui.error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
                    HubSecondaryButton(session.skipLabel) { if (phase == TurnPhase.IDLE) vm.next() }
                }
            }
        }
        if (session.phase != PronunciationPhase.DONE || ui.loading || ui.loadFailed || session.words.size < Pronunciation.MIN_POOL) HubSecondaryButton("Back to Practice", onExit)
        if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
    }
}

/** What the verdict says on a miss. It never claims more than "clear": it reflects being understood, not which sound was off. */
private fun verdictMessage(verdict: Pronunciation.Verdict): String = when (verdict) {
    Pronunciation.Verdict.GREAT -> "Great!"
    Pronunciation.Verdict.ALMOST -> "Almost - say it a touch clearer."
    Pronunciation.Verdict.AGAIN -> "Let's try again."
}

@Composable
private fun SirNote(text: String) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text, style = Type.body.toTextStyle(), color = ds.inkSoft,
        modifier = Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s4).semantics { liveRegion = LiveRegionMode.Polite },
    )
}
