package com.obsidianmedia.learnwithalphonso.ui.listen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizBest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizOffer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizPhase
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizQuestion
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizResult
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizSession
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The quiz offered after a podcast episode: pick, check, next. Port of PodcastQuizSheet.swift. Every rule about the steps
 * is [com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizRun]; the score and XP are the server's
 * ([com.obsidianmedia.learnwithalphonso.core.net.PodcastClient.submitQuiz]); the answer shown after each check is for the
 * learner's benefit only. The session lives on the app scope, so leaving the sheet does not cancel a request that may
 * already have been applied.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastQuizSheet(container: AppContainer, title: String, episodeId: String, offer: PodcastQuizOffer, onSaved: (PodcastQuizResult) -> Unit, onDismiss: () -> Unit) {
    val palette = AlphonsoColor.palette
    // One session per time the sheet is opened.
    val session = remember {
        PodcastQuizSession(
            offer = offer,
            scope = container.appLifetimeScope,
            submit = { answers, finishedAt -> container.podcastClient.submitQuiz(episodeId, answers, finishedAt) },
            onSaved = onSaved,
        )
    }
    val run by session.run.collectAsState()
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Quiz: $title", style = MaterialTheme.typography.titleMedium, color = palette.ink)
            when (val phase = run.phase) {
                PodcastQuizPhase.Answering -> run.current?.let { question ->
                    QuestionView(
                        question = question, number = run.index + 1, count = run.questions.size, best = session.best,
                        selectedIndex = run.selected, checked = run.checked, isLast = run.isLastQuestion,
                        onSelect = session::select, onCheck = session::check, onNext = session::next,
                    )
                }
                PodcastQuizPhase.Submitting -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = palette.moss, modifier = Modifier.padding(4.dp))
                    Text("Saving your answers…", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                }
                is PodcastQuizPhase.Error -> ErrorView(phase.error, onRetry = session::retry)
                PodcastQuizPhase.Done -> run.result?.let { result -> ResultView(result, run.questions) }
                PodcastQuizPhase.Empty -> Text(PodcastQuizCopy.message(PodcastQuizError.NOT_FOUND), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
            }
            OutlinedButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (run.phase == PodcastQuizPhase.Done) "Done" else "Leave") }
        }
    }
}

