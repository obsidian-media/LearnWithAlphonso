package com.obsidianmedia.learnwithalphonso.ui.memory

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemory
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryLoad
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileOverview
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.practice.HubButton
import com.obsidianmedia.learnwithalphonso.ui.practice.HubSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Space
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Type
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * What Alphonso remembers (approved mock: r15-recap, screens 2, 2b and 3). Every learner reads, fixes and deletes
 * every line (free since 2026-11-26); the locked page is only for a server that still answers not-entitled. The server
 * decides what is deleted (src/routes/api/tutor-memory.ts).
 */
class TutorMemoryViewModel(private val ai: AiConversationClient) : ViewModel() {
    data class State(val load: TutorMemoryLoad? = null, val busy: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch { _state.update { it.copy(load = ai.tutorMemory()) } }
    }

    private fun run(action: suspend () -> Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            action()
            _state.update { it.copy(load = ai.tutorMemory(), busy = false) }
        }
    }

    fun removeLine(id: String) = run { ai.removeMemoryLine(id) }
    fun removeGoal(key: String) = run { ai.saveGoalPatch(buildJsonObject { put("clear", buildJsonArray { add(kotlinx.serialization.json.JsonPrimitive(key)) }) }) }
    fun addGoal(patch: JsonObject) = run { ai.saveGoalPatch(patch) }
    fun forgetAll() = run { ai.forgetEverything() }
}

@Composable
fun TutorMemoryScreen(container: AppContainer, onBack: () -> Unit, onPaywall: () -> Unit) {
    val vm: TutorMemoryViewModel = viewModel { TutorMemoryViewModel(container.aiClient) }
    val state by vm.state.collectAsStateWithLifecycle()
    val course by container.activeCourse.course.collectAsState()
    val playback = remember { container.newPlayback() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var speaking by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { vm.load() }
    // The locked page is built only from the learner's own data: their weak spots and first-run answers.
    var lockedWeak by remember { mutableStateOf<List<String>>(emptyList()) }
    var lockedGoals by remember { mutableStateOf<String?>(null) }
    val locked = state.load == TutorMemoryLoad.Locked
    LaunchedEffect(locked, course) {
        if (!locked) return@LaunchedEffect
        lockedGoals = container.aiClient.goalsNote()
        val id = container.session.userId ?: return@LaunchedEffect
        lockedWeak = runCatching {
            com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath.weakSpots(container.progressClient.fetchProfileOverview(id, course.code).weakItems).first.take(2).map { it.display }
        }.getOrDefault(emptyList())
    }
    val speak: (String) -> Unit = { text ->
        scope.launch {
            speaking = text
            runCatching {
                val voice = container.voicePrefs.voice(VoiceCharacter.Alphonso, course.code)
                playback.play(container.aiClient.synthesizeSpeech(text, voice = voice, course = course.code))
            }
            speaking = null
        }
    }
    TutorMemoryContent(state, speaking, vm, speak, onBack, onPaywall, lockedWeak, lockedGoals)
}

@Composable
internal fun TutorMemoryContent(
    state: TutorMemoryViewModel.State, speaking: String?, vm: TutorMemoryViewModel,
    onSpeak: (String) -> Unit, onBack: () -> Unit, onPaywall: () -> Unit,
    lockedWeakSpots: List<String> = emptyList(), lockedGoalsNote: String? = null,
) {
    val ds = LocalAlphonsoTokens.current
    var confirming by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s3)) {
        Box(Modifier.heightIn(min = Space.minTouch).clickable(role = Role.Button, onClick = onBack), contentAlignment = Alignment.CenterStart) {
            Text("‹ Profile", style = Type.headline.toTextStyle(), color = ds.choice)
        }
        when (val load = state.load) {
            null -> Box(Modifier.fillMaxWidth().padding(Space.s12), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            TutorMemoryLoad.Failed -> Column(Modifier.fillMaxWidth().padding(Space.s8), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s3)) {
                Text("This did not load.", style = Type.headline.toTextStyle(), color = ds.ink)
                HubButton("Try again") { vm.load() }
            }
            TutorMemoryLoad.Locked -> LockedBody(lockedWeakSpots, lockedGoalsNote, onPaywall, onBack)
            is TutorMemoryLoad.Ready -> ReadyBody(load.memory, state.busy, speaking, vm, onSpeak, onForget = { confirming = true }, onAdd = { adding = true })
        }
    }
    val memory = (state.load as? TutorMemoryLoad.Ready)?.memory
    if (confirming && memory != null) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Forget everything?") },
            text = { Text("Alphonso will forget everything on this page. Phrases also leave your review. This cannot be undone.") },
            confirmButton = { TextButton(onClick = { confirming = false; vm.forgetAll() }) { Text("Forget everything", color = ds.wrongInk) } },
            dismissButton = { TextButton(onClick = { confirming = false }) { Text("Keep them") } },
        )
    }
    if (adding && memory != null) AddGoalDialog(memory, onDismiss = { adding = false }) { patch -> adding = false; vm.addGoal(patch) }
}

