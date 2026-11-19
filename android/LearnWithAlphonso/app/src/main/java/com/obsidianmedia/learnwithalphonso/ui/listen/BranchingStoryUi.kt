package com.obsidianmedia.learnwithalphonso.ui.listen

import android.graphics.BitmapFactory
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchMap
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchWalk
import com.obsidianmedia.learnwithalphonso.core.podcast.Branching
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingFinish
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingStory
import com.obsidianmedia.learnwithalphonso.core.podcast.MapEdgeStyle
import com.obsidianmedia.learnwithalphonso.core.podcast.MapEndingState
import com.obsidianmedia.learnwithalphonso.core.podcast.MapNodeKind
import com.obsidianmedia.learnwithalphonso.core.podcast.NodeKind
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import com.obsidianmedia.learnwithalphonso.core.podcast.SceneProgress
import com.obsidianmedia.learnwithalphonso.core.podcast.Story
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryEnding
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Interactive branching stories: the "choose your path" reader. Port of the web BranchingStoryReader; the rules are
 * [Branching] in core (JVM tests), this file draws them. A node is a full-bleed scene (art, or a gradient when there is none)
 * with the read-along passage over a dark fade, then Continue or the choice bubbles; an ending shows the art, stars, the wrap,
 * the branch map and the two buttons. The stateful screens ([BranchingStoryReader], [NodePage], [EndingScreen]) own the
 * narrator and the server call; the stateless [BranchingSceneContent] and [BranchingEndingContent] only draw fixture-able
 * data, so BranchingStoryUiTest (androidTest) renders them with no network or AppContainer. The finished path goes to the
 * finish-branching-story Edge Function (never the RPC); the ending and stars shown are the server's.
 * BranchingSourceGuardsTest pins the wiring.
 */
