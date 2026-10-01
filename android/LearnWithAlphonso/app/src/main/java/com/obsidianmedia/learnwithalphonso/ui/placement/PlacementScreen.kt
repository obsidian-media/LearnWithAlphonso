package com.obsidianmedia.learnwithalphonso.ui.placement

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.components.ChoiceButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.AnswerField
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun PlacementScreen(container: AppContainer, course: Course, onFinished: () -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    val vm: PlacementViewModel = viewModel(key = "placement-${course.code}") {
        PlacementViewModel(container.content, container.progressClient, container.translationGrading, course, isConnected = { container.connectivity.isConnected.value })
    }
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        if (!state.done) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onFinished) { Icon(Icons.Filled.Close, contentDescription = "Exit placement test", tint = palette.moss) }
            }
        }
        val q = state.currentQuestion
        when {
            state.done -> Results(state, onFinished, vm::restart)
            q == null -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("No placement questions are available for this course right now.", color = palette.inkSoft, textAlign = TextAlign.Center)
                AlphonsoPrimaryButton("Back to Learn", onClick = onFinished, modifier = Modifier.padding(top = 12.dp))
            }
            else -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AlphonsoProgressBar(if (state.total == 0) 0f else state.step.toFloat() / state.total)
                Text("${state.step + 1} of ${state.total}", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    AlphonsoSectionHeader("Placement test")
                    key(q.id) {
                        when (q) {
                            is PlacementQuestion.MultipleChoice -> {
                                Text(q.prompt, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                                q.choices.forEach { c -> ChoiceButton(c, selected = state.picked == c, checked = false, isCorrectChoice = false, onClick = { vm.pick(c) }) }
                            }
                            is PlacementQuestion.Listening -> {
                                Text("Listening", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                                AlphonsoSecondaryButton("🔊  Play audio", onClick = { Speech.get(context).speak(q.audioText, course) }, fullWidth = false)
                                Text(q.prompt, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                                q.choices.forEach { c -> ChoiceButton(c, selected = state.picked == c, checked = false, isCorrectChoice = false, onClick = { vm.pick(c) }) }
                            }
                            is PlacementQuestion.Translate -> {
                                Text(q.prompt, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                                AnswerField(state.picked ?: "", vm::pick, "Write your answer", enabled = true, multiline = true)
                            }
                        }
                    }
                }
                AlphonsoPrimaryButton(if (state.isFinalQuestion) "See my level" else "Continue", onClick = vm::submit, enabled = !state.picked.isNullOrBlank(), busy = state.checking)
                Text("No hearts lost. This just finds your starting point.", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun Results(state: PlacementUiState, onFinished: () -> Unit, onRetake: () -> Unit) {
    val palette = AlphonsoColor.palette
    val meta = LEVEL_META[state.level]
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically)) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(palette.moss), contentAlignment = Alignment.Center) { Text("⭐", fontSize = 30.sp) }
        AlphonsoSectionHeader("Your level")
        Text(state.level, style = MaterialTheme.typography.displayLarge, color = palette.ink)
        meta?.let {
            Text(it.first, style = MaterialTheme.typography.titleLarge, color = palette.ink)
            Text(it.second, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
        }
        Text("${state.correctTotal} of ${state.total} correct", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        if (state.skippedLevels.isNotEmpty()) {
            Text("Fast-tracked past ${state.skippedLevels.joinToString(", ")} after strong answers.", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, textAlign = TextAlign.Center)
        }
        AlphonsoPrimaryButton("Start learning at ${state.level}", onClick = onFinished)
        TextButton(onClick = onRetake) { Text("Retake the test", color = palette.inkSoft) }
    }
}
