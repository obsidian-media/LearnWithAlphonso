package com.obsidianmedia.learnwithalphonso.ui.listen

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchWalk
import com.obsidianmedia.learnwithalphonso.core.podcast.Branching
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingFinish
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingStory
import com.obsidianmedia.learnwithalphonso.core.podcast.NodeKind
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import com.obsidianmedia.learnwithalphonso.core.podcast.Stories
import com.obsidianmedia.learnwithalphonso.core.podcast.Story
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryEnding
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Interactive branching stories: the "choose your path" reader. Port of the web BranchingStoryReader; the rules are
 * [Branching] in core (JVM tests), this file only draws them. Each node is a read-along page (the same narration, highlight
 * and tap-to-define as the graded reader); a choice point shows the real Alphonso with soft options; an ending shows the
 * wrap, the endings found, stars and try-another-path. The finished path goes to the finish-branching-story Edge Function
 * (never the RPC); the ending and stars shown are the server's. BranchingSourceGuardsTest pins the wiring.
 */
@Composable
internal fun BranchingStoryReader(container: AppContainer, story: BranchingStory) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    // The option index chosen at each choice point, in order: the only thing sent to the server.
    val path = remember(story.id) { emptyList<Int>().toMutableStateList() }
    var nodeId by remember(story.id) { mutableStateOf(story.graph.start) }
    var round by remember(story.id) { mutableIntStateOf(0) }
    val node = story.graph.map[nodeId]
    val kind = Branching.nodeKind(node)

    fun restart() {
        path.clear()
        nodeId = story.graph.start
        round++
    }

    SaveWordHost(container) {
        if (node == null || kind == NodeKind.INVALID) {
            NotReady(::restart)
        } else if (kind == NodeKind.ENDING) {
            EndingScreen(container, story, path.toList(), node.ending!!, ::restart)
        } else {
            NodePage(container, story, nodeId, round, onChoose = { index ->
                Branching.chooseOption(story.graph, nodeId, index)?.let { target ->
                    path.add(index)
                    nodeId = target
                }
            }, onContinue = { node.next?.let { nodeId = it } })
        }
    }
}

@Composable
private fun NotReady(onStartOver: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        Text(BranchingCopy.NOT_READY, style = BodyType, color = ds.ink)
        AlphonsoSecondaryButton(BranchingCopy.START_OVER, onClick = onStartOver, fullWidth = false)
    }
}

/** One node: its scene art (or a placeholder), the read-along text, then Continue or the choice. */
@Composable
private fun NodePage(container: AppContainer, story: BranchingStory, nodeId: String, round: Int, onChoose: (Int) -> Unit, onContinue: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val node = story.graph.map.getValue(nodeId)
    val course = remember(story.course) { Course.fromCode(story.course) }
    // The graded reader's narrator, fed this node's sentences.
    val page = remember(story.id, nodeId, round) { Story(story.id, story.course, story.level, story.title, node.segments, emptyList(), 0) }
    val narrator = remember(page) { StoryNarrator(container, page, scope, container.newPlayback()) }
    val narration by narrator.state.collectAsState()
    DisposableEffect(narrator) { onDispose { narrator.stop() } }
    val consent by container.aiConsent.state.collectAsState()
    val hasAiConsent = container.aiConsent.statusOf(consent) == AiConsentStatus.GRANTED

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        item(key = "title") { DsGlassTitle(story.title, BranchingCopy.BADGE) }
        item(key = "art") { SceneArt(node.artUrl) }
        item(key = "hint") { Text(StoryCopy.TAP_HINT, style = CaptionType, color = ds.inkSoft) }
        node.segments.forEachIndexed { index, segment ->
            item(key = "segment-$nodeId-$index") {
                val active = narration.current == index
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
                Box(
                    Modifier.fillMaxWidth().background(if (active) ds.choiceTint else ds.surface, shape)
                        .border(BorderStroke(AlphonsoTokens.Space.s1 / 2, if (active) ds.choice else ds.surface), shape)
                        .padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2)
                        .semantics(mergeDescendants = true) { if (active) stateDescription = "Reading now" },
                ) {
                    val saveWord = LocalSaveWordHandler.current
                    if (saveWord != null) {
                        TappableText(
                            segment, story.course, SaveWordMode.AllWords,
                            onSave = { request ->
                                narrator.stop()
                                Speech.get(context).speak(request.word, course)
                                saveWord(request)
                            },
                            style = BodyType, color = ds.ink,
                        )
                    } else {
                        Text(segment, style = BodyType, color = ds.ink)
                    }
                }
            }
        }
        item(key = "controls") {
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                if (narration.playing) {
                    DsCompactButton("Pause narration", { narrator.stop() }, primary = true)
                } else {
                    DsCompactButton("Listen", { if (hasAiConsent) narrator.play(0) { } else narrator.markUnavailable() })
                }
            }
        }
        if (narration.failed) item(key = "failed") {
            Text(if (hasAiConsent) StoryCopy.NARRATION_UNAVAILABLE else StoryCopy.NARRATION_NEEDS_AI, style = FootnoteType, color = ds.inkSoft)
        }
        val choice = node.choice
        if (choice != null && node.next == null) {
            item(key = "choice") { ChoicePoint(choice.prompt, choice.options.map { it.label }) { narrator.stop(); onChoose(it) } }
        } else if (node.next != null) {
            item(key = "continue") { DsCompactButton(BranchingCopy.CONTINUE, { narrator.stop(); onContinue() }, primary = true) }
        }
    }
}