@Composable
internal fun BranchingStoryReader(container: AppContainer, story: BranchingStory) {
    // The option index chosen at each choice point, in order: the only thing sent to the server.
    val path = remember(story.id) { emptyList<Int>().toMutableStateList() }
    // Every node shown so far, links included: "Scene N" is its size.
    val visited = remember(story.id) { listOf(story.graph.start).toMutableStateList() }
    var nodeId by remember(story.id) { mutableStateOf(story.graph.start) }
    var round by remember(story.id) { mutableIntStateOf(0) }
    val reduce = rememberReduceMotion()

    fun restart() {
        path.clear()
        visited.clear()
        visited.add(story.graph.start)
        nodeId = story.graph.start
        round++
    }

    fun go(target: String) {
        nodeId = target
        visited.add(target)
    }

    SaveWordHost(container) {
        // The same fade and slide as before between scenes; with Reduce Motion, a plain swap.
        AnimatedContent(
            targetState = nodeId to round,
            transitionSpec = {
                if (reduce) ContentTransform(fadeIn(tween(0)), fadeOut(tween(0)))
                else (fadeIn(tween(260)) + slideInHorizontally(tween(260)) { it / 12 }) togetherWith (fadeOut(tween(160)) + slideOutHorizontally(tween(160)) { -it / 12 })
            },
            label = "branching-scene",
        ) { (shownId, shownRound) ->
            val shown = story.graph.map[shownId]
            val shownKind = Branching.nodeKind(shown)
            if (shown == null || shownKind == NodeKind.INVALID) {
                NotReady(::restart)
            } else if (shownKind == NodeKind.ENDING) {
                EndingFlow(container, story, path.toList(), shownId, shownRound, visited.size, shown.ending!!, shown.artUrl, ::restart)
            } else {
                NodePage(container, story, shownId, shownRound, visited.size, onChoose = { index ->
                    Branching.chooseOption(story.graph, shownId, index)?.let { target ->
                        path.add(index)
                        go(target)
                    }
                }, onContinue = { shown.next?.let { go(it) } })
            }
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

/** One node: owns the narrator, hands everything else to the stateless [BranchingSceneContent]. */
@Composable
private fun NodePage(container: AppContainer, story: BranchingStory, nodeId: String, round: Int, sceneNumber: Int, onChoose: (Int) -> Unit, onContinue: () -> Unit, onReveal: (() -> Unit)? = null) {
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
    val saveWord = LocalSaveWordHandler.current
    val choice = node.choice
    val back = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher

    BranchingSceneContent(
        title = story.title,
        courseCode = story.course,
        sceneNumber = sceneNumber,
        progress = Branching.sceneProgress(story.graph, sceneNumber, nodeId),
        artUrl = node.artUrl,
        segments = node.segments,
        activeSegment = narration.current,
        playing = narration.playing,
        narrationNote = if (narration.failed) (if (hasAiConsent) StoryCopy.NARRATION_UNAVAILABLE else StoryCopy.NARRATION_NEEDS_AI) else null,
        beat = if (choice != null && node.next == null) choice.prompt else null,
        choiceLabels = if (choice != null && node.next == null) choice.options.map { it.label } else emptyList(),
        showContinue = node.next != null || onReveal != null,
        continueLabel = if (onReveal != null) BranchingCopy.SEE_YOUR_ENDING else BranchingCopy.CONTINUE,
        onBack = back?.let { dispatcher -> { dispatcher.onBackPressed() } },
        onListen = { narrator.begin(0, hasAiConsent) { } },
        onPause = { narrator.stop() },
        onChoose = { narrator.stop(); onChoose(it) },
        onContinue = { narrator.stop(); (onReveal ?: onContinue)() },
        onWordTap = saveWord?.let { handler ->
            { request: SaveWordRequest ->
                narrator.stop()
                Speech.get(context).speak(request.word, course)
                handler(request)
            }
        },
    )
}

// The mock's overlay: the dark of the fade is the hero's deep colour and the white is the on-hero colour, so both come from tokens.
private fun readerFade(dark: Color) = Brush.verticalGradient(
    0.20f to dark.copy(alpha = 0.10f), 0.40f to dark.copy(alpha = 0.05f), 0.66f to dark.copy(alpha = 0.72f), 0.86f to dark.copy(alpha = 0.97f),
)

/**
 * The cinematic reader, stateless: full-bleed art (a gradient when there is none), a top bar with back, title and scene dots,
 * and a bottom panel (scrolls at large font sizes) with "SCENE N", the passage, then the beat and choice bubbles or Continue.
 */
@Composable
internal fun BranchingSceneContent(
    title: String,
    courseCode: String,
    sceneNumber: Int,
    progress: SceneProgress,
    artUrl: String?,
    segments: List<String>,
    activeSegment: Int?,
    playing: Boolean,
    narrationNote: String?,
    beat: String?,
    choiceLabels: List<String>,
    showContinue: Boolean,
    continueLabel: String,
    onBack: (() -> Unit)?,
    onListen: () -> Unit,
    onPause: () -> Unit,
    onChoose: (Int) -> Unit,
    onContinue: () -> Unit,
    onWordTap: ((SaveWordRequest) -> Unit)?,
) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.fillMaxSize().testTag("branching-scene")) {
        SceneArtFill(artUrl, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(readerFade(ds.heroB)))
        Column(Modifier.fillMaxSize()) {
            ReaderTopBar(title, progress, onBack)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                Column(
                    Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
                    verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                ) {
                    Text("Scene $sceneNumber".uppercase(), style = OverlineType, color = ds.onHeroKick, modifier = Modifier.semantics { heading() })
                    segments.forEachIndexed { index, segment ->
                        val active = activeSegment == index
                        Box(
                            Modifier.fillMaxWidth().testTag("branching-passage-$index")
                                .background(if (active) ds.onHero.copy(alpha = 0.14f) else Color.Transparent, RoundedCornerShape(AlphonsoTokens.Space.s2))
                                .padding(horizontal = AlphonsoTokens.Space.s1, vertical = AlphonsoTokens.Space.s1)
                                .semantics(mergeDescendants = true) { if (active) stateDescription = "Reading now" },
                        ) {
                            if (onWordTap != null) {
                                TappableText(segment, courseCode, SaveWordMode.AllWords, onSave = onWordTap, style = BodyType, color = ds.onHero)
                            } else {
                                Text(segment, style = BodyType, color = ds.onHero)
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                        if (playing) DsCompactButton("Pause narration", onPause, primary = true) else DsCompactButton("Listen", onListen)
                    }
                    if (narrationNote != null) Text(narrationNote, style = FootnoteType, color = ds.onHero.copy(alpha = 0.78f))
                    if (beat != null) {
                        Text(beat, style = FootnoteType, color = ds.onHero.copy(alpha = 0.84f), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1))
                        choiceLabels.forEachIndexed { index, label -> ChoiceBubble(label, index) { onChoose(index) } }
                    } else if (showContinue) {
                        AlphonsoPrimaryButton(continueLabel, onClick = onContinue, fullWidth = false)
                    }
                }
            }
        }
    }
}

/** A frosted-solid option: a real button with the full label. The face is fixed white, so its text uses the light brand. */
@Composable
private fun ChoiceBubble(label: String, index: Int, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(18.dp)
    Box(
        Modifier.fillMaxWidth().testTag("branching-choice-$index")
            .shadow(10.dp, shape, ambientColor = Color.Black.copy(alpha = 0.5f), spotColor = Color.Black.copy(alpha = 0.5f))
            .background(ds.onHero.copy(alpha = 0.93f), shape).border(1.5.dp, ds.onHero.copy(alpha = 0.9f), shape)
            .heightIn(min = AlphonsoTokens.Space.minTouch)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = HeadlineType, color = ds.hero, textAlign = TextAlign.Center)
    }
}

