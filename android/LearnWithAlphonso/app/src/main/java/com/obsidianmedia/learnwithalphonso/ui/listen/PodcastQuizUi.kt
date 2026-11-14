package com.obsidianmedia.learnwithalphonso.ui.listen

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.AlphonsoBubble
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonAnswerButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizBest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizOffer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizPhase
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizQuestion
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizResult
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizSession
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
    val ds = LocalAlphonsoTokens.current
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
    ModalBottomSheet(
        onDismissRequest = onDismiss, containerColor = ds.surface,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Text("Quiz: $title", style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
            when (val phase = run.phase) {
                PodcastQuizPhase.Answering -> run.current?.let { question ->
                    QuestionView(
                        question = question, number = run.index + 1, count = run.questions.size, best = session.best,
                        selectedIndex = run.selected, checked = run.checked, isLast = run.isLastQuestion,
                        onSelect = session::select, onCheck = session::check, onNext = session::next,
                    )
                }
                PodcastQuizPhase.Submitting -> DsCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(color = ds.choice)
                        Text("Saving your answers…", style = FootnoteType, color = ds.inkSoft)
                    }
                }
                is PodcastQuizPhase.Error -> ErrorView(phase.error, onRetry = session::retry)
                PodcastQuizPhase.Done -> run.result?.let { result -> ResultView(result, run.questions) }
                PodcastQuizPhase.Empty -> DsEmptyState(PodcastQuizCopy.message(PodcastQuizError.NOT_FOUND), null, artAsset = "lesson/hmm.webp")
            }
            LessonEdgeButton(if (run.phase == PodcastQuizPhase.Done) "Done" else "Leave", EdgeVariant.SECONDARY, onDismiss)
        }
    }
}

/** One question in the lesson flow's look: the progress, Alphonso's bubble with the prompt, the numbered answers, the gold Check. */
@Composable
private fun QuestionView(
    question: PodcastQuizQuestion, number: Int, count: Int, best: PodcastQuizBest?, selectedIndex: Int?, checked: Boolean, isLast: Boolean,
    onSelect: (Int) -> Unit, onCheck: () -> Unit, onNext: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    var line = "Question $number of $count"
    if (best != null) line += " · your best: ${best.correct} of $count"
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        DsProgressBar((number - 1 + if (checked) 1 else 0).toFloat() / count.coerceAtLeast(1), Modifier.weight(1f))
    }
    Text(line, style = CaptionType, color = ds.inkSoft)
    AlphonsoBubble("Alphonso asks", question.prompt, onPlay = null)
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        question.choices.forEachIndexed { index, text ->
            val picked = selectedIndex == index
            val right = index == question.answerIndex
            LessonAnswerButton(index, text, LessonAnswerState.of(checked, picked, right), onClick = { onSelect(index) }, enabled = !checked)
            // The verdict is a visible word as well as the colour and mark, and the same words go to TalkBack.
            val verdict = when {
                checked && right -> "✓ ${PodcastQuizCopy.CORRECT_LABEL}"
                checked && picked -> "✕ ${PodcastQuizCopy.WRONG_LABEL}"
                else -> null
            }
            if (verdict != null) Text(verdict, style = CaptionType, color = if (right) ds.rightInk else ds.wrongInk, modifier = Modifier.padding(start = AlphonsoTokens.Space.s2))
        }
    }
    LessonEdgeButton(if (checked) (if (isLast) "Finish" else "Next") else "Check", EdgeVariant.PRIMARY, { if (checked) onNext() else onCheck() }, enabled = selectedIndex != null)
}

@Composable
private fun ErrorView(error: PodcastQuizError, onRetry: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    DsCard {
        Text(PodcastQuizCopy.message(error), style = FootnoteType, color = ds.wrongInk)
        // Only when sending the same answers again can help; a missing quiz or malformed answers cannot.
        if (error.isRetryable) DsCompactButton("Try again", onRetry, primary = true)
    }
}

@Composable
private fun ResultView(result: PodcastQuizResult, questions: List<PodcastQuizQuestion>) {
    val ds = LocalAlphonsoTokens.current
    val pose = rememberFirstRunAsset("poses/alphonso-listening-headphones.webp")
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 3).clearAndSetSemantics { }) }
        Text("${result.correct} of ${result.total} correct", style = DisplayType, color = ds.brand, textAlign = TextAlign.Center)
        Text(PodcastQuizCopy.xpLine(result), style = FootnoteType, color = ds.inkSoft)
    }
    val missed = questions.filter { it.id in result.missedQuestionIds }
    if (missed.isNotEmpty()) {
        DsOverline("To review")
        DsCard {
            missed.forEach { q ->
                Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                    Text(q.prompt, style = BodyType, color = ds.ink)
                    Text("Answer: ${q.choices[q.answerIndex]}", style = FootnoteType, color = ds.inkSoft)
                }
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
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var offer by remember(episode.id) { mutableStateOf<PodcastQuizOffer?>(null) }
    var loading by remember(episode.id) { mutableStateOf(false) }
    var unavailable by remember(episode.id) { mutableStateOf(false) }
    var show by remember(episode.id) { mutableStateOf(false) }
    Column(Modifier.padding(start = 8.dp, top = 6.dp)) {
        // An opaque parchment chip with ink words, like the episode card above it: the row sits on the scene photo, where
        // a transparent outlined button left moss text on a picture.
        AlphonsoSecondaryButton(
            text = if (loading) "Loading quiz…" else PodcastQuizCopy.TAKE_THE_QUIZ,
            fullWidth = false,
            onClick = {
                unavailable = false
                if (offer != null) { show = true; return@AlphonsoSecondaryButton }
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
        )
        if (unavailable) Text(PodcastQuizCopy.message(PodcastQuizError.NOT_FOUND), style = FootnoteType, color = ds.wrongInk)
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
    val ds = LocalAlphonsoTokens.current
    var offer by remember(episode.id, finished) { mutableStateOf<PodcastQuizOffer?>(null) }
    // The open sheet is held apart from the offer and the finished state: once open it stays open until the learner closes it,
    // even if the player leaves Finished (a replay, the next episode) while they answer.
    var sheet by remember { mutableStateOf<OpenQuiz?>(null) }
    LaunchedEffect(episode.id, finished) {
        // No offer is the quiet failure: the episode is unaffected by a quiz that cannot be read.
        offer = if (finished) runCatching { container.podcastClient.fetchQuiz(episode.id) }.getOrNull() else null
    }
    val current = offer
    if (current != null) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(PodcastQuizCopy.OFFER_TITLE, style = BodyType, fontWeight = FontWeight.SemiBold, color = ds.ink)
            Text(PodcastQuizCopy.offerDetail(current.questions.size, current.best), style = FootnoteType, color = ds.inkSoft)
        }
        Button(onClick = { sheet = OpenQuiz(episode.id, episode.title, current) }, colors = ButtonDefaults.buttonColors(containerColor = ds.choice, contentColor = ds.onAction), modifier = Modifier.heightIn(min = 48.dp)) { Text(PodcastQuizCopy.TAKE_THE_QUIZ) }
    }
    sheet?.let { open ->
        PodcastQuizSheet(
            container, open.title, open.episodeId, open.offer,
            // The offer's "best" label follows a better run without another read.
            onSaved = { r -> if (open.episodeId == episode.id) offer = PodcastQuizOffer(open.offer.questions, PodcastQuizBest(r.bestCorrect, r.bestXp)) },
            onDismiss = { sheet = null },
        )
    }
}

private data class OpenQuiz(val episodeId: String, val title: String, val offer: PodcastQuizOffer)