@Composable
private fun Hero(line: String) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val art by produceState<ImageBitmap?>(null) { value = withContext(Dispatchers.IO) { loadAsset(context, "lesson/happy.webp") } }
    Box(Modifier.fillMaxWidth().heightIn(min = Space.s12 * 3).clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).background(ds.hero)) {
        Column(Modifier.padding(Space.s4).padding(end = Space.s12 * 2), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text("What Alphonso remembers", style = Type.title.toTextStyle(), color = ds.onHero, modifier = Modifier.semantics { heading() })
            Text(line, style = Type.footnote.toTextStyle(), color = ds.onHeroSoft)
        }
        art?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.align(Alignment.BottomEnd).size(Space.s12 * 2.5f)) }
    }
}

@Composable
private fun MemoryRow(mark: String, tint: androidx.compose.ui.graphics.Color, ink: androidx.compose.ui.graphics.Color, title: String, note: String, trailing: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = Space.s12 + Space.s2).clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s3),
    ) {
        Box(Modifier.size(Space.s8).clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(tint), contentAlignment = Alignment.Center) {
            Text(mark, style = Type.headline.toTextStyle(), color = ink)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
            Text(title, style = Type.footnote.toTextStyle(), color = ds.ink)
            Text(note, style = Type.caption.toTextStyle(), color = ds.inkSoft)
        }
        trailing()
    }
}

@Composable
private fun RemoveButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.size(Space.minTouch).clickable(enabled = enabled, role = Role.Button, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Close, null, tint = ds.inkSoft)
    }
}

@Composable
private fun SectionHead(title: String, count: Int) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth().padding(top = Space.s2), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.semantics { heading() })
        Text("$count", style = Type.caption.toTextStyle(), color = ds.choice)
    }
}

