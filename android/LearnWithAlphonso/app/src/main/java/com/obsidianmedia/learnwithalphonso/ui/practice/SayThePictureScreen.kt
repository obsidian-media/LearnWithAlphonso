package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordError
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordException
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordPolicy
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.SayPicturePhase
import com.obsidianmedia.learnwithalphonso.core.logic.SayPicturePose
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureResult
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureSession
import com.obsidianmedia.learnwithalphonso.core.logic.SayPictureSpeech
import com.obsidianmedia.learnwithalphonso.core.logic.SayThePicture
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.AsyncRemoteImage
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
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

/** The summary's "add them to your review deck" progress. */
sealed interface SayPictureSave {
    data object Idle : SayPictureSave
    data object Saving : SayPictureSave
    data class Saved(val count: Int, val skipped: Int) : SayPictureSave
    data class Failed(val message: String) : SayPictureSave
}

data class SayPictureUi(
    val session: SayPictureSession,
    val error: String? = null,
    /** The microphone is denied, or a capture or transcription failed: "Show me the word" is the way on. */
    val micUnavailable: Boolean = false,
    val save: SayPictureSave = SayPictureSave.Idle,
)

/**
 * Say the picture (Practice activity): a word's photo with no text, full-bleed, and the learner says it. A frosted stage
 * at the bottom holds the hold-to-talk ring; Alphonso reacts in pose. A miss reveals the written word ON the photo and
 * plays the model, the learner repeats it once, and the session goes on. No hearts, no penalty.
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
    /** The existing save-word route (`/api/define-word`): word, sentence, course code. */
    private val defineWord: suspend (String, String, String) -> Unit = { _, _, _ -> },
    private val signedIn: () -> Boolean = { true },
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

    /**
     * "Add them to your review deck": each missed single word goes through the existing save-word route, the same one
     * the tap-to-save sheet uses. A phrase is left out, as the route would refuse it.
     */
    fun saveMissed() {
        val missed = _state.value.session.missedWords
        val savable = missed.filter { SayThePicture.isSavable(it.term) }
        if (savable.isEmpty() || _state.value.save is SayPictureSave.Saving) return
        _state.update { it.copy(save = SayPictureSave.Saving) }
        viewModelScope.launch {
            if (!signedIn()) { _state.update { it.copy(save = SayPictureSave.Failed(SavedWordError.NOT_SIGNED_IN.userMessage)) }; return@launch }
            var saved = 0
            for (word in savable) {
                try {
                    defineWord(word.term, word.term, course.code)
                    saved += 1
                } catch (e: SavedWordException) {
                    _state.update { it.copy(save = SayPictureSave.Failed(e.error.userMessage)) }
                    return@launch
                } catch (e: Exception) {
                    _state.update { it.copy(save = SayPictureSave.Failed(SavedWordError.OFFLINE.userMessage)) }
                    return@launch
                }
            }
            _state.update { it.copy(save = SayPictureSave.Saved(saved, missed.size - savable.size)) }
        }
    }

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
            defineWord = { word, sentence, code -> container.aiClient.defineWord(word, sentence, code) },
            signedIn = { container.session.currentAccessToken() != null },
        )
    }
    val ui by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val isConnected by container.connectivity.isConnected.collectAsState()
    val consent by container.aiConsent.state.collectAsState()
    val consentStatus = container.aiConsent.statusOf(consent)
    val hasAiConsent = consentStatus == AiConsentStatus.GRANTED
    var showConsent by rememberSaveable { mutableStateOf(false) }
    // The missed words handed to Say it right from the summary; null while on this screen.
    var drillWords by remember { mutableStateOf<List<VocabItem>?>(null) }
    val scope = rememberCoroutineScope()
    DisposableEffect(Unit) { onDispose { vm.engine.cancel(); playback.stop() } }

    drillWords?.let { words ->
        // The same Say it right drill, handed exactly the words missed here.
        PronunciationScreen(container, course, onExit = { drillWords = null }, seedWords = words)
        return
    }
    BackHandler(onBack = onExit)

    val canCapture = isConnected && hasAiConsent && !ui.micUnavailable
    SayThePictureContent(
        session = ui.session, phase = phase, canCapture = canCapture, error = ui.error, save = ui.save,
        canSave = SavedWordPolicy.allowsSaving(course.code),
        reduceMotion = rememberReduceMotion(),
        onExit = onExit, onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
        onShowWord = { if (phase == TurnPhase.IDLE) vm.showWord() }, onNext = { if (phase == TurnPhase.IDLE) vm.next() },
        onHear = vm::playModel, onRestart = vm::restart, onSayItRight = { drillWords = it }, onSave = vm::saveMissed,
        unavailable = {
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
        },
    )
    if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
}