@Composable
private fun ReaderTopBar(title: String, progress: SceneProgress, onBack: (() -> Unit)?) {
    val ds = LocalAlphonsoTokens.current
    Row(
        Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(ds.heroB.copy(alpha = 0.5f), Color.Transparent))).padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        // A 30 x 30 chip inside a 48 x 48 hit target.
        Box(
            Modifier.size(AlphonsoTokens.Space.minTouch)
                .then(if (onBack != null) Modifier.clickable(role = Role.Button, onClick = onBack) else Modifier)
                .semantics { contentDescription = "Back" },
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(30.dp).background(ds.onHero.copy(alpha = 0.16f), RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = ds.onHero)
            }
        }
        Text(
            title, style = AlphonsoTokens.Type.questionSmall.toTextStyle(), color = ds.onHero,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).semantics { heading() },
        )
        val total = progress.total.coerceAtLeast(1)
        val current = progress.current.coerceIn(1, total)
        Row(
            Modifier.padding(end = AlphonsoTokens.Space.s2).clearAndSetSemantics { contentDescription = "Scene $current of $total" },
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            for (i in 1..total) {
                Box(Modifier.size(11.dp, 4.dp).background(if (i <= current) ds.xp else ds.onHero.copy(alpha = 0.4f), RoundedCornerShape(999.dp)))
            }
        }
    }
}

/**
 * The scene art, full size: always a gradient underneath (hero brand into the deep scene colour), the picture on top only
 * once it has loaded. No art, a 404 or a failed decode therefore never shows a broken image or a blank area.
 */
