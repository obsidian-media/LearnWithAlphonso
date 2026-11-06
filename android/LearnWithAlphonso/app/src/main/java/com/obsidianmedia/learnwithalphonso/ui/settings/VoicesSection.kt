package com.obsidianmedia.learnwithalphonso.ui.settings

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCatalog
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceGender
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceOption
import com.obsidianmedia.learnwithalphonso.core.voice.VoicePrefs
import com.obsidianmedia.learnwithalphonso.ui.friends.CoursePickerRow
import com.obsidianmedia.learnwithalphonso.ui.learn.displayName
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.launch

/**
 * Settings > Voices (port of VoiceSettingsView.swift): per course, which voice Alphonso and Hector speak with. Free
 * for everyone (Hector's choice applies with Pro). Saved on the account and cached on the device
 * ([AppContainer.voicePrefs]); the list is the core VoiceCatalog, a mirror of src/lib/voice-catalog.ts.
 */
@Composable
internal fun VoicesSection(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val activeCourse by container.activeCourse.course.collectAsState()
    var course by remember { mutableStateOf(activeCourse) }
    var prefs by remember { mutableStateOf(container.voicePrefs.load()) }
    var picking by remember { mutableStateOf<VoiceCharacter?>(null) }
    LaunchedEffect(Unit) { prefs = runCatching { container.voicePrefs.hydrate() }.getOrDefault(prefs) }

    Section("Voices", footer = "Choose how Alphonso and Hector sound in each course. Your choice is saved to your account.") {
        Column(Modifier.padding(vertical = 8.dp)) { CoursePickerRow(course) { course = it } }
        VoiceCharacter.entries.forEach { character ->
            val name = VoiceCatalog.find(prefs.voice(character, course.code))?.name.orEmpty()
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClickLabel = "Change") { picking = character }
                    .semantics(mergeDescendants = true) { contentDescription = "${character.settingsLabel} in ${course.displayName}: $name" }
                    .padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(character.settingsLabel, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = palette.ink, modifier = Modifier.weight(1f))
                Text("$name  ›", style = MaterialTheme.typography.bodyLarge, color = palette.inkSoft)
            }
        }
    }

    picking?.let { character ->
        VoicePickerDialog(container, character, course, prefs, onPrefs = { prefs = it }, onDismiss = { picking = null })
    }
}

/**
 * One character's voices for one course, grouped Male / Female. ▶ streams the voice's static clip from the web app
 * (learn.alphonsoecosystem.app/voices/<id>.mp3): not bundled, so the app does not carry ~2 MB of clips, and never a
 * TTS call.
 */
@Composable
private fun VoicePickerDialog(
    container: AppContainer,
    character: VoiceCharacter,
    course: Course,
    prefs: VoicePrefs,
    onPrefs: (VoicePrefs) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    val scope = rememberCoroutineScope()
    var playingId by remember { mutableStateOf<String?>(null) }
    var savingId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val player = remember { mutableStateOf<MediaPlayer?>(null) }
    fun stop() {
        player.value?.let { runCatching { it.release() } }
        player.value = null
        playingId = null
    }
    DisposableEffect(Unit) { onDispose { stop() } }
    fun preview(id: String) {
        if (playingId == id) { stop(); return }
        stop()
        val mp = MediaPlayer()
        player.value = mp
        playingId = id
        mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        mp.setOnPreparedListener { it.start() }
        mp.setOnCompletionListener { if (player.value === mp) stop() }
        mp.setOnErrorListener { _, _, _ -> if (player.value === mp) stop(); true }
        runCatching {
            mp.setDataSource(VoiceCatalog.previewUrl(id, BuildConfig.API_BASE_URL))
            mp.prepareAsync()
        }.onFailure { stop() }
    }

    val selected = prefs.voice(character, course.code)
    val defaultId = VoiceCatalog.defaultVoice(character, course.code)
    val title = "${character.settingsLabel} · ${course.displayName}"

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(palette.surface)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onDismiss) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
                Text(title, style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.semantics { heading() })
            }
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, modifier = Modifier.padding(horizontal = 16.dp)) }
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                VoiceGender.entries.forEach { gender ->
                    val group = VoiceCatalog.voicesFor(course.code).filter { it.gender == gender }
                    if (group.isEmpty()) return@forEach
                    item(key = gender.name) {
                        Text(
                            gender.groupLabel.uppercase(),
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = palette.ember,
                            modifier = Modifier.padding(top = 12.dp).semantics { heading() },
                        )
                    }
                    items(group, key = { it.id }) { voice ->
                        VoiceRow(
                            voice = voice,
                            isSelected = voice.id == selected,
                            isDefault = voice.id == defaultId,
                            isPlaying = playingId == voice.id,
                            isSaving = savingId == voice.id,
                            enabled = savingId == null,
                            onPreview = { preview(voice.id) },
                            onChoose = {
                                if (voice.id != selected) {
                                    error = null
                                    savingId = voice.id
                                    scope.launch {
                                        runCatching { container.voicePrefs.choose(character, course.code, voice.id) }
                                            .onSuccess(onPrefs)
                                            .onFailure { error = "Couldn't save your voice. Check your connection and try again." }
                                        savingId = null
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VoiceRow(
    voice: VoiceOption,
    isSelected: Boolean,
    isDefault: Boolean,
    isPlaying: Boolean,
    isSaving: Boolean,
    enabled: Boolean,
    onPreview: () -> Unit,
    onChoose: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(palette.parchment).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onPreview, modifier = Modifier.semantics { contentDescription = if (isPlaying) "Stop ${voice.name} preview" else "Play ${voice.name} preview" }) {
            Text(if (isPlaying) "■" else "▶", color = palette.moss, style = MaterialTheme.typography.titleMedium)
        }
        Row(
            Modifier
                .weight(1f)
                .selectable(selected = isSelected, enabled = enabled, role = Role.RadioButton, onClick = onChoose)
                .semantics(mergeDescendants = true) {
                    contentDescription = "${voice.name}${if (isDefault) ", default" else ""}, ${voice.accent}, ${voice.descriptor}"
                }
                .padding(vertical = 10.dp, horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(voice.name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.ink)
                    if (isDefault) {
                        Text(
                            "Default",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.inkSoft,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(palette.surface).padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
                Text("${voice.accent} · ${voice.descriptor}", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
            }
            when {
                isSaving -> Text("…", color = palette.moss)
                isSelected -> Text("✓", color = palette.moss, fontWeight = FontWeight.Bold)
            }
        }
    }
}
