package com.obsidianmedia.learnwithalphonso.ui.listen

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.heading
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.audio.AudioPlayback
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClientError
import com.obsidianmedia.learnwithalphonso.core.podcast.BranchingStory
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizOffer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizResult
import com.obsidianmedia.learnwithalphonso.core.podcast.Stories
import com.obsidianmedia.learnwithalphonso.core.podcast.Story
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryNarration
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryRecordings
import com.obsidianmedia.learnwithalphonso.core.podcast.StorySummary
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Graded stories (docs/superpowers/specs/2026-11-17-graded-stories-design.md): the reading analog of the Listen library.
 * Port of StoriesViews.swift; mirrors the web's StoriesLibrary, StoryReader and StoryCheck. The rules are
 * [Stories], [StoryNarration] and [com.obsidianmedia.learnwithalphonso.core.net.StoriesClient] in core (JVM tests); this
 * file only draws them. StoriesSourceGuardsTest pins the wiring.
 */

/** The stories for the course on screen, read on their own so a failed read never hides the podcasts. */
class StoriesFeed(val stories: List<StorySummary>, val loading: Boolean, val failed: Boolean, val retry: () -> Unit)

@Composable
fun rememberStories(container: AppContainer, courseCode: String): StoriesFeed {
    var stories by remember { mutableStateOf<List<StorySummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(courseCode, reload) {
        loading = true
        failed = false
        try {
            stories = container.storiesClient.fetchStories(courseCode)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failed = true
        }
        loading = false
    }
    return StoriesFeed(stories, loading, failed) { reload++ }
}

/** One story row of the Stories tab: title and status ("Choose your path" for a branching story), one button. */
@Composable
private fun StoryRow(story: StorySummary, onOpen: (String) -> Unit) {
    val status = Stories.status(story)
    Box(
        Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(story.id) }
            .clearAndSetSemantics { contentDescription = "${story.title}, $status"; role = Role.Button },
    ) {
        AlphonsoRowCard(story.title, status, leadingEmoji = if (story.branching) "🧭" else "📚")
    }
}

/** The Library's Stories tab: published stories grouped by level. A failed load is never shown as an empty library. */
fun LazyListScope.storiesFullItems(feed: StoriesFeed, courseCode: String, onOpen: (String) -> Unit) {
    val groups = Stories.groupByLevel(Stories.visible(feed.stories, courseCode))
    when {
        feed.loading -> item(key = "stories-loading") { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        feed.failed -> item(key = "stories-failed") {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                DsEmptyState("Couldn't load stories", "Check your connection and try again.", artAsset = "lesson/hmm.webp")
                AlphonsoSecondaryButton("Try again", onClick = feed.retry, fullWidth = false)
            }
        }
        groups.isEmpty() -> item(key = "stories-empty") { DsEmptyState(StoryCopy.EMPTY_TITLE, StoryCopy.EMPTY_MESSAGE, artAsset = "lesson/happy.webp") }
        else -> groups.forEach { group ->
            item(key = "level-${group.level}") { DsOverline(Stories.levelLabel(group.level)) }
            items(group.stories, key = { it.id }) { story -> StoryRow(story, onOpen) }
        }
    }
}

/** The All tab's one-row peek at Stories, with "See all". Draws nothing while loading, when there are none, or on a failed read (the failure shows on the Stories tab). */
@Composable
fun StoriesPeekSection(feed: StoriesFeed, courseCode: String, onOpen: (String) -> Unit, onSeeAll: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shown = Stories.visible(feed.stories, courseCode).take(LIBRARY_PEEK_COUNT)
    if (feed.loading || feed.failed || shown.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Stories", color = ds.ink, style = TitleType, modifier = Modifier.semantics { heading() })
            Text(
                "See all", color = ds.choice, fontWeight = FontWeight.Bold, style = FootnoteType,
                modifier = Modifier.clickable(role = Role.Button, onClick = onSeeAll)
                        .clearAndSetSemantics { contentDescription = "See all stories"; role = Role.Button }
                        .heightIn(min = AlphonsoTokens.Space.minTouch).wrapContentHeight(Alignment.CenterVertically).padding(horizontal = AlphonsoTokens.Space.s1),
            )
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            items(shown, key = { it.id }) { story ->
                val status = Stories.status(story)
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
                Column(
                    Modifier.width(168.dp).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
                        .clickable(role = Role.Button) { onOpen(story.id) }
                        .clearAndSetSemantics { contentDescription = "${story.title}, ${story.level}, $status"; role = Role.Button }
                        .padding(AlphonsoTokens.Space.s3),
                    verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(if (story.branching) "🧭" else "📚", style = TitleType)
                        Text(story.level, color = ds.choice, fontWeight = FontWeight.Bold, style = CaptionType, modifier = Modifier.background(ds.choiceTint, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp))
                    }
                    Text(story.title, color = ds.ink, fontWeight = FontWeight.Bold, style = HeadlineType)
                    Text(status, color = ds.inkSoft, style = CaptionType)
                }
            }
        }
    }
}