@Composable
private fun SceneArtFill(url: String?, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val bitmap by produceState<ImageBitmap?>(null, url) {
        value = if (url == null) null else withContext(Dispatchers.IO) { fetchBitmap(url) }
    }
    val image = bitmap
    Box(modifier.background(Brush.linearGradient(listOf(ds.heroA, ds.heroB))).clearAndSetSemantics { }) {
        if (image != null) Image(image, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}

private fun fetchBitmap(url: String): ImageBitmap? = try {
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

/** What the ending content shows in the result slot: the wait, the failure, or the server's answer. */
internal sealed interface EndingResult {
    data object Saving : EndingResult
    data class Failed(val message: String) : EndingResult
    data class Done(val stars: Int, val credited: Boolean) : EndingResult
}

/**
 * An ending node. The server is asked the moment it is ENTERED (so the credit is never lost); the node first reads as a normal
 * scene (its closing text, narration, tap-to-save) with "See your ending", which then shows the celebration.
 */
@Composable
private fun EndingFlow(
    container: AppContainer, story: BranchingStory, path: List<Int>, nodeId: String, round: Int, sceneNumber: Int,
    ending: StoryEnding, artUrl: String?, onRestart: () -> Unit,
) {
    var revealed by remember(nodeId, round) { mutableStateOf(false) }
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
    val current = state
    // Everything shown here is the server's answer, read against the stored graph.
    val found = (current as? FinishState.Done)?.finish?.endingsFound ?: listOf(ending.id)
    val result = when (current) {
        FinishState.Saving -> EndingResult.Saving
        is FinishState.Failed -> EndingResult.Failed(current.message)
        is FinishState.Done -> {
            val finish = current.finish
            EndingResult.Done(
                Branching.stars(finish.endingsFound.size, finish.endingsTotal, Branching.reachedGood(story.graph, finish.endingsFound)),
                finish.credited,
            )
        }
    }
    if (revealed) {
        BranchingEndingContent(story, path, ending, artUrl, found, result, onRetrySave = { attempt++ }, onRestart = onRestart)
    } else {
        NodePage(container, story, nodeId, round, sceneNumber, onChoose = {}, onContinue = {}, onReveal = { revealed = true })
    }
}

/** The ending, stateless: art with a shine, eyebrow, title, stars, the wrap, the branch map and the two buttons. */
@Composable
internal fun BranchingEndingContent(
    story: BranchingStory,
    path: List<Int>,
    ending: StoryEnding,
    artUrl: String?,
    found: List<String>,
    result: EndingResult,
    onRetrySave: () -> Unit,
    onRestart: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val map = remember(story, path, found, ending.id) { Branching.branchMap(story.graph, path, found, ending.id) }
    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).testTag("branching-ending")) {
        Box(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(214.dp)) {
                SceneArtFill(artUrl, Modifier.fillMaxSize())
                Box(
                    Modifier.size(200.dp).align(Alignment.BottomCenter).graphicsLayer { translationY = 20.dp.toPx() }.drawBehind {
                        drawCircle(Brush.radialGradient(0f to ds.onHeroKick.copy(alpha = 0.5f), 0.62f to Color.Transparent, center = center, radius = size.minDimension / 2))
                    },
                )
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.30f to ds.heroB.copy(alpha = 0.05f), 1f to ds.surface)))
            }
            // Pulled up 50 over the fade.
            Column(
                Modifier.fillMaxWidth().padding(top = 164.dp).padding(horizontal = AlphonsoTokens.Space.s4).padding(bottom = AlphonsoTokens.Space.s6),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
            ) {
                Text(BranchingCopy.YOUR_ENDING.uppercase(), style = OverlineType.copy(letterSpacing = 0.12.em), color = ds.actionText)
                Text(
                    ending.title, style = AlphonsoTokens.Type.question.toTextStyle(), color = ds.ink, textAlign = TextAlign.Center,
                    modifier = Modifier.semantics { heading() },
                )
                when (result) {
                    EndingResult.Saving -> CircularProgressIndicator(color = ds.choice)
                    is EndingResult.Failed -> Column(
                        Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                    ) {
                        Text(result.message, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
                        DsCompactButton(BranchingCopy.RETRY_SAVE, onRetrySave, primary = true)
                    }
                    is EndingResult.Done -> StarsRow(result.stars)
                }
                Text(ending.wrap, style = FootnoteType, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 300.dp))
                if (result is EndingResult.Done && result.credited) {
                    Text(
                        BranchingCopy.COUNTS_LINE, style = CaptionType, color = ds.rightInk, textAlign = TextAlign.Center,
                        modifier = Modifier.background(ds.rightTint, RoundedCornerShape(999.dp)).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1),
                    )
                }
                BranchMapCard(map)
                Row(Modifier.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    AlphonsoPrimaryButton(BranchingCopy.TRY_ANOTHER_PATH, onClick = onRestart, modifier = Modifier.weight(1f))
                    AlphonsoSecondaryButton(BranchingCopy.READ_IT_AGAIN, onClick = onRestart, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/** Three gold stars, [earned] filled; each pops in (scale and a small turn, staggered) unless Reduce Motion is on. */
@Composable
private fun StarsRow(earned: Int) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    Row(
        Modifier.clearAndSetSemantics { contentDescription = BranchingCopy.starsLabel(earned) }.testTag("branching-stars"),
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        for (i in 0 until 3) {
            val pop = remember { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(reduce) {
                if (!reduce) {
                    delay(120L * i)
                    pop.animateTo(1f, tween(500))
                }
            }
            Text(
                "★", style = AlphonsoTokens.Type.numeralXL.toTextStyle(), color = if (i < earned) ds.xp else ds.line,
                modifier = Modifier.graphicsLayer {
                    val scale = 0.4f + 0.6f * pop.value
                    scaleX = scale
                    scaleY = scale
                    rotationZ = -12f * (1f - pop.value)
                    alpha = if (reduce) 1f else pop.value.coerceAtLeast(0.01f)
                },
            )
        }
    }
}

/** "The paths you've found": a card with the count pill, the tree drawn on a Canvas, and the caption. The text alternative is the summary. */
@Composable
private fun BranchMapCard(map: BranchMap) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(16.dp)
    val summary = Branching.branchMapSummary(map)
    Column(
        Modifier.fillMaxWidth().testTag("branch-map-card")
            .background(ds.card, shape).border(2.dp, ds.line, shape).padding(horizontal = 12.dp, vertical = 11.dp)
            // One text alternative for the whole card; the drawing is hidden from assistive tech.
            .clearAndSetSemantics { contentDescription = summary },
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("The paths you've found", style = FootnoteType, color = ds.ink, modifier = Modifier.weight(1f))
            Text(
                "${map.endingsFound} / ${map.endingsTotal}", style = CaptionType, color = ds.xpText,
                modifier = Modifier.background(ds.xpTint, RoundedCornerShape(999.dp)).padding(horizontal = 9.dp, vertical = 2.dp),
            )
        }
        BranchMapCanvas(map, Modifier.fillMaxWidth().aspectRatio(300f / 116f).testTag("branch-map-canvas"))
        Text(Branching.branchMapCaption(map), style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun BranchMapCanvas(map: BranchMap, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    Canvas(modifier) {
        // The mock's viewBox is 300 x 116; everything below is in those units and scaled to the card.
        val s = size.width / 300f
        fun px(x: Double) = (18f + x.toFloat() * 154f) * s
        fun py(y: Double) = (12f + y.toFloat() * 92f) * s
        val byId = map.nodes.associateBy { it.id }
        for (edge in map.edges) {
            val a = byId[edge.from] ?: continue
            val b = byId[edge.to] ?: continue
            val (color, width, dashed) = when (edge.style) {
                MapEdgeStyle.TAKEN -> Triple(ds.xp, 3f, false)
                MapEdgeStyle.FOUND -> Triple(ds.right, 3f, false)
                MapEdgeStyle.LOCKED -> Triple(ds.line, 2.5f, true)
                MapEdgeStyle.PLAIN -> Triple(ds.line, 3f, false)
            }
            drawLine(
                color, Offset(px(a.x), py(a.y)), Offset(px(b.x), py(b.y)), strokeWidth = width * s, cap = StrokeCap.Round,
                pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(3f * s, 4f * s)) else null,
            )
        }
        for (node in map.nodes) {
            val c = Offset(px(node.x), py(node.y))
            val ending = node.ending
            when {
                node.kind == MapNodeKind.START && ending == null -> drawCircle(ds.brand, 9f * s, c)
                ending == null -> {
                    if (node.onPath) {
                        drawCircle(ds.xp, 7f * s, c)
                    } else {
                        drawCircle(ds.sunk, 7f * s, c)
                        drawCircle(ds.line, 7f * s, c, style = Stroke(2f * s))
                    }
                }
                ending.state == MapEndingState.CURRENT -> {
                    drawCircle(ds.xp, 9f * s, c)
                    drawCheck(c, s, ds.onAction)
                }
                ending.state == MapEndingState.FOUND -> {
                    drawCircle(ds.right, 9f * s, c)
                    drawCheck(c, s, ds.onHero)
                }
                else -> {
                    drawCircle(ds.sunk, 8f * s, c)
                    drawCircle(ds.line, 8f * s, c, style = Stroke(2f * s))
                    drawLabel(measurer, density, "?", ds.inkFaint, c, s, 9f, centered = true)
                }
            }
            if (ending != null) {
                val found = ending.state != MapEndingState.LOCKED
                drawLabel(
                    measurer, density, if (found) ending.title else "Hidden ending", if (found) ds.ink else ds.inkFaint,
                    Offset(c.x + 16f * s, c.y), s, 8.5f, centered = false, maxWidth = (300f - 18f - 154f - 16f) * s,
                )
            }
        }
    }
}

private fun DrawScope.drawCheck(c: Offset, s: Float, color: Color) {
    val stroke = 2f * s
    drawLine(color, Offset(c.x - 4f * s, c.y), Offset(c.x - 1f * s, c.y + 3f * s), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(color, Offset(c.x - 1f * s, c.y + 3f * s), Offset(c.x + 4.5f * s, c.y - 3f * s), strokeWidth = stroke, cap = StrokeCap.Round)
}

private fun DrawScope.drawLabel(
    measurer: TextMeasurer, density: Density, text: String, color: Color, at: Offset, s: Float, size: Float,
    centered: Boolean, maxWidth: Float? = null,
) {
    // Figtree 700 (the headline role); the size follows the card, so it is converted from pixels.
    val style = HeadlineType.copy(color = color, fontSize = with(density) { (size * s).toSp() }, lineHeight = androidx.compose.ui.unit.TextUnit.Unspecified)
    val layout = measurer.measure(
        text, style, overflow = TextOverflow.Ellipsis, maxLines = 1,
        constraints = Constraints(maxWidth = maxWidth?.toInt()?.coerceAtLeast(1) ?: Constraints.Infinity),
    )
    val x = if (centered) at.x - layout.size.width / 2f else at.x
    drawText(layout, topLeft = Offset(x, at.y - layout.size.height / 2f))
}
