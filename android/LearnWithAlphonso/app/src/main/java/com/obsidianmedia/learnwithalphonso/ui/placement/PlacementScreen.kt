package com.obsidianmedia.learnwithalphonso.ui.placement

import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.ui.layout.ContentScale
import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.AlphonsoBubble
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonAnswerButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.logic.BandMarker
import com.obsidianmedia.learnwithalphonso.core.logic.BandMarkerState
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.components.ChoiceButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.AnswerField
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech

@Composable
fun PlacementScreen(container: AppContainer, course: Course, onFinished: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val vm: PlacementViewModel = viewModel(key = "placement-${course.code}") {
        PlacementViewModel(container.content, container.progressClient, container.translationGrading, course, isConnected = { container.connectivity.isConnected.value }, hasAiConsent = { container.aiConsent.isGranted })
    }
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize().background(ds.surface)) {
        if (!state.done) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onFinished) { Icon(Icons.Filled.Close, contentDescription = "Exit placement test", tint = ds.choice) }
            }
        }
        val q = state.currentQuestion
        when {
            state.done -> Results(state, onFinished, vm::restart, vm::retrySave)
            q == null -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                DsEmptyState("No placement questions are available for this course right now.", null, artAsset = "poses/alphonso-thinking-temple.webp")
                AlphonsoPrimaryButton("Back to Learn", onClick = onFinished, modifier = Modifier.padding(top = 12.dp))
            }
            else -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AlphonsoProgressBar(if (state.maxQuestions == 0) 0f else state.step.toFloat() / state.maxQuestions)
                Text(
                    state.progressLabel,
                    style = CaptionType,
                    color = ds.inkSoft,
                    modifier = Modifier.clearAndSetSemantics { contentDescription = state.progressSpokenLabel },
                )
                LevelMarkers(state.markers)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    AlphonsoSectionHeader("Placement test")
                    key(q.id) {
                        when (q) {
                            is PlacementQuestion.MultipleChoice -> {
                                AlphonsoBubble("Alphonso asks", q.prompt, onPlay = null)
                                q.choices.forEachIndexed { i, c -> LessonAnswerButton(i, c, if (state.picked == c) LessonAnswerState.SELECTED else LessonAnswerState.IDLE, onClick = { vm.pick(c) }, enabled = true) }
                            }
                            is PlacementQuestion.Listening -> {
                                Text("Listening", style = CaptionType, color = ds.inkSoft)
                                AlphonsoSecondaryButton("🔊  Play audio", onClick = { Speech.get(context).speak(q.audioText, course) }, fullWidth = false)
                                AlphonsoBubble("Alphonso asks", q.prompt, onPlay = null)
                                q.choices.forEachIndexed { i, c -> LessonAnswerButton(i, c, if (state.picked == c) LessonAnswerState.SELECTED else LessonAnswerState.IDLE, onClick = { vm.pick(c) }, enabled = true) }
                            }
                            is PlacementQuestion.Translate -> {
                                AlphonsoBubble("Write it yourself", q.prompt, onPlay = null)
                                AnswerField(state.picked ?: "", vm::pick, "Write your answer", enabled = true, multiline = true)
                            }
                        }
                    }
                }
                AlphonsoPrimaryButton(if (state.isFinalQuestion) "See my level" else "Continue", onClick = vm::submit, enabled = !state.picked.isNullOrBlank(), busy = state.checking)
                Text("No hearts lost. This just finds your starting point.", style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

/** [struckThrough]: a missed band is struck through and a band not reached is plain and fainter, so the two differ by more than a word (the web does the same). */
private data class MarkerLook(val words: String, val fill: Color, val border: Color, val text: Color, val struckThrough: Boolean = false)

/** One chip per band. A skipped band is dashed-looking (outlined, no fill) and a passed one is filled, so credit and a real pass never look alike. */
@Composable
private fun LevelMarkers(markers: List<BandMarker>) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)) {
        markers.forEach { m ->
            val look = when (m.state) {
                BandMarkerState.PASSED -> MarkerLook("passed", ds.choice, ds.choice, ds.surface)
                BandMarkerState.SKIPPED -> MarkerLook("skipped after strong answers", ds.surface, ds.choice, ds.choice)
                BandMarkerState.CURRENT -> MarkerLook("now", ds.surface, ds.ink, ds.ink)
                BandMarkerState.MISSED -> MarkerLook("not passed", ds.surface, ds.line, ds.inkSoft, struckThrough = true)
                BandMarkerState.UPCOMING -> MarkerLook("not reached", ds.surface, ds.line, ds.inkFaint)
            }
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(look.fill)
                    .border(1.dp, look.border, CircleShape)
                    .padding(horizontal = 10.dp, vertical = 3.dp)
                    // clearAndSet, not semantics: otherwise TalkBack also reads the inner "A1" on its own.
                    .clearAndSetSemantics { contentDescription = "${m.level}, ${look.words}" },
            ) {
                Text(
                    m.level,
                    style = if (look.struckThrough) CaptionType.copy(textDecoration = TextDecoration.LineThrough) else CaptionType,
                    color = look.text,
                )
            }
        }
    }
}

@Composable
private fun Results(state: PlacementUiState, onFinished: () -> Unit, onRetake: () -> Unit, onRetrySave: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val meta = LEVEL_META[state.level]
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically)) {
        rememberFirstRunAsset("poses/alphonso-levelup-cheer.webp")?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 3).clearAndSetSemantics { }) }
        AlphonsoSectionHeader("Your level")
        Text(state.level, style = DisplayType, color = ds.ink)
        meta?.let {
            Text(it.first, style = TitleType, color = ds.ink)
            Text(it.second, style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center)
        }
        Text("${state.correctTotal} of ${state.total} correct", style = FootnoteType, color = ds.inkSoft)
        state.finishedLabel?.let { Text(it, style = CaptionType, color = ds.choice) }
        if (state.skippedLevels.isNotEmpty()) {
            Text("Fast-tracked past ${state.skippedLevels.joinToString(", ")} after strong answers.", style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center)
        }
        if (state.saveState == SaveState.Failed) {
            Text("We couldn't save your level. Check your connection and try again.", style = FootnoteType, color = ds.ink, textAlign = TextAlign.Center)
            DsCompactButton("Try saving again", onRetrySave)
        }
        if (state.saveState == SaveState.Saving) Text("Saving your level…", style = CaptionType, color = ds.inkSoft)
        AlphonsoPrimaryButton("Start learning at ${state.level}", onClick = onFinished)
        DsCompactButton("Retake the test", onRetake)
    }
}
