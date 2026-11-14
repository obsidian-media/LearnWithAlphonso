package com.obsidianmedia.learnwithalphonso.ui.review

import android.text.format.DateUtils
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewPresentation
import com.obsidianmedia.learnwithalphonso.core.logic.correctAnswerText
import com.obsidianmedia.learnwithalphonso.core.logic.promptText
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.Explanation
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonStageQuestion
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonVerdictSheet
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost

/**
 * Review (the batch-1 redesign, the same screen as iOS ReviewQueueView.swift and the web's review route): the due count
 * over Alphonso at his book on the library scene, then the question and the verdict sheet exactly as a lesson draws
 * them (LessonStageQuestion, LessonVerdictSheet). Behaviour is unchanged: the same view-model, Check, Next, offline
 * banner, weak-spot line and AI consent surface.
 */
@Composable
fun ReviewScreen(container: AppContainer, course: Course, onExit: () -> Unit, seededVm: ReviewViewModel? = null) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val vm: ReviewViewModel = seededVm ?: viewModel(key = "review-${course.code}") {
        ReviewViewModel(container.content, container.progressClient, container.syncStore, { container.connectivity.isConnected.value }, course, onQueueFetched = container.reminders::onQueueLoaded, ownerUserId = { container.session.userId })
    }
    val state by vm.state.collectAsState()

    SaveWordHost(container) {
        Column(Modifier.fillMaxSize().background(ds.surface)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DsPill(course.code.uppercase(), DsPillTone.NEUTRAL)
                Box(Modifier.weight(1f))
                DsCompactButton("Done", onExit)
            }
            val screen = ReviewPresentation.screen(
                isLoading = state.isLoading, hasError = state.errorMessage != null, queueSize = state.queue.size, isDone = state.isDone,
            )
            when (screen) {
                ReviewPresentation.Screen.LOADING -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
                ReviewPresentation.Screen.ERROR -> StateCard("lesson/hmm.webp", ReviewPresentation.ERROR_TITLE, state.errorMessage.orEmpty())
                ReviewPresentation.Screen.EMPTY -> StateCard("lesson/happy.webp", ReviewPresentation.EMPTY_TITLE, state.clearedBonusMessage ?: ReviewPresentation.EMPTY_BODY)
                ReviewPresentation.Screen.CLEARED -> StateCard("lesson/wow.webp", ReviewPresentation.CLEARED_TITLE, state.clearedBonusMessage ?: ReviewPresentation.CLEARED_BODY)
                ReviewPresentation.Screen.QUESTION -> {
                    val item = state.currentItem!!
                    val question = vm.questionFor(item)
                    if (question == null) {
                        LaunchedEffect(item.itemKey) { vm.skipUnresolvable() }
                        return@Column
                    }
                    if (state.showingCachedSince != null || state.cachedWithoutTimestamp) {
                        val label = state.showingCachedSince?.let { "Offline. Last synced ${DateUtils.getRelativeTimeSpanString(it)}" } ?: "Offline. Showing your last synced queue"
                        Text(
                            label, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().background(ds.actionTint).padding(AlphonsoTokens.Space.s2),
                        )
                    }
                    val layout = LessonStage.layout(LocalConfiguration.current.screenHeightDp, question.promptText)
                    val answered = state.checked
                    val correct = if (answered) vm.isCurrentCorrect() else false
                    Column(Modifier.fillMaxSize()) {
                        Column(
                            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
                            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                                DsProgressBar(ReviewPresentation.progress(state.idx, state.queue.size, answered), Modifier.weight(1f))
                                DsPill(ReviewPresentation.dueLabel(state.idx, state.queue.size), DsPillTone.GOLD)
                            }
                            Banner()
                            item.weaknessDisplay?.let { Text("Weak spot: $it", style = CaptionType, color = ds.actionText) }
                            key(item.itemKey) {
                                LessonStageQuestion(
                                    container = container, question = question, course = course, vocabImages = container.content.vocabImages,
                                    checked = answered, isCorrect = correct, isReinforcing = false,
                                    compact = layout.size == LessonStage.Size.SMALL, picked = state.picked, onPick = vm::pick,
                                    onStarted = { }, translationVerdict = state.translationVerdict,
                                )
                            }
                        }
                        when {
                            state.isSubmitting -> Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s4), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
                            state.isChecking -> Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s4), contentAlignment = Alignment.Center) { Text("Checking...", style = CaptionType, color = ds.inkSoft) }
                            !answered -> Box(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s3)) {
                                LessonEdgeButton("Check", EdgeVariant.PRIMARY, vm::check, enabled = !state.picked.isNullOrBlank())
                            }
                            else -> LessonVerdictSheet(
                                correct = correct, title = ReviewPresentation.verdictTitle(correct), xp = null,
                                correctAnswer = question.correctAnswerText,
                                onHearAnswer = { Speech.get(context).speak(question.correctAnswerText, course) },
                                continueLabel = "Next", onContinue = vm::next,
                                explanation = { Explanation(container, correct, question.explanation, course, question, inSheet = true) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Alphonso at his book over the library scene: the picture the due count sits above. */
@Composable
private fun Banner() {
    val ds = LocalAlphonsoTokens.current
    val scene = rememberFirstRunAsset("screen-scenes/hector.jpg")
    val pose = rememberFirstRunAsset("poses/alphonso-reading-book.webp")
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.sheet)
    Box(Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 3 + AlphonsoTokens.Space.s2).clip(shape).background(ds.sunk)) {
        scene?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to ds.heroB.copy(alpha = 0.55f))))
        pose?.let {
            Image(
                it, null, contentScale = ContentScale.Fit,
                modifier = Modifier.align(Alignment.BottomEnd).height(AlphonsoTokens.Space.s12 * 3).padding(end = AlphonsoTokens.Space.s3).offset(y = AlphonsoTokens.Space.s2),
            )
        }
    }
}

/** An empty, cleared or failed queue: Alphonso over the words, on a card. */
@Composable
private fun StateCard(art: String, title: String, message: String) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter).semantics { liveRegion = LiveRegionMode.Polite }) {
        DsEmptyState(title, message, artAsset = art)
    }
}