/** The real Alphonso asking, with two or three soft options. A wrong-seeming pick only leads somewhere else. */
@Composable
private fun ChoicePoint(prompt: String, labels: List<String>, onPick: (Int) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val pose = rememberFirstRunAsset("poses/alphonso-explaining-pointer.webp")
    DsCard {
        Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            if (pose != null) Image(pose, contentDescription = null, modifier = Modifier.size(AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s6), contentScale = ContentScale.Fit)
            Text(prompt, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
        }
        Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            labels.forEachIndexed { index, label ->
                AlphonsoSecondaryButton(label, onClick = { onPick(index) })
            }
        }
    }
}

/** The scene illustration from the public story-art bucket; a quiet placeholder when there is none or it cannot load. */
@Composable
private fun SceneArt(url: String?) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, url) {
        value = if (url == null) null else withContext(Dispatchers.IO) { fetchBitmap(url) }
    }
    val image = bitmap
    if (image != null) {
        Image(image, contentDescription = "Scene illustration", modifier = Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 4).background(ds.choiceTint, shape), contentScale = ContentScale.Crop)
    } else {
        Box(Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 2 + AlphonsoTokens.Space.s6).background(ds.choiceTint, shape).clearAndSetSemantics { })
    }
}

private fun fetchBitmap(url: String): androidx.compose.ui.graphics.ImageBitmap? = try {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 10_000
    connection.readTimeout = 10_000
    try {
        if (connection.responseCode in 200..299) connection.inputStream.use { BitmapFactory.decodeStream(it)?.asImageBitmap() } else null
    } finally {
        connection.disconnect()
    }
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}

/** What the server did with the finished path. */
private sealed interface FinishState {
    data object Saving : FinishState
    data class Failed(val message: String) : FinishState
    data class Done(val finish: BranchingFinish) : FinishState
}

/** The ending: wrap, endings found, stars (from the server's answer) and try-another-path. */
@Composable
private fun EndingScreen(container: AppContainer, story: BranchingStory, path: List<Int>, ending: StoryEnding, onRestart: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var attempt by remember(path) { mutableIntStateOf(0) }
    var state by remember(path) { mutableStateOf<FinishState>(FinishState.Saving) }
    LaunchedEffect(path, attempt) {
        state = FinishState.Saving
        // The local walk must agree with the screen; the server re-walks the stored graph regardless.
        state = if (Branching.walk(story.graph, path) !is BranchWalk.Ended) {
            FinishState.Failed(BranchingCopy.NOT_READY)
        } else try {
            FinishState.Done(container.storiesClient.finishBranching(story.id, path))
        } catch (e: CancellationException) {
            throw e
        } catch (e: PodcastQuizException) {
            FinishState.Failed(BranchingCopy.message(e.error))
        } catch (e: Exception) {
            FinishState.Failed(BranchingCopy.SAVE_FAILED)
        }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        item(key = "title") { DsGlassTitle(ending.title, BranchingCopy.YOUR_ENDING) }
        item(key = "wrap") { Text(ending.wrap, style = BodyType, color = ds.ink) }
        item(key = "result") {
            when (val current = state) {
                FinishState.Saving -> CircularProgressIndicator(color = ds.choice)
                is FinishState.Failed -> Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    Text(current.message, style = FootnoteType, color = ds.inkSoft)
                    DsCompactButton(BranchingCopy.RETRY_SAVE, { attempt++ }, primary = true)
                }
                is FinishState.Done -> {
                    // Everything shown here is the server's answer, read against the stored graph.
                    val finish = current.finish
                    val stars = Branching.stars(finish.endingsFound.size, finish.endingsTotal, Branching.reachedGood(story.graph, finish.endingsFound))
                    DsCard {
                        DsOverline(BranchingCopy.endingsFound(finish.endingsFound.size, finish.endingsTotal))
                        Text(
                            "★".repeat(stars) + "☆".repeat(3 - stars), style = DisplayType, color = ds.ink,
                            modifier = Modifier.semantics { contentDescription = BranchingCopy.starsLabel(stars) },
                        )
                        if (finish.credited) Text(BranchingCopy.COUNTS_LINE, style = FootnoteType, color = ds.inkSoft)
                    }
                }
            }
        }
        item(key = "again") { AlphonsoSecondaryButton(BranchingCopy.TRY_ANOTHER_PATH, onClick = onRestart, fullWidth = false) }
    }
}
