package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentPolicy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentSurface
import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.core.logic.promptText
import com.obsidianmedia.learnwithalphonso.core.net.TranslationVerdict
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * One question in the unit's room (visual round 6): Alphonso's bubble with the prompt and a play button, any
 * picture, and the answers in the lesson's style. The mechanics are the shared QuestionCard's, unchanged; review keeps
 * that card. A placed word makes Alphonso listen before the sentence is complete ([onStarted]).
 */
@Composable
fun LessonStageQuestion(
    container: AppContainer,
    question: Question,
    course: Course,
    vocabImages: Map<String, VocabImageRef>,
    checked: Boolean,
    isCorrect: Boolean,
    isReinforcing: Boolean,
    compact: Boolean,
    picked: String?,
    onPick: (String?) -> Unit,
    onStarted: (Boolean) -> Unit,
    translationVerdict: TranslationVerdict?,
    /** Which screen the question is on: the consent rules differ for a lesson and for Review. */
    surface: AiConsentSurface = AiConsentSurface.LESSON,
) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val speech = remember { Speech.get(context) }
    val label = when {
        isReinforcing -> "Quick practice"
        question is Question.Listening -> "Listening"
        question is Question.Speak -> "Speaking"
        question is Question.Translate -> "Write it yourself"
        else -> "Alphonso asks"
    }
    // A listening question's button plays what to listen to, in the course's language; any other question's reads the
    // question itself, which is written in English for every course.
    val audio = when (question) {
        is Question.Listening -> question.audioText to course
        is Question.MultipleChoice -> (question.audioText?.let { it to course }) ?: (question.prompt to Course.ENGLISH)
        else -> question.promptText to Course.ENGLISH
    }
    val listens = question is Question.Listening || (question is Question.MultipleChoice && question.audioText != null)
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        AlphonsoBubble(label, question.promptText, onPlay = { speech.speak(audio.first, audio.second) }, playLabel = if (listens) "Play audio" else "Play the question", compact = compact)
        when (question) {
            is Question.MultipleChoice -> {
                question.imageKey?.let { vocabImages[it] }?.let { VocabImage(it, height = 160.dp) }
                Choices(question.choices, question.choices.getOrNull(question.answer), checked, picked, onPick)
            }
            is Question.Listening -> Choices(question.choices, question.answer, checked, picked, onPick)
            is Question.FillInBlank -> {
                LessonTextField(picked ?: "", { onPick(it) }, "Type your answer", enabled = !checked)
                if (question.bank.isNotEmpty()) {
                    LessonWordRow { question.bank.forEach { w -> LessonWordTile(w, onClick = { onPick(w) }, enabled = !checked, picked = picked == w) } }
                }
            }
            is Question.Reorder -> {
                // Picks are indices so duplicate tokens stay distinct; `picked` is set only once every word is placed.
                var order by remember(question.id) { mutableStateOf<List<Int>>(emptyList()) }
                fun publish(next: List<Int>) {
                    order = next
                    onStarted(next.isNotEmpty())
                    onPick(if (next.size == question.tokens.size) next.joinToString(" ") { question.tokens[it] } else null)
                }
                LessonSentenceSlot(order.isEmpty()) {
                    order.forEachIndexed { position, tokenIdx ->
                        LessonWordTile(question.tokens[tokenIdx], onClick = { publish(order.toMutableList().also { it.removeAt(position) }) }, enabled = !checked, placed = true)
                    }
                }
                LessonWordRow {
                    question.tokens.forEachIndexed { i, token ->
                        if (i !in order) LessonWordTile(token, onClick = { publish(order + i) }, enabled = !checked)
                    }
                }
            }
            is Question.Translate -> {
                LessonTextField(picked ?: "", { onPick(it) }, "Write your answer", enabled = !checked, multiline = true)
                // Without the account's AI consent the written answer is checked against our list only, and the learner
                // is told so with a way to turn AI grading on. Never a wall: the lesson goes on.
                val consent by container.aiConsent.state.collectAsState()
                var showConsent by rememberSaveable { mutableStateOf(false) }
                if (!checked && AiConsentPolicy.offersAiGradingOptIn(surface, container.aiConsent.statusOf(consent))) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(AiConsentCopy.localGradingNote, style = lessonBodyStyle(), color = ds.inkSoft, modifier = Modifier.weight(1f, fill = false))
                        TextButton(onClick = { showConsent = true }) { Text(AiConsentCopy.turnOnAiGrading, color = ds.choice) }
                    }
                }
                if (showConsent) AiConsentDialog(container.aiConsent, onNotNow = { showConsent = false }, onAllowed = { showConsent = false })
                // The grader's reason only; the verdict sheet leads with the accepted phrasing.
                if (checked && translationVerdict?.correct == false) translationVerdict.reason?.let { LessonNote(it) }
            }
            is Question.Speak -> SpeakQuestionCard(container, question, course, checked, isCorrect, picked, onPick, inStage = true)
        }
    }
}

@Composable
private fun Choices(choices: List<String>, right: String?, checked: Boolean, picked: String?, onPick: (String?) -> Unit) {
    // Once checked, the right answer scrolls into view above the verdict sheet, as on the web.
    val rightAnswer = remember { BringIntoViewRequester() }
    LaunchedEffect(checked) {
        if (checked) {
            delay(80)
            rightAnswer.bringIntoView()
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        choices.forEachIndexed { index, choice ->
            Box(if (choice == right) Modifier.bringIntoViewRequester(rightAnswer) else Modifier) {
                LessonAnswerButton(
                    index, choice, LessonAnswerState.of(checked, picked == choice, choice == right),
                    onClick = { onPick(choice) }, enabled = !checked,
                )
            }
        }
    }
}