/**
 * The whole screen as a function of its state, so it can be drawn (and tested) without a recorder, a session or a
 * network. The stateful [SayThePictureScreen] feeds it.
 */
@Composable
internal fun SayThePictureContent(
    session: SayPictureSession,
    phase: TurnPhase,
    canCapture: Boolean,
    error: String?,
    save: SayPictureSave,
    canSave: Boolean,
    reduceMotion: Boolean,
    onExit: () -> Unit,
    onPressBegan: () -> Unit,
    onPressEnded: () -> Unit,
    onShowWord: () -> Unit,
    onNext: () -> Unit,
    onHear: (String) -> Unit,
    onRestart: () -> Unit,
    onSayItRight: (List<VocabItem>) -> Unit,
    onSave: () -> Unit,
    unavailable: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val word = session.current
    if (session.words.isEmpty() || session.phase == SayPicturePhase.DONE || word == null) {
        Column(
            Modifier.testTag("say-the-picture").fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(Space.gutter),
            verticalArrangement = Arrangement.spacedBy(Space.s4), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Say the picture", style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.semantics { heading() })
            if (session.words.isEmpty()) StpNote("Not enough words with pictures yet. Check back soon.")
            else StpSummary(session, save, canSave, onSayItRight, onSave, onRestart)
            HubSecondaryButton("Back to Practice", onExit)
        }
        return
    }

    val listening = phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC
    val pose = SayPicturePose.of(session.phase, listening)
    Box(Modifier.testTag("say-the-picture").fillMaxSize().background(ds.brand)) {
        // The photo is the hero. While asking, its own description would give the answer away.
        key(word.image.url) { StpHero(word.image.url, if (session.phase == SayPicturePhase.ASK) null else word.image.alt, reduceMotion) }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.42f), 0.16f to Color.Transparent, 0.36f to Color.Transparent, 0.56f to Color.Black.copy(alpha = 0.14f), 1f to Color.Transparent)))

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            StpTopBar(session, onExit)
            when (session.phase) {
                SayPicturePhase.RIGHT -> StpWin(word.term, session.combo, reduceMotion)
                SayPicturePhase.REVEAL -> StpReveal(word.term) { onHear(word.term) }
                else -> Unit
            }
            Spacer(Modifier.weight(1f))
            StpTutor(pose, session.phase, listening)
            StpStage(session, phase, canCapture, error, listening, reduceMotion, onPressBegan, onPressEnded, onShowWord, onNext, unavailable)
        }
    }
}

// ---------------------------------------------------------------- round pieces