@Composable
private fun QuestionView(
    question: PodcastQuizQuestion, number: Int, count: Int, best: PodcastQuizBest?, selectedIndex: Int?, checked: Boolean, isLast: Boolean,
    onSelect: (Int) -> Unit, onCheck: () -> Unit, onNext: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    var line = "Question $number of $count"
    if (best != null) line += " · your best: ${best.correct} of $count"
    Text(line, style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
    Text(question.prompt, style = MaterialTheme.typography.titleMedium, color = palette.ink, fontWeight = FontWeight.SemiBold)
    question.choices.forEachIndexed { index, text ->
        val picked = selectedIndex == index
        val right = checked && index == question.answerIndex
        val wrong = checked && picked && index != question.answerIndex
        // The verdict is a visible mark and a word, never colour alone, and the same words go to TalkBack.
        val verdict = when {
            right -> "✓ ${PodcastQuizCopy.CORRECT_LABEL}"
            wrong -> "✕ ${PodcastQuizCopy.WRONG_LABEL}"
            else -> null
        }
        val border = when {
            right -> palette.moss
            wrong -> palette.destructive
            picked -> palette.moss
            else -> palette.hairline
        }
        Surface(
            shape = RoundedCornerShape(12.dp), color = palette.surface,
            border = BorderStroke(if (picked || right || wrong) 2.dp else 1.dp, border),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .clickable(enabled = !checked) { onSelect(index) }
                .semantics(mergeDescendants = true) {
                    selected = picked
                    if (verdict != null) stateDescription = verdict.drop(2)
                },
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(text, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                if (verdict != null) Text(verdict, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = if (right) palette.moss else palette.destructive)
            }
        }
    }
    Button(
        onClick = { if (checked) onNext() else onCheck() },
        enabled = selectedIndex != null,
        colors = ButtonDefaults.buttonColors(containerColor = palette.moss, contentColor = palette.onPrimary),
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) { Text(if (checked) (if (isLast) "Finish" else "Next") else "Check", fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun ErrorView(error: PodcastQuizError, onRetry: () -> Unit) {
    val palette = AlphonsoColor.palette
    Text(PodcastQuizCopy.message(error), style = MaterialTheme.typography.bodyMedium, color = palette.destructive)
    // Only when sending the same answers again can help; a missing quiz or malformed answers cannot.
    if (error.isRetryable) {
        Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = palette.moss, contentColor = palette.onPrimary), modifier = Modifier.heightIn(min = 48.dp)) { Text("Try again") }
    }
}

@Composable
private fun ResultView(result: PodcastQuizResult, questions: List<PodcastQuizQuestion>) {
    val palette = AlphonsoColor.palette
    Text("${result.correct} of ${result.total} correct", style = MaterialTheme.typography.headlineSmall, color = palette.ink, fontWeight = FontWeight.Bold)
    Text(PodcastQuizCopy.xpLine(result), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
    val missed = questions.filter { it.id in result.missedQuestionIds }
    if (missed.isNotEmpty()) {
        Text("To review", style = MaterialTheme.typography.titleSmall, color = palette.ink, modifier = Modifier.padding(top = 8.dp))
        missed.forEach { q ->
            Column(Modifier.semantics(mergeDescendants = true) {}) {
                Text(q.prompt, style = MaterialTheme.typography.bodyMedium, color = palette.ink)
                Text("Answer: ${q.choices[q.answerIndex]}", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
            }
        }
    }
}

/**
 * "Take the quiz" under an episode's row, for an episode that has one: a replay, or a first try for a learner who listened
 * on another device. The quiz is read when the button is pressed.
 */
@Composable
fun PodcastQuizRowButton(container: AppContainer, episode: PodcastEpisode) {
    val palette = AlphonsoColor.palette
    val scope = rememberCoroutineScope()
    var offer by remember(episode.id) { mutableStateOf<PodcastQuizOffer?>(null) }
    var loading by remember(episode.id) { mutableStateOf(false) }
    var unavailable by remember(episode.id) { mutableStateOf(false) }
    var show by remember(episode.id) { mutableStateOf(false) }
    Column(Modifier.padding(start = 8.dp)) {
        OutlinedButton(
            onClick = {
                unavailable = false
                if (offer != null) { show = true; return@OutlinedButton }
                scope.launch {
                    loading = true
                    try {
                        val found = container.podcastClient.fetchQuiz(episode.id)
                        if (found != null) { offer = found; show = true } else unavailable = true
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        unavailable = true
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "${PodcastQuizCopy.TAKE_THE_QUIZ}: ${episode.title}" },
        ) { Text(if (loading) "Loading quiz…" else PodcastQuizCopy.TAKE_THE_QUIZ, fontWeight = FontWeight.SemiBold) }
        if (unavailable) Text(PodcastQuizCopy.message(PodcastQuizError.NOT_FOUND), style = MaterialTheme.typography.bodySmall, color = palette.destructive)
    }
    val current = offer
    if (show && current != null) {
        PodcastQuizSheet(
            container, episode.title, episode.id, current,
            // Reopening shows the better best without another read.
            onSaved = { r -> offer = PodcastQuizOffer(current.questions, PodcastQuizBest(r.bestCorrect, r.bestXp)) },
            onDismiss = { show = false },
        )
    }
}

/** The mini bar's offer once the episode has played to its end: read keyed on the episode and on finishing, so another episode clears it. */
@Composable
fun PodcastQuizOfferRow(container: AppContainer, episode: PodcastEpisode, finished: Boolean) {
    val palette = AlphonsoColor.palette
    var offer by remember(episode.id, finished) { mutableStateOf<PodcastQuizOffer?>(null) }
    var show by remember(episode.id, finished) { mutableStateOf(false) }
    LaunchedEffect(episode.id, finished) {
        // No offer is the quiet failure: the episode is unaffected by a quiz that cannot be read.
        offer = if (finished) runCatching { container.podcastClient.fetchQuiz(episode.id) }.getOrNull() else null
    }
    val current = offer ?: return
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(PodcastQuizCopy.OFFER_TITLE, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = palette.ink)
            Text(PodcastQuizCopy.offerDetail(current.questions.size, current.best), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        }
        Button(onClick = { show = true }, colors = ButtonDefaults.buttonColors(containerColor = palette.moss, contentColor = palette.onPrimary), modifier = Modifier.heightIn(min = 48.dp)) { Text(PodcastQuizCopy.TAKE_THE_QUIZ) }
    }
    if (show) {
        PodcastQuizSheet(
            container, episode.title, episode.id, current,
            // The offer's "best" label follows a better run without another read.
            onSaved = { r -> offer = PodcastQuizOffer(current.questions, PodcastQuizBest(r.bestCorrect, r.bestXp)) },
            onDismiss = { show = false },
        )
    }
}
