package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.ai.AiDisclosureGate
import com.obsidianmedia.learnwithalphonso.ui.learn.LeagueTierPalette
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun LessonScreen(container: AppContainer, course: Course, lessonId: String, onExit: () -> Unit) {
    val palette = AlphonsoColor.palette
    val found = container.content.findLesson(lessonId, course)
    if (found == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Lesson not found", color = palette.ink) }
        return
    }
    val vm: LessonViewModel = viewModel(key = "lesson-$lessonId") {
        LessonViewModel(
            lesson = found.second, course = course, content = container.content, client = container.progressClient,
            translation = container.translationGrading, syncStore = container.syncStore,
            isConnected = { container.connectivity.isConnected.value },
            lastKnownTier = { container.tierCache.lastKnownTier },
            rememberTier = { container.tierCache.lastKnownTier = it },
        )
    }
    val state by vm.state.collectAsState()
    val finished = state.phase as? LessonPhase.Finished
    LaunchedEffect(finished?.result?.progress?.lastActiveDate, finished != null) {
        if (finished != null) {
            // The one priming moment for notification permission (LessonPlayerView.swift), then reschedule today's streak reminder.
            container.notificationPermission.requestIfUndetermined()
            container.reminders.onLessonFinished(finished.result.progress.lastActiveDate)
        }
    }

    AiDisclosureGate(container.prefs) {
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onExit) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
            Text(state.lesson.title, style = MaterialTheme.typography.titleMedium, color = palette.ink)
        }
        when (val phase = state.phase) {
            LessonPhase.Overview -> OverviewScreen(state.lesson, vm.vocab, state.total, onStart = vm::begin)
            LessonPhase.Vocab -> VocabScreen(state.lesson, vm.vocab, course, onStart = vm::startPractice)
            LessonPhase.Quiz -> QuizBody(vm, state, course, container)
            is LessonPhase.Finished -> FinishScreen(phase, state.correctCount, state.total, container, state.lesson.id, course, onNext = if (vm.nextLessonId != null) vm::continueToNextLesson else null)
            is LessonPhase.QueuedOffline -> OfflineFinishScreen(phase.pending.optimisticXpEstimate, state.correctCount, state.total)
            is LessonPhase.Error -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text(phase.message, color = palette.ink, textAlign = TextAlign.Center) }
        }
    }
    }
}

@Composable
private fun QuizBody(vm: LessonViewModel, state: LessonUiState, course: Course, container: AppContainer) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AlphonsoProgressBar(if (state.total == 0) 0f else state.idx.toFloat() / state.total)
        Text(if (state.isReinforcing) "Quick practice" else "${state.idx + 1}/${state.total}", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            key(state.isReinforcing, state.currentQuestion.id) {
                QuestionCard(
                    container = container, question = state.currentQuestion, course = course, vocabImages = container.content.vocabImages,
                    checked = state.checked, isCorrect = if (state.checked) vm.isCurrentCorrect() else false,
                    picked = state.picked, onPick = vm::pick, translationVerdict = state.translationVerdict,
                )
            }
        }
        when {
            state.isSubmitting -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
            state.isChecking -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Text("Checking...", color = palette.inkSoft) }
            !state.checked -> AlphonsoPrimaryButton("Check", onClick = vm::check, enabled = !state.picked.isNullOrBlank())
            else -> AlphonsoPrimaryButton(state.continueLabel, onClick = vm::continueOrFinish)
        }
    }
}

