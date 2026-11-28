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
import androidx.compose.ui.semantics.contentDescription
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
    DisposableEffect(Unit) { onDispose { playback.stop(); Speech.get(context).stop() } }

    fun hear(text: String) {
        scope.launch {
            playback.stop()
            Speech.get(context).stop()
            playing = text
            val how = Phrasebook.speak(
                // Fetched once per phrase and voice: a replay plays the same bytes instead of asking /api/tts again.
                fetch = {
                    val voice = container.voicePrefs.voice(VoiceCharacter.Alphonso, course.code)
                    PhraseAudioCache.audio(text, voice, course.code) { container.aiClient.synthesizeSpeech(text, voice = voice, course = course.code) }
                },
                play = { playback.play(it) },
                device = { Speech.get(context).speak(text, course) },
            )
            onDeviceVoice = how == com.obsidianmedia.learnwithalphonso.core.rehearsal.PhraseVoice.DEVICE
            playing = null
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
            snapshot.entries.forEach { phrase ->
                val label = Phrasebook.hearLabel(phrase.text)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                        .border(2.dp, if (playing == phrase.text) ds.choice else ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                        .clickable(role = Role.Button, onClickLabel = label) { hear(phrase.text) }
                        .semantics(mergeDescendants = true) { contentDescription = label }
                        .padding(AlphonsoTokens.Space.s3),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                ) {
                    Box(Modifier.sizeIn(minWidth = AlphonsoTokens.Space.minTouch, minHeight = AlphonsoTokens.Space.minTouch), contentAlignment = Alignment.Center) {
                        Text(if (playing == phrase.text) "…" else "▶", style = TitleType, color = ds.actionText)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(phrase.text, style = HeadlineType, color = ds.ink)
                        phrase.meaning?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
                    }
                }
            }
            Text(Phrasebook.SAVED_NOTE, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
}
