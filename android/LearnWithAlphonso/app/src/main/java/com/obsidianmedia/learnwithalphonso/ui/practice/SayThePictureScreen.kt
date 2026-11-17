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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
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
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.SayPicturePhase
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureSession
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureSpeech
import com.obsidianmedia.learnwithalphonso.core.logic.SayThePicture
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.lesson.VocabImage
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

data class SayPictureUi(
    val session: SayPictureSession,
    val error: String? = null,
    /** The microphone is denied, or a capture or transcription failed: "Show me the word" is the way on. */
    val micUnavailable: Boolean = false,
)

/**
 * Say the picture (Practice activity): a word's photo with no text, the learner says it. A miss reveals the written
 * word and plays the model, the learner repeats it once, and the session goes on. No hearts, no penalty.
 *
 * Mirrors the web's SayThePicture.tsx and the iOS SayThePictureView. Speech goes through the existing /api/stt (the
 * speaking quota, `stt` kind) and the model through /api/tts ([SayPictureSpeech]); the pool is derived LIVE from the
 * bundled vocabulary and its image table every time a session starts ([SayThePicture.pool]), never cached.
 */
class SayPictureViewModel(
    recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    ai: AiConversationClient,
    private val course: Course,
    /** A fresh word draw from the live pool. Called at every session start. */
    private val newWords: () -> List<SayThePicture.PictureWord>,
    private val voice: () -> String?,
    /** Plays the fetched model audio; false when it could not play. */
    private val play: suspend (ByteArray) -> Boolean,
    /** The on-device voice, when the model audio cannot be fetched or played. */
    private val deviceSpeak: (String) -> Unit,
) : ViewModel() {
    private val speech = SayPictureSpeech(ai)
    val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> SttResult(speech.transcribe(audio, course, timing), null) }, viewModelScope)
    private val _state = MutableStateFlow(SayPictureUi(startSession()))
    val state: StateFlow<SayPictureUi> = _state.asStateFlow()

    /** Too few pictured words for a session: an empty run, shown as the "not enough words" state. */
    private fun startSession(): SayPictureSession {
        val pool = newWords()
        return if (pool.size < SayThePicture.MIN_POOL) SayPictureSession(emptyList()) else SayPictureSession(SayThePicture.draw(pool))
    }

    init {
        viewModelScope.launch {
            engine.events.collect { event ->
                when (event) {
                    is TurnEvent.Transcribed -> onTranscript(event.text)
                    TurnEvent.Empty, TurnEvent.TooShort ->
                        _state.update { it.copy(error = "Didn't catch that. Try again, or tap Show me the word.") }
                    TurnEvent.MicDenied -> _state.update {
                        it.copy(micUnavailable = true, error = "Microphone access is off. Turn it on in Settings > Apps > Learn with Alphonso > Permissions, or tap Show me the word.")
                    }
                    // A failure (quota, network) must never leave a dead end: the word can always be shown.
                    is TurnEvent.Failed -> _state.update {
                        it.copy(micUnavailable = it.micUnavailable || !event.consentRequired, error = if (event.consentRequired) null else "Couldn't check that just now. You can still see the word.")
                    }
                }
            }
        }
    }

    private fun onTranscript(text: String) {
        val (next, outcome) = _state.value.session.submit(text, course)
        _state.update { it.copy(session = next, error = if (outcome == SayPictureOutcome.UNHEARD) "Didn't catch that. Try again." else null) }
        if (outcome == SayPictureOutcome.REVEAL) next.current?.let { playModel(it.term) }
    }

    fun pressBegan() { _state.update { it.copy(error = null) }; engine.pressBegan() }
    fun pressEnded() = engine.pressEnded()

    fun showWord() {
        val next = _state.value.session.showWord()
        if (next == _state.value.session) return
        _state.update { it.copy(session = next, error = null) }
        next.current?.let { playModel(it.term) }
    }

    fun next() = _state.update { it.copy(session = it.session.next(), error = null) }

    /** "Practise more": a new draw, so a photo batch that landed since is in the pool. */
    fun restart() = _state.update { SayPictureUi(startSession(), micUnavailable = it.micUnavailable) }

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
fun SayThePictureScreen(container: AppContainer, course: Course, onExit: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val playback = remember { container.newPlayback() }
    val vm: SayPictureViewModel = viewModel(key = "say-the-picture-${course.code}") {
        SayPictureViewModel(
            container.newRecorder(), { container.micPermission.request() }, container.aiClient, course,
            // The live pool: the bundle's units and its image table, read now, so a new photo batch is in the next session.
            newWords = { SayThePicture.pool(container.content.bundle(course).units, container.content.vocabImages) },
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
        Modifier.testTag("say-the-picture").fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(Space.gutter),
        verticalArrangement = Arrangement.spacedBy(Space.s4), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Say the picture", style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.semantics { heading() })
        when {
            session.words.isEmpty() -> StpNote("Not enough words with pictures yet. Check back soon.")
            session.phase == SayPicturePhase.DONE -> {
                Column(Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally) {
                    PracticeStars(session.stars, prominent = true)
                    Text("Practised ${session.words.size} words", style = Type.title.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center)
                    Text("${session.firstTry} of ${session.words.size} said first time. Every word you practise sticks a little more.", style = Type.body.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
                    HubButton("Practise more") { vm.restart() }
                    HubSecondaryButton("Back to Practice", onExit)
                }
            }
            else -> session.current?.let { word ->
                Text("Word ${session.index + 1} of ${session.words.size}", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                // The photo's own description would give the answer away while asking, so a generic one stands in.
                VocabImage(
                    if (session.phase == SayPicturePhase.ASK) word.image.copy(alt = "A picture of a word to say") else word.image,
                    height = Space.s12 * 5,
                )
                when (session.phase) {
                    SayPicturePhase.ASK -> {
                        if (canCapture) {
                            val hint = when (phase) {
                                TurnPhase.RECORDING, TurnPhase.REQUESTING_MIC -> "Listening. Let go when you're done"
                                TurnPhase.TRANSCRIBING -> "Checking what you said..."
                                TurnPhase.IDLE -> "What is this? Hold and say it."
                            }
                            HoldToTalkButton(
                                phase = phase, busyLabel = if (phase == TurnPhase.TRANSCRIBING) "Checking what you said..." else null,
                                tint = ds.choice, hint = hint, accessibilityLabel = "Hold to say the word",
                                onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
                            )
                        } else {
                            // Graceful: offline, no consent, no microphone, or a failed transcription. The word can always be revealed.
                            StpNote(
                                when {
                                    ui.micUnavailable -> "Say the picture needs a microphone and a connection, and it can't record right now. You can still see each word."
                                    !isConnected -> "You're offline. You can still see each word."
                                    consentStatus == AiConsentStatus.LOADING -> AiConsentCopy.checkingSetting
                                    consentStatus == AiConsentStatus.UNAVAILABLE -> AiConsentCopy.checkFailedTitle
                                    else -> "Saying the picture uses AI speech, which is turned off. You can still see each word."
                                },
                            )
                            if (isConnected && !ui.micUnavailable) when (consentStatus) {
                                AiConsentStatus.DENIED -> HubSecondaryButton(AiConsentCopy.useVoiceInstead) { showConsent = true }
                                AiConsentStatus.UNAVAILABLE -> HubSecondaryButton(AiConsentCopy.retry) { scope.launch { container.aiConsent.refresh() } }
                                else -> Unit
                            }
                        }
                        ui.error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
                        HubSecondaryButton("Show me the word") { if (phase == TurnPhase.IDLE) vm.showWord() }
                    }
                    SayPicturePhase.RIGHT -> Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("★ ${word.term}", style = Type.title.toTextStyle(), color = ds.rightInk)
                        HubButton(session.nextLabel) { vm.next() }
                    }
                    SayPicturePhase.REVEAL -> {
                        Column(Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s2), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("IT IS", style = Type.overline.toTextStyle(), color = ds.inkSoft)
                            Text(word.term, style = Type.title.toTextStyle(), color = ds.brand)
                            HubSecondaryButton("Hear it") { vm.playModel(word.term) }
                        }
                        val busy = phase != TurnPhase.IDLE
                        Text(
                            when {
                                phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC -> "Listening. Let go when you're done."
                                phase == TurnPhase.TRANSCRIBING -> "Checking what you said..."
                                session.heard != null -> "Nice. That is it for this word."
                                else -> "Now say it once yourself."
                            },
                            style = Type.footnote.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        ui.error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
                        if (session.heard == null && canCapture) {
                            HoldToTalkButton(
                                phase = phase, busyLabel = if (phase == TurnPhase.TRANSCRIBING) "Checking what you said..." else null,
                                tint = ds.choice, hint = "", accessibilityLabel = "Hold to say the word",
                                onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
                            )
                        }
                        if (session.heard == null) HubSecondaryButton(session.nextWordLabel) { if (!busy) vm.next() }
                        else HubButton(session.nextWordLabel) { if (!busy) vm.next() }
                    }
                    SayPicturePhase.DONE -> Unit
                }
            }
        }
        if (session.phase != SayPicturePhase.DONE || session.words.isEmpty()) HubSecondaryButton("Back to Practice", onExit)
        if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
    }
}

@Composable
private fun StpNote(text: String) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text, style = Type.body.toTextStyle(), color = ds.inkSoft,
        modifier = Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s4).semantics { liveRegion = LiveRegionMode.Polite },
    )
}