@Composable
private fun StpHero(url: String, description: String?, reduceMotion: Boolean) {
    val ds = LocalAlphonsoTokens.current
    // A slow Ken Burns drift; none under Reduce Motion.
    val drift = if (reduceMotion) 0f else rememberInfiniteTransition(label = "stp-kenburns").animateFloat(
        0f, 1f, infiniteRepeatable(tween(20_000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "drift",
    ).value
    Box(Modifier.testTag("stp-hero").fillMaxSize().background(ds.brand).clip(RoundedCornerShape(0.dp))) {
        AsyncRemoteImage(
            url = url, contentDescription = description,
            modifier = Modifier.fillMaxSize().graphicsLayer {
                val scale = 1.06f + 0.10f * drift
                scaleX = scale; scaleY = scale
                translationX = -0.02f * size.width * drift; translationY = -0.015f * size.height * drift
            },
        )
    }
}

@Composable
private fun StpTopBar(session: SayPictureSession, onExit: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = Space.s2), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
        Box(
            Modifier.size(Space.minTouch).clip(CircleShape).background(Color.White.copy(alpha = 0.22f)).border(1.dp, Color.White.copy(alpha = 0.25f), CircleShape)
                .clickable(onClickLabel = null, role = Role.Button, onClick = onExit).semantics { contentDescription = "Back to Practice" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.size(18.dp)) }
        Row(
            Modifier.weight(1f).clearAndSetSemantics { heading(); contentDescription = "Say the picture, word ${session.index + 1} of ${session.words.size}" },
            horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically,
        ) {
            session.words.indices.forEach { i ->
                val color = when {
                    i == session.index -> Color.White
                    session.results.getOrNull(i) == SayPictureResult.FIRST -> ds.action
                    session.results.getOrNull(i) != null -> Color.White.copy(alpha = 0.8f)
                    else -> Color.White.copy(alpha = 0.45f)
                }
                Box(Modifier.testTag("stp-dot").size(width = if (i == session.index) 20.dp else 7.dp, height = 7.dp).clip(CircleShape).background(color))
            }
        }
        Spacer(Modifier.size(Space.minTouch))
    }
}

/** The word stamps on (it lands from slightly large), a few sparks and the combo chip. Static under Reduce Motion. */
@Composable
private fun StpWin(term: String, combo: Int, reduceMotion: Boolean) {
    val ds = LocalAlphonsoTokens.current
    var landed by remember { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) { landed = true }
    val scale by animateFloatAsState(if (landed) 1f else 1.3f, if (reduceMotion) tween(0) else spring(dampingRatio = 0.65f, stiffness = 400f), label = "stamp")
    val alpha by animateFloatAsState(if (landed) 1f else 0f, tween(if (reduceMotion) 0 else 250), label = "stampAlpha")
    Box(Modifier.fillMaxWidth().padding(top = Space.s4).testTag("stp-win").semantics { liveRegion = LiveRegionMode.Polite }) {
        // Sparks: drawn once, static under Reduce Motion.
        listOf(-110 to 18, 95 to 6, 130 to 66, -135 to 60).forEach { (x, y) ->
            Icon(Icons.Filled.Star, null, tint = LocalAlphonsoTokens.current.onHeroKick, modifier = Modifier.align(Alignment.TopCenter).padding(top = y.dp).graphicsLayer { translationX = x.dp.toPx(); this.alpha = 0.95f * alpha }.size(18.dp))
        }
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text(
                if (combo >= 2) "$combo in a row" else "First try", style = Type.footnote.toTextStyle(), color = ds.brand,
                modifier = Modifier.testTag("stp-combo").clip(CircleShape).background(ds.surface.copy(alpha = 0.95f)).padding(horizontal = Space.s3, vertical = 5.dp),
            )
            Text(
                term, style = Type.display.toTextStyle(), color = Color.White, textAlign = TextAlign.Center,
                modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = alpha }.padding(horizontal = Space.s4),
            )
        }
    }
}

/** A miss reveals the word on the photo itself, with the model one tap away. */
@Composable
private fun StpReveal(term: String, onHear: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxWidth().padding(top = Space.s4, start = Space.s4, end = Space.s4).testTag("stp-reveal"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("IT IS", style = Type.overline.toTextStyle(), color = ds.onHeroKick)
        Text(term, style = Type.display.toTextStyle(), color = Color.White, textAlign = TextAlign.Center)
        Button(
            onClick = onHear, modifier = Modifier.heightIn(min = Space.minTouch),
            colors = ButtonDefaults.buttonColors(containerColor = ds.action, contentColor = ds.onAction), shape = CircleShape,
        ) { Text("Hear it", style = Type.footnote.toTextStyle()) }
    }
}

