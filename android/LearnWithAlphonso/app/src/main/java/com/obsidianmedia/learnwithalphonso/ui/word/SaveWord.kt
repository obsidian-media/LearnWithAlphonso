package com.obsidianmedia.learnwithalphonso.ui.word

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordCopy
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordHint
import com.obsidianmedia.learnwithalphonso.core.logic.WordSegmenter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * How a screen opens the save sheet, offered to the views below it. A lesson's explanation is drawn by shared views
 * (ExplanationBlock, AlphonsoTipCard) that sit under several question cards on two screens; the screen provides this
 * once with [SaveWordHost] and the shared views read it. Null (the default) means "this screen cannot save", and the
 * text stays plain.
 */
val LocalSaveWordHandler = staticCompositionLocalOf<((SaveWordRequest) -> Unit)?> { null }

private val OpenRequestSaver = Saver<OpenSaveRequest?, List<String>>(
    save = { it?.let { r -> listOf(r.id, r.request.word, r.request.sentence, r.request.course) } ?: emptyList() },
    restore = { if (it.isEmpty()) null else OpenSaveRequest(it[0], SaveWordRequest(it[1], it[2], it[3])) },
)

/**
 * Provides [LocalSaveWordHandler] to [content] and shows the save sheet for the word the learner tapped. Every tap gets a
 * fresh id ([SaveWordTaps]) and the sheet's state is keyed by it and lives in the composition (not in an Activity-wide
 * store), so tapping the same word twice shows the sheet again, and a sheet opened later in the same screen never
 * shows an earlier word.
 */
@Composable
fun SaveWordHost(container: AppContainer, content: @Composable () -> Unit) {
    val taps = remember { SaveWordTaps() }
    var open by rememberSaveable(stateSaver = OpenRequestSaver) { mutableStateOf<OpenSaveRequest?>(null) }
    CompositionLocalProvider(LocalSaveWordHandler provides { request -> open = taps.open(request) }) {
        content()
    }
    open?.let { current -> key(current.id) { SaveWordSheet(container, current.request, onDone = { open = null }) } }
}

/**
 * Text whose words can be tapped (TappableText.swift). Built as ONE `Text` from an AnnotatedString in which every word the
 * server will accept is a link, so normal wrapping, font scaling and selection keep working. The saved sentence is the
 * one the word was TAPPED in, so a word that occurs twice does not save the wrong context. Links are styled as plain
 * text; a hint line on the screen tells the learner words are tappable.
 *
 * For TalkBack the text is ONE element that reads as written (a long reply must not become word-by-word swipe stops), and
 * the words are reached through a custom action, "Save a word", which lists them (the counterpart of iOS's rotor). Any
 * [extraActions] (for example "Report this response") are kept beside it, and [accessibilityPrefix] ("Correct.") is
 * announced first.
 */
