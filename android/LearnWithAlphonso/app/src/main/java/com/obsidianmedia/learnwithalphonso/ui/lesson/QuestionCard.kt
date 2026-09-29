package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.net.TranslationVerdict
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.components.ChoiceButton
import com.obsidianmedia.learnwithalphonso.ui.components.ExplanationBlock
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * Renders any of the six question types with a `picked` binding. Shared by
 * the lesson player and the review queue. Speak questions use the typing
 * fallback here; the recorder path lands with Plan 3 behind the same binding.
 */
@Composable
fun QuestionCard(
    container: AppContainer,
    question: Question,
    course: Course,
    vocabImages: Map<String, VocabImageRef>,
    checked: Boolean,
    isCorrect: Boolean,
    picked: String?,
    onPick: (String?) -> Unit,
    translationVerdict: TranslationVerdict? = null,
) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (question) {
            is Question.MultipleChoice -> {
                question.imageKey?.let { vocabImages[it] }?.let { VocabImage(it, height = 160.dp) }
                question.audioText?.let { audio -> PlayAudioButton { Speech.get(context).speak(audio, course) } }
                Prompt(question.prompt)
                question.choices.forEach { choice ->
                    ChoiceButton(choice, selected = picked == choice, checked = checked, isCorrectChoice = question.choices[question.answer] == choice, onClick = { onPick(choice) })
                }
                if (checked) ExplanationBlock(isCorrect, question.explanation)
            }
            is Question.FillInBlank -> {
                Prompt(question.prompt)
                AnswerField(picked ?: "", onPick, "Type your answer", enabled = !checked)
                if (question.bank.isNotEmpty()) {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        question.bank.forEach { word -> AlphonsoSecondaryButton(word, onClick = { onPick(word) }, enabled = !checked, fullWidth = false) }
                    }
                }
                if (checked) ExplanationBlock(isCorrect, question.explanation)
            }
            is Question.Reorder -> {
                Prompt(question.prompt)
                ReorderArea(question.tokens, checked, onPick)
                if (checked) ExplanationBlock(isCorrect, question.explanation)
            }
            is Question.Listening -> {
                AlphonsoSectionHeader("Listening")
                PlayAudioButton { Speech.get(context).speak(question.audioText, course) }
                Prompt(question.prompt)
                question.choices.forEach { choice ->
                    ChoiceButton(choice, selected = picked == choice, checked = checked, isCorrectChoice = question.answer == choice, onClick = { onPick(choice) })
                }
                if (checked) ExplanationBlock(isCorrect, question.explanation)
            }
            is Question.Translate -> {
                AlphonsoSectionHeader("Write it yourself")
                Prompt(question.prompt)
                AnswerField(picked ?: "", onPick, "Write your answer", enabled = !checked, multiline = true)
                if (checked && translationVerdict?.correct == false) {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.surface).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        translationVerdict.reason?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.ink) }
                        Text("ONE WAY TO SAY IT", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                        Text(question.acceptableAnswers.firstOrNull() ?: "", style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                    }
                }
                if (checked) ExplanationBlock(isCorrect, question.explanation)
            }
            is Question.Speak -> SpeakQuestionCard(container, question, course, checked, isCorrect, picked, onPick)
        }
    }
}

@Composable
private fun Prompt(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall, color = AlphonsoColor.palette.ink)
}

@Composable
private fun PlayAudioButton(onClick: () -> Unit) {
    AlphonsoSecondaryButton("🔊  Play audio", onClick = onClick, fullWidth = false)
}

@Composable
fun AnswerField(value: String, onChange: (String?) -> Unit, placeholder: String, enabled: Boolean, multiline: Boolean = false) {
    val palette = AlphonsoColor.palette
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it) },
        placeholder = { Text(placeholder, color = palette.inkSoft) },
        enabled = enabled,
        singleLine = !multiline,
        minLines = if (multiline) 3 else 1,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(AlphonsoRadius.md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = palette.parchment, unfocusedContainerColor = palette.parchment, disabledContainerColor = palette.parchment,
            focusedBorderColor = palette.moss, unfocusedBorderColor = palette.hairline, disabledBorderColor = palette.hairline,
            focusedTextColor = palette.ink, unfocusedTextColor = palette.ink, disabledTextColor = palette.ink, cursorColor = palette.moss,
        ),
    )
}

/** Token pool and assembled row; picks are indices so duplicate tokens stay distinct. */
@Composable
private fun ReorderArea(tokens: List<String>, checked: Boolean, onPick: (String?) -> Unit) {
    val palette = AlphonsoColor.palette
    var order by remember(tokens) { mutableStateOf<List<Int>>(emptyList()) }
    fun publish(next: List<Int>) {
        order = next
        onPick(if (next.size == tokens.size) next.joinToString(" ") { tokens[it] } else null)
    }
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(8.dp).horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (order.isEmpty()) Text("Tap the words below in order", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, modifier = Modifier.padding(6.dp))
        order.forEachIndexed { position, tokenIdx ->
            AlphonsoPrimaryButton(tokens[tokenIdx], onClick = { publish(order.toMutableList().also { it.removeAt(position) }) }, enabled = !checked, fullWidth = false)
        }
    }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        tokens.forEachIndexed { i, token ->
            if (i !in order) AlphonsoSecondaryButton(token, onClick = { publish(order + i) }, enabled = !checked, fullWidth = false)
        }
    }
}

@Composable
fun VocabImage(image: VocabImageRef, height: androidx.compose.ui.unit.Dp = 120.dp, modifier: Modifier = Modifier) {
    // Images load from Pexels' CDN at runtime; a plain placeholder keeps the lesson usable offline.
    val palette = AlphonsoColor.palette
    Column(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(AlphonsoRadius.md)).background(palette.parchment)) {
        AsyncRemoteImage(url = image.url, contentDescription = image.alt, modifier = Modifier.fillMaxWidth().height(height))
    }
}