/** Alphonso, fully in frame, reacting in pose, with a small speech bubble. */
@Composable
private fun StpTutor(pose: SayPicturePose, phase: SayPicturePhase, listening: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val image = rememberFirstRunAsset(pose.asset)
    val bubble = when {
        phase == SayPicturePhase.RIGHT -> "First try. Brilliant!"
        listening -> "Mm-hm, I'm listening..."
        phase == SayPicturePhase.REVEAL -> "Now say it with me."
        else -> "Have a look. What's this one?"
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = Space.s2), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.testTag("stp-pose").height(210.dp).width(150.dp).clearAndSetSemantics { }, contentAlignment = Alignment.BottomStart) {
            image?.let { Image(it, null, contentScale = ContentScale.Fit, alignment = Alignment.BottomStart, modifier = Modifier.testTag("stp-pose-image").fillMaxHeight()) }
        }
        Text(
            bubble, style = Type.footnote.toTextStyle(), color = ds.ink,
            modifier = Modifier.padding(bottom = 130.dp).widthIn(max = 190.dp).clearAndSetSemantics { }
                .background(Color.White, RoundedCornerShape(16.dp)).border(1.5.dp, ds.line, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 9.dp),
        )
    }
}

/** The frosted control stage. */
@Composable
private fun StpStage(
    session: SayPictureSession,
    phase: TurnPhase,
    canCapture: Boolean,
    error: String?,
    listening: Boolean,
    reduceMotion: Boolean,
    onPressBegan: () -> Unit,
    onPressEnded: () -> Unit,
    onShowWord: () -> Unit,
    onNext: () -> Unit,
    unavailable: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val busy = phase == TurnPhase.TRANSCRIBING
    Column(
        Modifier.testTag("stp-stage").fillMaxWidth().clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)).background(ds.surface.copy(alpha = 0.94f))
            .navigationBarsPadding().padding(horizontal = 18.dp, vertical = Space.s4),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s3),
    ) {
        when (session.phase) {
            SayPicturePhase.ASK -> {
                if (canCapture) {
                    StpMicRing(listening, busy, 98.dp, reduceMotion, onPressBegan, onPressEnded)
                    Text(
                        when { listening -> "Listening. Let go when you're done"; busy -> "Checking what you said..."; else -> "What is this? Hold and say it." },
                        style = Type.footnote.toTextStyle(), color = ds.inkSoft, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                } else unavailable()
                error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
                HubSecondaryButton("Show me the word", onShowWord)
            }
            SayPicturePhase.RIGHT -> {
                Text("First try. Brilliant!", style = Type.headline.toTextStyle(), color = ds.rightInk)
                HubButton(session.nextLabel, onNext)
            }
            SayPicturePhase.REVEAL -> {
                Text(
                    when { listening -> "Listening. Let go when you're done."; busy -> "Checking what you said..."; session.heard != null -> "Nice. That is it for this word."; else -> "Now say it once yourself." },
                    style = Type.footnote.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                error?.let { Text(it, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center) }
                if (session.heard == null && canCapture) StpMicRing(listening, busy, 76.dp, reduceMotion, onPressBegan, onPressEnded)
                if (session.heard == null) HubSecondaryButton(session.nextWordLabel, onNext) else HubButton(session.nextWordLabel, onNext)
            }
            SayPicturePhase.DONE -> Unit
        }
    }
}

/**
 * The gold mic inside a ring that fills while it is held (red while recording). Hold to talk, release to send. For
 * TalkBack the ring is a button that says how to use it and whether it is recording; activating it toggles.
 */
@Composable
internal fun StpMicRing(recording: Boolean, busy: Boolean, size: androidx.compose.ui.unit.Dp, reduceMotion: Boolean, onPressBegan: () -> Unit, onPressEnded: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val fill = remember { Animatable(0f) }
    LaunchedEffect(recording, reduceMotion) {
        when {
            reduceMotion -> fill.snapTo(if (recording) 1f else 0f)
            recording -> { fill.snapTo(0f); fill.animateTo(1f, tween(6000, easing = LinearEasing)) }
            else -> fill.animateTo(0f, tween(200))
        }
    }
    if (busy) {
        Text("Checking what you said...", style = Type.footnote.toTextStyle(), color = ds.inkSoft)
        return
    }
    val track = ds.ink.copy(alpha = 0.1f)
    Box(
        Modifier.testTag("stp-mic").size(size)
            .semantics {
                contentDescription = "Hold to say the word. Press and hold, say the word, then let go to send it."
                stateDescription = if (recording) "Recording" else "Ready"
                role = Role.Button
                onClick(label = if (recording) "Stop and send" else "Start recording") { if (recording) onPressEnded() else onPressBegan(); true }
            }
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    onPressBegan()
                    try { tryAwaitRelease() } finally { onPressEnded() }
                })
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 4.dp.toPx()
            val inset = stroke / 2
            val arc = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            drawArc(if (recording) ds.wrong else ds.action, -90f, 360f * fill.value, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Box(
            Modifier.size(size - 22.dp).shadow(0.dp, CircleShape).clip(CircleShape)
                .background(if (recording) Brush.verticalGradient(listOf(ds.wrong, ds.wrong)) else Brush.verticalGradient(listOf(ds.actionHi, ds.action))),
            contentAlignment = Alignment.Center,
        ) { Text("🎤", style = Type.title.toTextStyle(), modifier = Modifier.clearAndSetSemantics { }) }
    }
}

