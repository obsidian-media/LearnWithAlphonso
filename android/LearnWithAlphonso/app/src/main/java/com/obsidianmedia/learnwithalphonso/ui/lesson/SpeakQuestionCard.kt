package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswer
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.audio.HoldToTalkButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.components.ExplanationBlock
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SpeakUiState(val heard: String? = null, val error: String? = null, val micUnavailable: Boolean = false)

/**
 * Port of SpeakQuestionCard.swift's capture path. A transcript becomes the
 * picked answer only when it normalises to something; silence is "didn't
 * catch that", never a wrong answer (Plan 3 Review Focus 2).
 */
class SpeakQuestionViewModel(
    recorder: RecorderPort,
    requestMic: suspend () -> Boolean,
    private val ai: AiConversationClient,
    private val course: Course,
    private val onPick: (String?) -> Unit,
) : ViewModel() {
    val engine = ConversationTurnEngine(recorder, requestMic, { audio, timing -> ai.transcribe(audio, "audio/m4a", course.code, timing) }, viewModelScope)
    private val _state = MutableStateFlow(SpeakUiState())
    val state: StateFlow<SpeakUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            engine.events.collect { event ->
                when (event) {
                    is TurnEvent.Transcribed -> {
                        val text = event.text.trim()
                        if (SpokenAnswer.normalise(text).isEmpty()) _state.update { it.copy(error = "Didn't catch that. Try again.") }
                        else { _state.update { it.copy(heard = text, error = null) }; onPick(text) }
                    }
                    TurnEvent.Empty -> _state.update { it.copy(error = "Didn't catch that. Try again, or type the phrase.") }
                    TurnEvent.MicDenied -> _state.update { it.copy(micUnavailable = true, error = "Microphone access is off. Turn it on in Settings > Apps > Learn with Alphonso > Permissions, or type the phrase.") }
                    is TurnEvent.Failed -> _state.update { it.copy(error = "Couldn't check that just now. Try again.") }
                }
            }
        }
    }

    fun pressBegan() { _state.update { it.copy(error = null) }; engine.pressBegan() }
    fun pressEnded() = engine.pressEnded()
    override fun onCleared() = engine.tearDown()
}

@Composable
fun SpeakQuestionCard(container: AppContainer, question: Question.Speak, course: Course, checked: Boolean, isCorrect: Boolean, picked: String?, onPick: (String?) -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    val isConnected by container.connectivity.isConnected.collectAsState()
    val vm: SpeakQuestionViewModel = viewModel(key = "speak-${question.id}") {
        SpeakQuestionViewModel(container.newRecorder(), { container.micPermission.request() }, container.aiClient, course, onPick)
    }
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    // Cancel, not tearDown: the view model outlives a rotation and the next press must still work.
    DisposableEffect(Unit) { onDispose { vm.engine.cancel() } }
    val canCapture = isConnected && !state.micUnavailable

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AlphonsoSectionHeader("Speaking")
        Text(question.prompt, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("YOUR PHRASE", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
            Text(question.answer, style = MaterialTheme.typography.titleLarge, color = palette.ink)
            AlphonsoSecondaryButton("🔊  Hear it first", onClick = { Speech.get(context).speak(question.answer, course) }, fullWidth = false)
        }
        if (canCapture) {
            val hint = when (phase) {
                TurnPhase.RECORDING, TurnPhase.REQUESTING_MIC -> "Listening. Let go when you're done"
                TurnPhase.TRANSCRIBING -> "Checking what you said..."
                TurnPhase.IDLE -> if (picked == null) "Hold and say the phrase" else "Hold to say it again"
            }
            HoldToTalkButton(
                phase = phase, busyLabel = if (phase == TurnPhase.TRANSCRIBING) "Checking what you said..." else null,
                tint = palette.moss, hint = hint, accessibilityLabel = "Hold to say the phrase", enabled = !checked,
                onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
            )
            state.heard?.let {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.surface).padding(10.dp)) {
                    Text("WE HEARD", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                    Text(it, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                }
            }
        } else {
            Text(
                if (state.micUnavailable) "The microphone isn't available. Type the phrase instead." else "You're offline, so speech can't be checked. Type the phrase instead.",
                style = MaterialTheme.typography.bodySmall, color = palette.inkSoft,
            )
            AnswerField(picked ?: "", onPick, "Type the phrase", enabled = !checked)
        }
        state.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive) }
        if (checked) ExplanationBlock(isCorrect, question.explanation)
    }
}