@Composable
fun TappableText(
    text: String,
    course: String,
    onSave: (SaveWordRequest) -> Unit,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyLarge,
    color: Color = AlphonsoColor.palette.ink,
    extraActions: List<CustomAccessibilityAction> = emptyList(),
    accessibilityPrefix: String? = null,
) {
    val save by rememberUpdatedState(onSave)
    val segments = remember(text) { WordSegmenter.segments(text) }
    val annotated = remember(text, course, color) {
        buildAnnotatedString {
            for (segment in segments) {
                if (segment.isWord && WordSegmenter.isSavable(segment.text)) {
                    val link = LinkAnnotation.Clickable(
                        tag = "word:${segment.start}",
                        styles = TextLinkStyles(style = SpanStyle(color = color)),
                    ) { save(WordSegmenter.requestFor(text, segment, course)) }
                    withLink(link) { append(segment.text) }
                } else {
                    append(segment.text)
                }
            }
        }
    }
    var showWords by rememberSaveable { mutableStateOf(false) }
    val spoken = (accessibilityPrefix?.let { "$it " } ?: "") + segments.joinToString("") { it.text }
    Text(
        annotated,
        modifier = modifier.clearAndSetSemantics {
            contentDescription = spoken
            customActions = extraActions + CustomAccessibilityAction(SavedWordCopy.PICK_ACTION) { showWords = true; true }
        },
        style = style, color = color,
    )
    if (showWords) {
        // One entry per distinct word, in reading order, each saving the sentence of its first occurrence.
        val words = remember(segments) {
            segments.filter { it.isWord && WordSegmenter.isSavable(it.text) }.distinctBy { it.text.lowercase() }
        }
        AlertDialog(
            onDismissRequest = { showWords = false },
            title = { Text(SavedWordCopy.PICK_TITLE) },
            text = {
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(words, key = { it.start }) { segment ->
                        TextButton(
                            onClick = { showWords = false; save(WordSegmenter.requestFor(text, segment, course)) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(segment.text, color = AlphonsoColor.palette.ink) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showWords = false }) { Text("Cancel", color = AlphonsoColor.palette.inkSoft) } },
        )
    }
}

/** "Tap a word to save it." under a lesson explanation, shown only the first few times, then gone (SaveWordHintLine). */
@Composable
fun SaveWordHintLine(container: AppContainer, text: String = SavedWordCopy.LESSON_HINT, limited: Boolean = true) {
    var visible by remember { mutableStateOf(!limited) }
    LaunchedEffect(Unit) {
        if (!limited) return@LaunchedEffect
        val shown = runCatching { container.prefs.getInt(HINT_KEY, 0) }.getOrDefault(0)
        if (SavedWordHint.shouldShow(shown)) {
            visible = true
            runCatching { container.prefs.edit().putInt(HINT_KEY, shown + 1).apply() }
        }
    }
    if (visible) Text(text, style = MaterialTheme.typography.labelSmall, color = AlphonsoColor.palette.inkSoft)
}

private const val HINT_KEY = "savedWordHintShownCount"

/** Shows a tapped word and its sentence, saves it on demand, then shows the meaning. Never blocks the screen underneath: "Done" always works. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaveWordSheet(container: AppContainer, request: SaveWordRequest, onDone: () -> Unit) {
    val palette = AlphonsoColor.palette
    // The flow belongs to this sheet's composition: it ends with the sheet (and its request is cancelled), and the next
    // sheet, even for the same word, starts clean.
    val scope = rememberCoroutineScope()
    val flow = remember {
        SaveWordFlow(
            request,
            { word, sentence, course -> container.aiClient.defineWord(word, sentence, course) },
            container.aiConsent,
            { container.session.currentAccessToken() != null },
            scope,
        )
    }
    val phase by flow.phase.collectAsState()
    ModalBottomSheet(onDismissRequest = onDone, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false), containerColor = palette.surface) {
        // Scrollable: the sentence can be 300 characters and fonts scale, so the content can exceed the sheet. Done stays pinned below.
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(flow.request.word, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                Text("“${flow.request.sentence}”", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                SaveWordContent(phase, onSave = { flow.save() })
            }
            TextButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text(SavedWordCopy.DONE, color = palette.inkSoft) }
        }
    }
    if (phase == SaveWordPhase.NeedsConsent) {
        AiConsentDialog(container.aiConsent, onNotNow = flow::declineConsent, onAllowed = { flow.save() })
    }
}

@Composable
private fun SaveWordContent(phase: SaveWordPhase, onSave: () -> Unit) {
    val palette = AlphonsoColor.palette
    when (phase) {
        SaveWordPhase.Idle, SaveWordPhase.NeedsConsent -> AlphonsoPrimaryButton(SavedWordCopy.SAVE_BUTTON, onClick = onSave)
        SaveWordPhase.Saving -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(color = palette.moss, modifier = Modifier.height(24.dp))
            Text(SavedWordCopy.LOOKING_UP, style = MaterialTheme.typography.bodyMedium, color = palette.ink)
        }
        is SaveWordPhase.Saved -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = palette.moss)
                Text(
                    if (phase.result.alreadySaved) SavedWordCopy.ALREADY_SAVED else SavedWordCopy.SAVED,
                    style = MaterialTheme.typography.labelLarge, color = palette.moss,
                )
            }
            Text(phase.result.explanation, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
            Text(SavedWordCopy.AI_CAVEAT, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
        }
        is SaveWordPhase.Failed -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(phase.error.userMessage, style = MaterialTheme.typography.bodyMedium, color = palette.destructive)
            if (phase.error.isRetryable) AlphonsoSecondaryButton(SavedWordCopy.TRY_AGAIN, onClick = onSave, fullWidth = false)
        }
    }
}