@Composable
private fun ReadyBody(memory: TutorMemory, busy: Boolean, speaking: String?, vm: TutorMemoryViewModel, onSpeak: (String) -> Unit, onForget: () -> Unit, onAdd: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val lines = memory.goalLines
    Hero(if (memory.isEmpty) "Alphonso keeps short notes from your calls here." else "${memory.summary} Alphonso uses these notes to plan your next calls. Remove a line and it is gone.")
    if (memory.mistakes.isNotEmpty()) {
        SectionHead("Mistakes he keeps seeing", memory.mistakes.size)
        memory.mistakes.forEach { m -> MemoryRow("x", ds.wrongTint, ds.wrongInk, m.label, m.note()) { RemoveButton("Remove ${m.label}", !busy) { vm.removeLine(m.id) } } }
    }
    if (memory.phrases.isNotEmpty()) {
        SectionHead("Phrases you are learning", memory.phrases.size)
        memory.phrases.forEach { p ->
            MemoryRow("a", ds.actionTint, ds.actionText, p.text, p.meaning) {
                Row {
                    Box(
                        Modifier.size(Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(if (speaking == p.text) ds.choice else ds.choiceTint)
                            .clickable(role = Role.Button) { onSpeak(p.text) }.semantics { contentDescription = "Hear: ${p.text}" },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.AutoMirrored.Filled.VolumeUp, null, tint = if (speaking == p.text) ds.onChoice else ds.choice) }
                    RemoveButton("Remove ${p.text}", !busy) { vm.removeLine(p.id) }
                }
            }
        }
    }
    if (lines.isNotEmpty()) {
        SectionHead("Goals you told him", lines.size)
        lines.forEach { g -> MemoryRow("o", ds.choiceTint, ds.choice, g.title, g.note) { RemoveButton("Remove ${g.title}", !busy) { vm.removeGoal(g.key) } } }
    }
    if (memory.isEmpty) {
        Column(Modifier.fillMaxWidth().border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text("Nothing here yet.", style = Type.headline.toTextStyle(), color = ds.ink)
            Text("After a few calls, Alphonso will list the mistakes he keeps seeing and the phrases you are learning. Your goals from when you started show here too.", style = Type.footnote.toTextStyle(), color = ds.inkSoft)
        }
    }
    val addable = memory.goals.goal == null || memory.goals.dailyMinutes == null || memory.goals.interests.size < TutorMemory.INTEREST_CHOICES.size
    if (addable) {
        Row(Modifier.heightIn(min = Space.minTouch).clickable(role = Role.Button, onClick = onAdd), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Add, null, tint = ds.choice)
            Text(" Add a goal", style = Type.headline.toTextStyle(), color = ds.choice)
        }
    }
    if (!memory.isEmpty) {
        HubSecondaryButton("Forget everything") { if (!busy) onForget() }
        Text("Removes everything on this page from your account. Your lessons, stars, streak and XP stay.", style = Type.caption.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun LockedBody(weakSpots: List<String>, goalsNote: String?, onPaywall: () -> Unit, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Hero("Alphonso keeps notes between calls and you can read, fix and delete every line.")
    Text("He could remember", style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.padding(top = Space.s2).semantics { heading() })
    val lock: @Composable () -> Unit = { Icon(Icons.Filled.Lock, null, tint = ds.inkFaint, modifier = Modifier.padding(end = Space.s2)) }
    weakSpots.forEach { w -> MemoryRow("x", ds.wrongTint, ds.wrongInk, w, "From your weak spots", lock) }
    MemoryRow("a", ds.actionTint, ds.actionText, "Phrases from your calls", "Tap one to hear it again", lock)
    goalsNote?.let { MemoryRow("o", ds.choiceTint, ds.choice, "Goals you told him", it, lock) }
    HubButton("Try Alphonso Pro", onPaywall)
    Box(Modifier.fillMaxWidth().heightIn(min = Space.minTouch).clickable(role = Role.Button, onClick = onBack), contentAlignment = Alignment.Center) {
        Text("Not now", style = Type.headline.toTextStyle(), color = ds.choice)
    }
    Text("Your call recap stays free. You can download or delete your data any time in Settings.", style = Type.caption.toTextStyle(), color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun AddGoalDialog(memory: TutorMemory, onDismiss: () -> Unit, onAdd: (JsonObject) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a goal") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                if (memory.goals.goal == null) {
                    Text("Why you are learning", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    TutorMemory.GOAL_CHOICES.forEach { id -> TextButton(onClick = { onAdd(buildJsonObject { put("goal", id) }) }) { Text(TutorMemory.GOAL_LABELS[id] ?: id) } }
                }
                if (memory.goals.dailyMinutes == null) {
                    Text("Time each day", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    TutorMemory.DAILY_MINUTE_CHOICES.forEach { m -> TextButton(onClick = { onAdd(buildJsonObject { put("dailyMinutes", m) }) }) { Text("$m minutes a day") } }
                }
                val more = TutorMemory.INTEREST_CHOICES.filter { it !in memory.goals.interests }
                if (more.isNotEmpty()) {
                    Text("Topics you like", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    more.forEach { id ->
                        TextButton(onClick = { onAdd(buildJsonObject { put("interests", buildJsonArray { (memory.goals.interests + id).forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) } }) }) }) { Text(TutorMemory.INTEREST_LABELS[id] ?: id) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
