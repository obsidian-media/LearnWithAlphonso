package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import android.content.SharedPreferences
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.foundation.focusable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Phrasebook
import com.obsidianmedia.learnwithalphonso.core.rehearsal.PhrasebookSnapshot
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.PhraseCheck
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.rehearsal.PhraseSayIt
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** The phrases of the last loaded brief, kept on the phone (text only) so the page opens with no connection. One per course. */
class PhrasebookStore(private val prefs: SharedPreferences) {
    private fun key(course: String) = "rehearsal.phrasebook.$course"

    fun save(course: String, snapshot: PhrasebookSnapshot) {
        runCatching { prefs.edit().putString(key(course), snapshot.encode()).apply() }
    }

    fun load(course: String): PhrasebookSnapshot? = runCatching { PhrasebookSnapshot.decode(prefs.getString(key(course), null)) }.getOrNull()

    /** The rehearsal was deleted or closed: its phrases go too. */
    fun clear(course: String) {
        runCatching { prefs.edit().remove(key(course)).apply() }
    }
}

/** The plan's row card above "Next:": a book, "Your phrases", "8 phrases · tap to hear", a chevron. [focus] lets the plan put TalkBack back here on return. */
@Composable
fun PhrasebookEntryCard(count: Int, focus: FocusRequester, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
            .border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
            .focusRequester(focus).focusable()
            .clickable(role = Role.Button, onClickLabel = "Open ${Phrasebook.LINK_TITLE}", onClick = onClick)
            .semantics(mergeDescendants = true) {}
            .padding(AlphonsoTokens.Space.s3),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Text("📖", style = TitleType, modifier = Modifier.clearAndSetSemantics {})
        Column(Modifier.weight(1f)) {
            Text(Phrasebook.LINK_TITLE, style = HeadlineType, color = ds.ink)
            Text(Phrasebook.linkSubtitle(count), style = CaptionType, color = ds.inkSoft)
        }
        Text("›", style = TitleType, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics {})
    }
}

/** The spoken phrases already fetched this process (a brief has 6 to 10; room for two). */
internal object PhraseAudioCache {
    private val cache = com.obsidianmedia.learnwithalphonso.ui.practice.OpenerSpeechCache(capacity = 20)
    suspend fun audio(text: String, voice: String?, course: String, synthesize: suspend () -> ByteArray): ByteArray = cache.audio(text, voice, course, synthesize)
}

/**
 * "Your phrases for this event": the brief's key phrases, each with its meaning line when it has one. Tap a row to hear it
 * through the app's voice (/api/tts); with no connection, or when that fails, the phone's own voice in the course language.
 *
 * "Say it" (every row's mic): tap to record, tap again to send. The clip goes to the existing /api/stt with the course (so
 * it counts against the same speaking quota and shows the same messages) and [PhraseCheck] says how clearly it came across,
 * inline under the row. Neutral wording, no score, no replay. Nothing is stored: the results live only while this page is open.
 */
