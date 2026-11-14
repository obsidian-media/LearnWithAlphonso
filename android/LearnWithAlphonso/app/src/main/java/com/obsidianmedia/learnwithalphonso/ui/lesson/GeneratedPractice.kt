package com.obsidianmedia.learnwithalphonso.ui.lesson

import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.GeneratedPracticeQuestion
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.ChoiceButton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class PracticeStatus { IDLE, LOADING, READY, EMPTY, ERROR, TIMEOUT }

data class GeneratedPracticeState(
    val status: PracticeStatus = PracticeStatus.IDLE,
    val questions: List<GeneratedPracticeQuestion> = emptyList(),
    val idx: Int = 0,
    val picked: String? = null,
    val checked: Boolean = false,
) {
    val current: GeneratedPracticeQuestion? get() = questions.getOrNull(idx)
    val done: Boolean get() = status == PracticeStatus.READY && idx >= questions.size
}

/** Port of GeneratedPracticeSection in LessonPlayerView.swift. */
class GeneratedPracticeViewModel(private val client: AiConversationClient, private val lessonId: String, private val course: Course) : ViewModel() {
    private val _state = MutableStateFlow(GeneratedPracticeState())
    val state: StateFlow<GeneratedPracticeState> = _state.asStateFlow()

    fun generate() {
        _state.update { it.copy(status = PracticeStatus.LOADING) }
        viewModelScope.launch {
            val result = runCatching { client.generatePractice(lessonId, course.code) }
            _state.value = result.fold(
                onSuccess = { qs -> if (qs.isEmpty()) GeneratedPracticeState(status = PracticeStatus.EMPTY) else GeneratedPracticeState(status = PracticeStatus.READY, questions = qs) },
                onFailure = { e -> GeneratedPracticeState(status = if (e is AiConversationError.Timeout) PracticeStatus.TIMEOUT else PracticeStatus.ERROR) },
            )
        }
    }

    fun pick(choice: String) = _state.update { if (it.checked) it else it.copy(picked = choice) }
    fun check() = _state.update { if (it.picked == null) it else it.copy(checked = true) }
    fun next() = _state.update { it.copy(idx = it.idx + 1, picked = null, checked = false) }
}

@Composable
fun GeneratedPracticeSection(container: AppContainer, lessonId: String, course: Course) {
    val ds = LocalAlphonsoTokens.current
    val vm: GeneratedPracticeViewModel = viewModel(key = "practice-$lessonId") { GeneratedPracticeViewModel(container.aiClient, lessonId, course) }
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (state.status) {
            PracticeStatus.IDLE, PracticeStatus.LOADING, PracticeStatus.EMPTY, PracticeStatus.ERROR, PracticeStatus.TIMEOUT -> {
                AlphonsoSecondaryButton("Generate more practice", onClick = vm::generate, busy = state.status == PracticeStatus.LOADING)
                val note = when (state.status) {
                    PracticeStatus.LOADING -> "This can take up to 30 seconds."
                    PracticeStatus.EMPTY -> "Couldn't generate practice for this lesson right now."
                    PracticeStatus.ERROR -> "Something went wrong. Try again."
                    PracticeStatus.TIMEOUT -> "That took too long. Try again in a moment."
                    else -> null
                }
                note?.let { Text(it, style = FootnoteType, color = ds.inkSoft) }
            }
            PracticeStatus.READY -> {
                val q = state.current
                if (q == null) {
                    Text("Nice work. That's all the extra practice for this lesson.", style = BodyType, color = ds.inkSoft)
                } else {
                    Text("Extra practice · ${state.idx + 1}/${state.questions.size}", style = CaptionType, color = ds.inkSoft)
                    Text(q.prompt, style = HeadlineType, color = ds.ink)
                    val correct = q.choices.getOrNull(q.answerIndex)
                    q.choices.forEachIndexed { i, c -> LessonAnswerButton(i, c, LessonAnswerState.of(state.checked, state.picked == c, c == correct), onClick = { vm.pick(c) }, enabled = !state.checked) }
                    if (state.checked) Explanation(container, state.picked == correct, q.explanation, course)
                    AlphonsoPrimaryButton(
                        if (!state.checked) "Check" else if (state.idx < state.questions.size - 1) "Next" else "Finish practice",
                        onClick = { if (!state.checked) vm.check() else vm.next() },
                        enabled = state.checked || state.picked != null,
                    )
                }
            }
        }
    }
}