@Composable
private fun OverviewScreen(lesson: Lesson, vocab: List<VocabItem>, questionCount: Int, onStart: () -> Unit) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AlphonsoSectionHeader(lesson.subtitle)
        Text(lesson.title, style = MaterialTheme.typography.headlineLarge, color = palette.ink)
        OverviewStep(1, "Vocabulary", "${vocab.size} word${if (vocab.size == 1) "" else "s"} with examples")
        val previews = vocab.mapNotNull { it.image }.take(3)
        if (previews.isNotEmpty()) {
            Row(Modifier.padding(start = 40.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                previews.forEach { img -> Box(Modifier.size(44.dp).clip(RoundedCornerShape(AlphonsoRadius.md)).background(palette.parchment)) { AsyncRemoteImage(img.url, img.alt, Modifier.size(44.dp)) } }
            }
        }
        OverviewStep(2, "Practice", "$questionCount questions")
        OverviewStep(3, "Review", "Anything you miss comes back later")
        AlphonsoPrimaryButton("Begin lesson", onClick = onStart, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun OverviewStep(number: Int, label: String, detail: String) {
    val palette = AlphonsoColor.palette
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(palette.moss), contentAlignment = Alignment.Center) { Text("$number", color = palette.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
        Column {
            Text(label, style = MaterialTheme.typography.titleSmall, color = palette.ink)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        }
    }
}

@Composable
private fun VocabScreen(lesson: Lesson, items: List<VocabItem>, course: Course, onStart: () -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AlphonsoSectionHeader("Vocabulary · ${lesson.subtitle}")
        Text(lesson.title, style = MaterialTheme.typography.headlineMedium, color = palette.ink)
        Text("${items.size} word${if (items.size == 1) "" else "s"} to learn before you practise.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items.forEach { item ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    item.image?.let { VocabImage(it) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(item.term, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                        TextButton(onClick = { Speech.get(context).speak(item.term, course) }) { Text("🔊", color = palette.inkSoft) }
                    }
                    Text(item.meaning, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    Text(item.example, style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic), color = palette.inkSoft)
                }
            }
        }
        AlphonsoPrimaryButton("Start practice", onClick = onStart)
    }
}

@Composable
private fun FinishScreen(phase: LessonPhase.Finished, correct: Int, total: Int, container: AppContainer, lessonId: String, course: Course, onNext: (() -> Unit)?) {
    val palette = AlphonsoColor.palette
    val result = phase.result
    val unlocked = result.newlyUnlocked.mapNotNull { id -> container.content.achievements.firstOrNull { it.id == id } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (phase.isLeaguePromotion) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.xl)).background(LeagueTierPalette.color(result.progress.leagueTier).copy(alpha = 0.15f)).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("League up!", style = MaterialTheme.typography.headlineMedium, color = palette.ink)
                Text("You've been promoted to ${result.progress.leagueTier.replaceFirstChar { it.uppercase() }}!", color = palette.ink)
            }
        }
        Text("Lesson complete", style = MaterialTheme.typography.headlineSmall, color = palette.ink)
        AlphonsoMascotBanner("Nice work!")
        Text("+${result.xpGain} XP", style = MaterialTheme.typography.displayMedium, color = palette.moss)
        Text("$correct/$total correct", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        result.heartsBonus?.let {
            Text(if (it == "streak") "Streak milestone: hearts fully refilled" else "Perfect lesson: +1 heart", style = MaterialTheme.typography.labelLarge, color = palette.ember)
        }
        if (unlocked.isNotEmpty()) {
            Text("Achievement${if (unlocked.size == 1) "" else "s"} unlocked", style = MaterialTheme.typography.labelLarge, color = palette.inkSoft)
            unlocked.forEach { a ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.xl)).background(palette.parchment).padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(a.title, style = MaterialTheme.typography.titleSmall, color = palette.ink)
                    Text(a.description, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center)
                }
            }
        }
        if (onNext != null) AlphonsoPrimaryButton("Continue to next lesson", onClick = onNext)
        GeneratedPracticeSection(container, lessonId, course)
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun OfflineFinishScreen(estimate: Int, correct: Int, total: Int) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
        Text("☁️", fontSize = 48.sp)
        Text("Saved. This will sync when you're back online", style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
        Text("~+$estimate XP (estimated)", style = MaterialTheme.typography.headlineMedium, color = palette.ember)
        Text("$correct/$total correct", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
    }
}
