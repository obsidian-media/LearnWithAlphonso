package com.obsidianmedia.learnwithalphonso.ui.review

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.ui.ai.AiDisclosureGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.QuestionCard
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun ReviewScreen(container: AppContainer, course: Course, onExit: () -> Unit) {
    val palette = AlphonsoColor.palette
    val vm: ReviewViewModel = viewModel(key = "review-${course.code}") {
        ReviewViewModel(container.content, container.progressClient, container.syncStore, { container.connectivity.isConnected.value }, course, onQueueFetched = container.reminders::onQueueLoaded)
    }
    val state by vm.state.collectAsState()

    AiDisclosureGate(container.prefs) {
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onExit) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
            Text("Review · ${course.code.uppercase()}", style = MaterialTheme.typography.titleMedium, color = palette.ink)
        }
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            state.errorMessage != null -> Centered("Couldn't load your review queue", state.errorMessage!!)
            state.queue.isEmpty() -> Centered("All caught up", state.clearedBonusMessage ?: "Nothing due for review right now.")
            state.isDone -> Centered("Queue cleared", state.clearedBonusMessage ?: "Nice work. Check back tomorrow for more.")
            else -> {
                val item = state.currentItem!!
                val question = vm.questionFor(item)
                if (question == null) {
                    LaunchedEffect(item.itemKey) { vm.skipUnresolvable() }
                    return@Column
                }
                if (state.showingCachedSince != null || state.cachedWithoutTimestamp) {
                    val label = state.showingCachedSince?.let { "Offline. Last synced ${DateUtils.getRelativeTimeSpanString(it)}" } ?: "Offline. Showing your last synced queue"
                    Text(label, modifier = Modifier.fillMaxWidth().background(palette.emberSoft).padding(6.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                }
                Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("${state.idx + 1}/${state.queue.size} due", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    item.weaknessDisplay?.let { Text("Weak spot: $it", style = MaterialTheme.typography.labelLarge, color = palette.ember) }
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                        key(item.itemKey) {
                            QuestionCard(
                                container = container, question = question, course = course, vocabImages = container.content.vocabImages,
                                checked = state.checked, isCorrect = if (state.checked) vm.isCurrentCorrect() else false,
                                picked = state.picked, onPick = vm::pick, translationVerdict = state.translationVerdict,
                            )
                        }
                    }
                    when {
                        state.isSubmitting -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
                        state.isChecking -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Text("Checking...", color = palette.inkSoft) }
                        !state.checked -> AlphonsoPrimaryButton("Check", onClick = vm::check, enabled = !state.picked.isNullOrBlank())
                        else -> AlphonsoPrimaryButton("Next", onClick = vm::next)
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun Centered(title: String, body: String) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
    }
}