/** Published stories grouped by level, like the Listen library. A failed load is never shown as an empty library. */
@Composable
fun StoriesLibraryScreen(container: AppContainer, courseCode: String, onBack: () -> Unit, onOpen: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var stories by remember { mutableStateOf<List<StorySummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(courseCode, reload) {
        loading = true
        failed = false
        try {
            stories = container.storiesClient.fetchStories(courseCode)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failed = true
        }
        loading = false
    }
    BackHandler(onBack = onBack)
    val groups = Stories.groupByLevel(Stories.visible(stories, courseCode))
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        StoriesTopBar("Stories", onBack)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
            failed -> Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                DsEmptyState("Couldn't load stories", "Check your connection and try again.", artAsset = "lesson/hmm.webp")
                AlphonsoSecondaryButton("Try again", onClick = { reload++ }, fullWidth = false)
            }
            groups.isEmpty() -> Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter)) {
                DsEmptyState(StoryCopy.EMPTY_TITLE, StoryCopy.EMPTY_MESSAGE, artAsset = "lesson/happy.webp")
            }
            else -> LazyColumn(contentPadding = PaddingValues(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                groups.forEach { group ->
                    item(key = "level-${group.level}") { DsOverline(Stories.levelLabel(group.level)) }
                    items(group.stories, key = { it.id }) { story ->
                        val status = Stories.status(story)
                        Box(
                            Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(story.id) }
                                .clearAndSetSemantics { contentDescription = "${story.title}, $status"; role = Role.Button },
                        ) {
                            AlphonsoRowCard(story.title, status, leadingEmoji = "📚")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StoriesTopBar(title: String, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s1), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = ds.choice) }
        Text(title, style = HeadlineType, color = ds.ink)
    }
}

private sealed interface StoryLoad {
    data object Loading : StoryLoad
    data object Missing : StoryLoad
    data object Failed : StoryLoad
    data class Ready(val story: Story) : StoryLoad
    data class Branching(val story: BranchingStory) : StoryLoad
}

/** Loads one story, then shows the read-along. */
@Composable
fun StoryReaderScreen(container: AppContainer, storyId: String, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var load by remember(storyId) { mutableStateOf<StoryLoad>(StoryLoad.Loading) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(storyId, reload) {
        load = StoryLoad.Loading
        load = try {
            // A branching story has no top-level sentences, so the linear read finds nothing and the node graph is tried.
            container.storiesClient.fetchStory(storyId)?.let { StoryLoad.Ready(it) }
                ?: container.storiesClient.fetchBranchingStory(storyId)?.let { StoryLoad.Branching(it) }
                ?: StoryLoad.Missing
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            StoryLoad.Failed
        }
    }
    BackHandler(onBack = onBack)
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        val current = load
        StoriesTopBar((current as? StoryLoad.Ready)?.story?.title ?: (current as? StoryLoad.Branching)?.story?.title ?: "Story", onBack)
        when (current) {
            StoryLoad.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
            StoryLoad.Missing -> Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter)) {
                DsEmptyState("Story not found", "It may not be available yet.", artAsset = "lesson/hmm.webp")
            }
            StoryLoad.Failed -> Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.gutter), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                DsEmptyState("We couldn't load this story", "Check your connection and try again.", artAsset = "lesson/hmm.webp")
                AlphonsoSecondaryButton("Try again", onClick = { reload++ }, fullWidth = false)
            }
            is StoryLoad.Ready -> StoryReader(container, current.story)
            is StoryLoad.Branching -> BranchingStoryReader(container, current.story)
        }
    }
}