@Composable
fun RehearsalPhrasebookScreen(container: AppContainer, snapshot: PhrasebookSnapshot, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val course: Course by container.activeCourse.course.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val playback = remember { container.newPlayback() }
    var playing by remember { mutableStateOf<String?>(null) }
    var onDeviceVoice by remember { mutableStateOf(false) }
    val titleFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { titleFocus.requestFocus() } }
    // Start the phone's voice now, so it is ready if the app's voice fails on a first tap.
    LaunchedEffect(Unit) { Speech.get(context) }
    var hearing by remember { mutableStateOf<Job?>(null) }

    // Say it: one recording at a time. busyRow is the row recording or being checked; the others wait.
    var busyRow by remember { mutableStateOf<Int?>(null) }
    val results = remember { mutableStateMapOf<Int, PhraseCheck.Outcome>() }
    var errorRow by remember { mutableStateOf<Int?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var showConsent by remember { mutableStateOf(false) }
    var consentRow by remember { mutableStateOf<Int?>(null) }
    var tapAgainRow by remember { mutableStateOf<Int?>(null) }
    val isConnected by container.connectivity.isConnected.collectAsState()
    val consent by container.aiConsent.state.collectAsState()
    val consentStatus = container.aiConsent.statusOf(consent)
    val engine = remember {
        ConversationTurnEngine(
            container.newRecorder(), { container.micPermission.request() },
            { audio, timing -> PhraseSayIt.transcribe { container.aiClient.transcribe(audio, "audio/m4a", course.code, timing) } },
            scope,
        )
    }
    val phase by engine.phase.collectAsState()
    DisposableEffect(Unit) { onDispose { hearing?.cancel(); playback.stop(); Speech.stopIfStarted(); engine.tearDown() } }
    LaunchedEffect(engine) {
        engine.events.collect { event ->
            val row = busyRow ?: return@collect
            busyRow = null
            when (event) {
                is TurnEvent.Transcribed -> results[row] = PhraseCheck.check(snapshot.entries[row].text, event.text, event.words)
                // Silence is a result, not an error.
                TurnEvent.Empty, TurnEvent.TooShort -> results[row] = PhraseCheck.Outcome(PhraseCheck.Result.NOT_YET, emptyList())
                TurnEvent.MicDenied -> { errorRow = row; error = PhraseSayIt.MIC_OFF }
                is TurnEvent.Failed -> if (event.consentRequired) showConsent = true else { errorRow = row; error = event.message.ifBlank { PhraseSayIt.CHECK_FAILED } }
            }
        }
    }

    fun stopHearing() {
        hearing?.cancel()
        hearing = null
        playback.stop()
        Speech.stopIfStarted()
        playing = null
    }

    fun hear(text: String) {
        if (busyRow != null) return
        // A new tap replaces the one before it.
        hearing?.cancel()
        hearing = scope.launch {
            playback.stop()
            Speech.get(context).stop()
            playing = text
            val how = Phrasebook.speak(
                // Fetched once per phrase and voice: a replay plays the same bytes instead of asking /api/tts again.
                fetch = {
                    val voice = container.voicePrefs.voice(VoiceCharacter.Alphonso, course.code)
                    PhraseAudioCache.audio(text, voice, course.code) { Phrasebook.requireAudio(container.aiClient.synthesizeSpeech(text, voice = voice, course = course.code)) }
                },
                play = { playback.play(it) },
                device = { Speech.get(context).speak(text, course) },
            )
            onDeviceVoice = how == com.obsidianmedia.learnwithalphonso.core.rehearsal.PhraseVoice.DEVICE
            if (playing == text) playing = null
        }
    }

    fun toggleSay(i: Int) {
        when {
            busyRow == null && phase == TurnPhase.IDLE -> {
                results.remove(i)
                error = null
                errorRow = null
                tapAgainRow = null
                // No clip is recorded or uploaded without a connection and the learner's AI consent.
                if (!isConnected) { errorRow = i; error = PhraseSayIt.OFFLINE; return }
                when (consentStatus) {
                    AiConsentStatus.GRANTED -> Unit
                    AiConsentStatus.LOADING -> { errorRow = i; error = AiConsentCopy.checkingSetting; return }
                    AiConsentStatus.UNAVAILABLE -> {
                        errorRow = i; error = AiConsentCopy.checkFailedTitle
                        scope.launch { container.aiConsent.refresh() }
                        return
                    }
                    AiConsentStatus.DENIED -> { consentRow = i; showConsent = true; return }
                }
                // Never record the phrase being played: any Hear audio stops first.
                stopHearing()
                busyRow = i
                engine.pressBegan()
            }
            busyRow == i && phase == TurnPhase.RECORDING -> engine.pressEnded()
        }
    }

    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState())) {
        DsBackBar("Plan", onBack)
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            // TalkBack starts on the title when the page opens.
            Text(Phrasebook.title(snapshot.kind), style = HeadlineType, color = ds.ink, modifier = Modifier.focusRequester(titleFocus).focusable().semantics { heading() })
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Text(Phrasebook.count(snapshot.entries.size), style = FootnoteType, color = ds.inkSoft)
                DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
            }
            Text(if (onDeviceVoice) Phrasebook.HEAR_HINT else Phrasebook.HEAR_ALPHONSO_HINT, style = FootnoteType, color = ds.inkSoft)
            Text(PhraseSayIt.FRAMING, style = FootnoteType, color = ds.inkSoft)
            snapshot.entries.forEachIndexed { i, phrase ->
                val label = Phrasebook.hearLabel(phrase.text)
                val busy = busyRow != null
                val recording = busyRow == i && phase == TurnPhase.RECORDING
                val status = when {
                    busyRow == i && phase == TurnPhase.RECORDING -> PhraseSayIt.LISTENING
                    busyRow == i -> PhraseSayIt.CHECKING
                    results[i] != null -> PhraseSayIt.resultText(results[i]!!)
                    tapAgainRow == i -> PhraseSayIt.TAP_AGAIN
                    else -> ""
                }
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                        .border(2.dp, if (playing == phrase.text || busyRow == i) ds.choice else ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                        .padding(AlphonsoTokens.Space.s3),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        Row(
                            Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).alpha(if (busy) 0.5f else 1f)
                                // The Hear buttons are off while a row records or is checked: a phrase is never played into the mic.
                                .clickable(enabled = !busy, role = Role.Button, onClickLabel = label) { hear(phrase.text) }
                                // Read as the phrase and its meaning; the click label says what a tap does.
                                .semantics(mergeDescendants = true) {},
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                        ) {
                            Box(Modifier.sizeIn(minWidth = AlphonsoTokens.Space.minTouch, minHeight = AlphonsoTokens.Space.minTouch), contentAlignment = Alignment.Center) {
                                Text(if (playing == phrase.text) "…" else "▶", style = TitleType, color = ds.actionText, modifier = Modifier.clearAndSetSemantics {})
                            }
                            Column(Modifier.weight(1f)) {
                                Text(phrase.text, style = HeadlineType, color = ds.ink)
                                phrase.meaning?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
                            }
                        }
                        val micEnabled = busyRow == null || busyRow == i
                        Box(
                            Modifier.size(AlphonsoTokens.Space.minTouch).alpha(if (micEnabled) 1f else 0.5f).clip(CircleShape)
                                .background(if (recording) ds.brand else ds.sunk)
                                .border(1.dp, ds.line, CircleShape)
                                .semantics { contentDescription = PhraseSayIt.micLabel(phrase.text) }
                                .toggleable(value = recording, enabled = micEnabled, role = Role.Button) { toggleSay(i) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(if (recording) "■" else "🎙", style = TitleType, color = if (recording) ds.card else ds.ink, modifier = Modifier.clearAndSetSemantics {})
                        }
                    }
                    // A polite live region: "Listening…", "Checking…" and the result are announced as they change.
                    Text(status, style = CaptionType, color = ds.inkSoft, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    if (error != null && errorRow == i) {
                        Text(error!!, style = CaptionType, color = ds.inkSoft, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                }
            }
            Text(Phrasebook.SAVED_NOTE, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
    if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false; tapAgainRow = consentRow })
}