// ---------------------------------------------------------------- summary

@Composable
private fun StpSummary(
    session: SayPictureSession,
    save: SayPictureSave,
    canSave: Boolean,
    onSayItRight: (List<VocabItem>) -> Unit,
    onSave: () -> Unit,
    onRestart: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val missed = session.missedWords
    val savable = missed.any { SayThePicture.isSavable(it.term) }
    Column(Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s3), horizontalAlignment = Alignment.CenterHorizontally) {
        PracticeStars(session.stars, prominent = true)
        Text("Practised ${session.words.size} words", style = Type.title.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center)
        Text("${session.firstTry} of ${session.words.size} said first time. Every word you practise sticks a little more.", style = Type.body.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center)
        // The recap: every photo of the session. Said first time wears a gold ring, a missed one a retry mark.
        Column(Modifier.testTag("stp-recap").fillMaxWidth().clearAndSetSemantics { contentDescription = "Your pictures" }, verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            session.recap.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                    row.forEach { (w, result) ->
                        val first = result == SayPictureResult.FIRST
                        Column(
                            Modifier.weight(1f).testTag(if (first) "stp-recap-first" else "stp-recap-missed")
                                .clearAndSetSemantics { contentDescription = "${w.term}, ${if (first) "said first time" else "missed"}" },
                            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1), horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(ds.sunk).border(if (first) 3.dp else 1.5.dp, if (first) ds.action else ds.line, RoundedCornerShape(14.dp))) {
                                AsyncRemoteImage(url = w.image.url, contentDescription = null, modifier = Modifier.fillMaxSize())
                                if (!first) Text("↺", style = Type.caption.toTextStyle(), color = ds.brand, modifier = Modifier.align(Alignment.TopEnd).padding(3.dp).clip(CircleShape).background(ds.card).padding(horizontal = 5.dp))
                            }
                            Text(w.term, style = Type.caption.toTextStyle(), color = ds.ink, maxLines = 1)
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        if (missed.isNotEmpty()) {
            HubSecondaryButton("Say it right the ones you missed") { onSayItRight(missed.map { it.toVocabItem() }) }
            if (canSave && savable) {
                val saved = save is SayPictureSave.Saved
                HubSecondaryButton(
                    when { save is SayPictureSave.Saving -> "Adding..."; saved -> "Added to your review deck"; else -> "Add them to your review deck" },
                ) { if (save !is SayPictureSave.Saving && !saved) onSave() }
            }
            when (save) {
                is SayPictureSave.Saved -> Text(
                    "${save.count} ${if (save.count == 1) "word" else "words"} added to your review deck." + if (save.skipped > 0) " Phrases can't be saved, so those stayed out." else "",
                    style = Type.footnote.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                is SayPictureSave.Failed -> Text(save.message, style = Type.footnote.toTextStyle(), color = ds.wrongInk, textAlign = TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                else -> Unit
            }
        }
        HubButton("Practise more", onRestart)
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