/**
 * Reads a story one sentence at a time, handing the highlight from sentence to sentence as each one ends. A sentence with a
 * pre-recorded file (StoryRecordings, made by scripts/story-audio.ts) just plays it: no /api/tts call, no AI quota, no AI
 * consent. Only a sentence with no recording (or whose file will not download or play) falls back to the live /api/tts voice
 * (the learner's chosen Alphonso voice), which keeps today's consent and quota. The next sentence is fetched while the current
 * one plays. Sentence-level highlight is v1, like the web. [scope] is the screen's, so leaving the story stops the narration.
 */
internal class StoryNarrator(
    private val container: AppContainer,
    private val story: Story,
    private val scope: CoroutineScope,
    private val playback: AudioPlayback,
) {
    private val _state = MutableStateFlow(StoryNarration(story.segments.size))
    val state: StateFlow<StoryNarration> = _state.asStateFlow()
    private var job: Job? = null
    /** A failed fetch is a value, not an exception: a prefetch nobody awaits must not cancel the screen's scope. */
    private val cache = HashMap<Int, Deferred<Result<NarrationAudio>>>()
    private var recordings: StoryRecordings? = null
    private var recordingsLoaded = false
    /** Set by [begin]: whether a sentence with no recording may use the live voice (AI speech is on). */
    private var liveSpeechAllowed = false

    /**
     * Looks up the story's recordings (once), then plays from [index]. A fully recorded story needs no AI consent; otherwise
     * the live fallback does, exactly as before ([StoryRecordings.canNarrate]).
     */
    fun begin(index: Int, aiConsentGranted: Boolean, onSegment: (Int) -> Unit) {
        scope.launch {
            if (!recordingsLoaded) {
                recordings = container.storyRecordings.load(story.id)
                // A failed load (offline, no manifest yet) is not kept, so a later tap looks again.
                recordingsLoaded = recordings != null
            }
            liveSpeechAllowed = aiConsentGranted
            if (StoryRecordings.canNarrate(story.segments, recordings, aiConsentGranted)) play(index, onSegment) else markUnavailable()
        }
    }

    /** Plays from [index] to the end. [onSegment] is told each sentence as it starts (the saved position). */
    fun play(index: Int, onSegment: (Int) -> Unit) {
        stop()
        _state.value = _state.value.start(index)
        job = scope.launch {
            while (true) {
                val current = _state.value.current ?: break
                onSegment(current)
                val ahead = Stories.nextSegment(current, story.segments.size)
                val played = try {
                    val audio = audioFor(current).await().getOrThrow()
                    if (ahead != null) audioFor(ahead)
                    playback.play(audio.bytes) ||
                        // A recording that will not play (an unreadable file) falls back to live speech for this sentence.
                        (StoryRecordings.speakLiveAfterPlayFailure(audio.recorded, liveSpeechAllowed) &&
                            playback.play(audioFor(current, live = true).await().getOrThrow().bytes))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    cache.remove(current)
                    false
                }
                if (!played) {
                    _state.value = _state.value.fail()
                    return@launch
                }
                _state.value = _state.value.finishedCurrent()
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        playback.stop()
        _state.value = _state.value.stop()
    }

    /** Narration cannot start without AI speech turned on; the text stays readable. */
    fun markUnavailable() { _state.value = _state.value.fail() }

    /** [live] skips the recording (its file would not play) and asks the live voice, replacing the cached audio. */
    private fun audioFor(index: Int, live: Boolean = false): Deferred<Result<NarrationAudio>> {
        if (!live) cache[index]?.let { return it }
        return scope.async {
            runCatching {
                // The recording first: a plain public file, nothing to authorise or pay for.
                if (!live) {
                    recordings?.pathFor(story.segments[index])?.let { path ->
                        container.storyRecordings.audio(path)?.let { return@runCatching NarrationAudio(it, recorded = true) }
                    }
                }
                check(liveSpeechAllowed) { "live narration needs AI consent" }
                NarrationAudio(
                    container.aiClient.synthesizeSpeech(
                        story.segments[index],
                        voice = container.voicePrefs.voice(VoiceCharacter.Alphonso, story.course),
                        course = story.course,
                    ),
                    recorded = false,
                )
            }
        }.also { cache[index] = it }
    }

    /** A sentence's audio and whether it is the recording (so a file that will not play can fall back to live speech). */
    private class NarrationAudio(val bytes: ByteArray, val recorded: Boolean)
}

@Composable
private fun StoryReader(container: AppContainer, story: Story) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val course = remember(story.course) { Course.fromCode(story.course) }
    val narrator = remember(story.id) { StoryNarrator(container, story, scope, container.newPlayback()) }
    val narration by narrator.state.collectAsState()
    DisposableEffect(narrator) { onDispose { narrator.stop() } }
    val consent by container.aiConsent.state.collectAsState()
    val hasAiConsent = container.aiConsent.statusOf(consent) == AiConsentStatus.GRANTED
    var showCheck by remember { mutableStateOf(false) }
    var checked by remember { mutableStateOf<PodcastQuizResult?>(null) }
    var progressStopped by remember { mutableStateOf(false) }
    val resumeAt = if (story.segmentIndex < story.segments.size) story.segmentIndex else 0
    val listState = rememberLazyListState()

    // Keeps the sentence being read in view.
    LaunchedEffect(narration.current) {
        narration.current?.let { listState.animateScrollToItem(it + LEADING_ITEMS) }
    }

    fun start(from: Int) {
        narrator.begin(from, hasAiConsent) { segment ->
            if (progressStopped) return@begin
            // Garnish, like the podcast position: a failed save never interrupts reading. A rejected token stops further saves.
            scope.launch {
                try {
                    container.storiesClient.saveProgress(story.id, segment)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: PodcastClientError.Unauthorized) {
                    progressStopped = true
                } catch (e: Exception) {
                    // Never interrupts reading.
                }
            }
        }
    }

    SaveWordHost(container) {
        val saveWord = LocalSaveWordHandler.current
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            item(key = "title") { DsGlassTitle(story.title, Stories.levelLabel(story.level)) }
            item(key = "hint") { Text(StoryCopy.TAP_HINT, style = CaptionType, color = ds.inkSoft) }
            itemsIndexed(story.segments, key = { index, _ -> "segment-$index" }) { index, segment ->
                val active = narration.current == index
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
                Box(
                    Modifier.fillMaxWidth().background(if (active) ds.choiceTint else ds.surface, shape)
                        .border(BorderStroke(AlphonsoTokens.Space.s1 / 2, if (active) ds.choice else ds.surface), shape)
                        .padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2)
                        .semantics(mergeDescendants = true) { if (active) stateDescription = "Reading now" },
                ) {
                    if (saveWord != null) {
                        TappableText(
                            segment, story.course, SaveWordMode.AllWords,
                            // A tapped word is spoken as well as defined; the narration stops so the two never overlap.
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
            item(key = "controls") {
                Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                    if (narration.playing) {
                        DsCompactButton("Pause narration", { narrator.stop() }, primary = true)
                    } else {
                        DsCompactButton(if (resumeAt > 0) "Continue listening" else "Listen", { start(resumeAt) }, primary = true)
                        if (resumeAt > 0) DsCompactButton("From the start", { start(0) })
                    }
                }
            }
            if (narration.failed) item(key = "failed") {
                Text(if (hasAiConsent) StoryCopy.NARRATION_UNAVAILABLE else StoryCopy.NARRATION_NEEDS_AI, style = FootnoteType, color = ds.inkSoft)
            }
            if (story.questions.isNotEmpty()) item(key = "check") {
                DsCard {
                    DsOverline(StoryCopy.CHECK_TITLE)
                    checked?.let { result ->
                        Text("${result.correct} of ${result.total} correct", style = DisplayType, color = ds.ink)
                        Text(StoryCopy.COUNTS_LINE, style = FootnoteType, color = ds.inkSoft)
                    }
                    DsCompactButton(if (checked == null) "Start the check" else "Take the check again", { showCheck = true }, primary = checked == null)
                }
            }
        }
    }

    if (showCheck) {
        PodcastQuizSheet(
            container, story.title, story.id, PodcastQuizOffer(story.questions, null),
            onSaved = { checked = it },
            onDismiss = { showCheck = false },
            // The server grades from the stored key: only the chosen answers are sent.
            submit = { answers, _ -> container.storiesClient.submitCheck(story.id, answers) },
            resultNote = { StoryCopy.COUNTS_LINE },
        )
    }
}

/** The title and the hint come before the first sentence in the list. */
private const val LEADING_ITEMS = 2
