package com.obsidianmedia.learnwithalphonso.ui.listen

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenEpisodeState
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelf
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelfFolder
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLabel
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTimings
import com.obsidianmedia.learnwithalphonso.core.podcast.SleepChoice
import com.obsidianmedia.learnwithalphonso.core.podcast.SleepTimerState
import com.obsidianmedia.learnwithalphonso.core.podcast.TimedLine
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLibrary
import com.obsidianmedia.learnwithalphonso.core.video.LibraryVideo
import com.obsidianmedia.learnwithalphonso.core.video.VideoPracticeTarget
import com.obsidianmedia.learnwithalphonso.core.video.VideoShelf
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsSegmented
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val COURSES = listOf("en" to "English", "fr" to "Français", "es" to "Español")
private fun plural(n: Int) = "$n ${if (n == 1) "episode" else "episodes"}"

@Composable
internal fun RoomImage(room: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val image by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, room) {
        value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/$room.webp") }
    }
    val ds = LocalAlphonsoTokens.current
    Box(modifier.background(ds.hero)) {
        image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

/**
 * The Watch shelf's player sheet and the path-stop deep link into it. Returns the function that opens a video. Shared by
 * the rooms home and by the empty / offline / failed placeholders, so published videos and path video stops stay reachable
 * when there is nothing to list on the podcast side.
 */
@Composable
fun rememberWatchSheet(container: AppContainer, watchVm: WatchViewModel, watch: WatchUiState, onOpenPractice: (VideoPracticeTarget) -> Unit): (LibraryVideo) -> Unit {
    var watching by remember { mutableStateOf<LibraryVideo?>(null) }
    // A path stop for a video lands here: open its player as soon as the videos are known.
    val pendingVideo by container.pendingVideoId.collectAsState()
    LaunchedEffect(pendingVideo, watch.loaded) {
        val id = pendingVideo ?: return@LaunchedEffect
        if (!watch.loaded) return@LaunchedEffect
        container.pendingVideoId.value = null
        watch.videos.firstOrNull { it.id == id }?.let { watching = it }
    }
    watching?.let { video ->
        VideoPlayerSheet(
            video = video,
            onSaveProgress = { watchVm.saveProgress(video.id, it) },
            onPractice = { target -> watching = null; onOpenPractice(target) },
            onDismiss = { watching = null; watchVm.load() },
        )
    }
    return { watching = it }
}

/** The Watch shelf on its own (no rooms): draws nothing when the course has no videos and the read did not fail. */
@Composable
fun WatchShelfHost(container: AppContainer, course: String, onOpenPractice: (VideoPracticeTarget) -> Unit) {
    val watchVm: WatchViewModel = viewModel { WatchViewModel(container.podcastClient) }
    val watch by watchVm.state.collectAsState()
    val openVideo = rememberWatchSheet(container, watchVm, watch, onOpenPractice)
    val videos = VideoShelf.shelf(watch.videos, course)
    if (watch.failed || videos.isNotEmpty()) WatchShelfSection(videos, watch.failed, onRetry = watchVm::load, onOpen = openVideo)
}

/** The Listen home (round 6.1, option A): continue card, course switch, level chips, a painted room per folder. All logic is [ListenShelf]. */
@Composable
fun ListenShelfRoot(container: AppContainer, vm: ListenViewModel, onOpenFolder: (String) -> Unit, onOpenPractice: (VideoPracticeTarget) -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    val positionsRevision by container.podcastPlayer.positionsRevision.collectAsState()
    val playerEpisode by container.podcastPlayer.state.collectAsState()
    val scope = rememberCoroutineScope()
    val watchVm: WatchViewModel = viewModel { WatchViewModel(container.podcastClient) }
    val watch by watchVm.state.collectAsState()
    val openVideo = rememberWatchSheet(container, watchVm, watch, onOpenPractice)
    var course by rememberSaveable(state.courseCode) { mutableStateOf(state.courseCode) }
    var level by rememberSaveable(course) { mutableStateOf<String?>(null) }
    // Back from a folder, or after an episode played, the shelf reflects what was just heard.
    LaunchedEffect(positionsRevision, playerEpisode.episode?.id) { vm.refreshProgress() }

    val shelves = remember(state.allFolders, state.libraryEpisodes, state.progress, course) {
        ListenShelf.shelves(state.allFolders, state.libraryEpisodes, state.progress, course)
    }
    val levels = ListenShelf.levels(shelves)
    val shown = level?.takeIf { it in levels }?.let { l -> shelves.filter { it.level == l } } ?: shelves
    val target = remember(shelves, state.progress) { ListenShelf.continueListening(shelves, state.progress) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        item {
            DsSegmented(COURSES.map { (code, label) -> code to label }, course, { course = it }, "Course")
        }
        ListenShelf.monthChip(state.monthSeconds)?.let { chip ->
            item { DsPill("⏱ $chip", DsPillTone.NEUTRAL) }
        }
        target?.let { t ->
            item {
                val left = ListenShelf.secondsLeft(t.episode, t.progress)
                val number = t.shelf.episodes.indexOfFirst { it.id == t.episode.id } + 1
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 176.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, ds.action, RoundedCornerShape(24.dp))
                        .clickable(role = Role.Button) { scope.launch { playEpisode(container, t.episode, t.shelf.episodes) } }
                        .clearAndSetSemantics { contentDescription = "Continue listening: ${t.episode.title}, ${ListenShelf.clock(left)} left"; role = Role.Button },
                ) {
                    RoomImage(t.shelf.room, Modifier.matchParentSize())
                    Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(ds.hero.copy(alpha = 0.4f), ds.hero.copy(alpha = 0.9f)))))
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Bottom) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("CONTINUE LISTENING", color = ds.onHeroKick, fontWeight = FontWeight.Bold, style = CaptionType)
                            Text(t.episode.title, color = ds.onHero, fontWeight = FontWeight.Bold, style = TitleType)
                            Text(
                                listOfNotNull(t.shelf.level, "Episode $number", if (t.progress == null) ListenShelf.clock(left) else "${ListenShelf.clock(left)} left").joinToString(" · "),
                                color = ds.onHero, style = FootnoteType,
                            )
                            LinearProgressIndicator(progress = { ListenShelf.fraction(t.episode, t.progress).toFloat() }, color = ds.action, trackColor = ds.onHero.copy(alpha = 0.25f), modifier = Modifier.fillMaxWidth())
                        }
                        Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.width(96.dp))
                    }
                }
            }
        }
        val watchVideos = VideoShelf.shelf(watch.videos, course)
        if (watch.failed || watchVideos.isNotEmpty()) {
            item(key = "watch") { WatchShelfSection(watchVideos, watch.failed, onRetry = watchVm::load, onOpen = openVideo) }
        }
        if (levels.isNotEmpty()) {
            item {
                DsChipRow {
                    (listOf<String?>(null) + levels).forEach { chip ->
                        DsChip(chip ?: "All", selected = level == chip, onClick = { level = chip }, accessibilityText = chip?.let { "Level $it" } ?: "All levels")
                    }
                }
            }
        }
        when {
            state.libraryLoading -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) } }
            state.libraryFailed -> item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                    DsEmptyState("Couldn't load these episodes", null, artAsset = "lesson/hmm.webp")
                    AlphonsoSecondaryButton("Try again", onClick = { scope.launch { vm.loadLibrary() } }, fullWidth = false)
                }
            }
            shown.isEmpty() -> item {
                DsEmptyState(
                    if (state.libraryEpisodes.isEmpty()) PodcastLibrary.EMPTY_MESSAGE
                    else "No ${COURSES.first { it.first == course }.second} episodes${level?.let { " at $it" } ?: ""} yet.",
                    null, artAsset = "lesson/happy.webp",
                )
            }
            else -> items(shown.chunked(2), key = { row -> row.first().folder.id }) { pair ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { shelf -> RoomTile(shelf, Modifier.weight(1f)) { onOpenFolder(shelf.folder.id) } }
                    if (pair.size == 1) Box(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun RoomTile(shelf: ListenShelfFolder, modifier: Modifier, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val summary = "${shelf.folder.title}, ${shelf.level ?: "all levels"}, ${plural(shelf.episodes.size)}, ${if (shelf.percent == 100) "finished" else "${shelf.percent} percent done"}"
    Box(
        modifier.heightIn(min = 128.dp).clip(RoundedCornerShape(20.dp)).border(2.dp, ds.line, RoundedCornerShape(20.dp))
            .clickable(role = Role.Button, onClick = onClick).clearAndSetSemantics { contentDescription = summary; role = Role.Button },
    ) {
        RoomImage(shelf.room, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, ds.hero.copy(alpha = 0.85f)))))
        shelf.level?.let { Text(it, color = ds.ink, fontWeight = FontWeight.Bold, style = CaptionType, modifier = Modifier.padding(8.dp).background(ds.card, CircleShape).padding(horizontal = 8.dp)) }
        Column(Modifier.align(Alignment.BottomStart).padding(10.dp)) {
            Text(shelf.folder.title, color = ds.onHero, fontWeight = FontWeight.Bold, style = HeadlineType)
            Text("${plural(shelf.episodes.size)} · ${if (shelf.percent == 100) "finished ✓" else "${shelf.percent}%"}", color = ds.onHero, style = CaptionType)
        }
    }
}

/** One folder: the room as header, one continue/start button, and every episode with its state. */
@Composable
fun ListenShelfFolderScreen(container: AppContainer, vm: ListenViewModel, shelf: ListenShelfFolder, onBack: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val prog = state.progress.associateBy { it.episodeId }
    val current = ListenShelf.continueListening(listOf(shelf), state.progress)?.episode
    val target = current ?: shelf.episodes.firstOrNull { ListenShelf.state(prog[it.id]) == ListenEpisodeState.New }
    val minutes = maxOf(1, Math.round(shelf.totalSeconds / 60.0).toInt())
    LaunchedEffect(shelf.folder.id) { vm.loadEpisodes(shelf.folder.id) }

    LazyColumn(Modifier.fillMaxSize().background(ds.surface), verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Box(Modifier.fillMaxWidth().heightIn(min = 240.dp)) {
                RoomImage(shelf.room, Modifier.matchParentSize())
                Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, ds.surface))))
                IconButton(onClick = onBack, modifier = Modifier.padding(8.dp).background(ds.card, CircleShape)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to Listen", tint = ds.ink) }
                Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        shelf.level?.let { Text(it, color = ds.ink, fontWeight = FontWeight.Bold, style = CaptionType, modifier = Modifier.background(ds.card, CircleShape).padding(horizontal = 8.dp)) }
                        Text(shelf.folder.title, color = ds.ink, fontWeight = FontWeight.Bold, style = DisplayType)
                        Text("Hosted by Alphonso · ${plural(shelf.episodes.size)} · $minutes min", color = ds.inkSoft, style = FootnoteType)
                    }
                    Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.width(110.dp))
                }
            }
        }
        target?.let { t ->
            item {
                val number = shelf.episodes.indexOfFirst { it.id == t.id } + 1
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp).heightIn(min = 48.dp).clip(RoundedCornerShape(16.dp)).background(ds.choice)
                        .clickable(role = Role.Button) { scope.launch { playEpisode(container, t, shelf.episodes) } },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = ds.onHero)
                    Text("${if (current != null) "Continue" else "Start"} Episode $number", color = ds.onHero, fontWeight = FontWeight.Bold)
                }
            }
        }
        items(shelf.episodes, key = { "e-" + it.id }) { episode ->
            val p = prog[episode.id]
            val st = ListenShelf.state(p)
            val left = ListenShelf.secondsLeft(episode, p)
            val subtitle = buildList {
                add(ListenShelf.clock(episode.durationSeconds))
                if (st == ListenEpisodeState.InProgress) add("${ListenShelf.clock(left)} left")
                if (st == ListenEpisodeState.New) add("New")
                if (episode.aiNarrated) add(PodcastLabel.AI_NARRATED)
            }.joinToString(" · ")
            Column(Modifier.padding(horizontal = 16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        Modifier.weight(1f).heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(ds.card)
                            .clickable(role = Role.Button) { scope.launch { playEpisode(container, episode, shelf.episodes) } }
                            .clearAndSetSemantics {
                                contentDescription = "${episode.title}, ${ListenShelf.clock(episode.durationSeconds)}, " + when (st) {
                                    ListenEpisodeState.Done -> "finished"
                                    ListenEpisodeState.InProgress -> "${ListenShelf.clock(left)} left"
                                    ListenEpisodeState.New -> "new"
                                }
                                role = Role.Button
                            }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        val index = shelf.episodes.indexOf(episode) + 1
                        Box(Modifier.size(36.dp).background(if (st == ListenEpisodeState.Done) ds.choice else if (st == ListenEpisodeState.InProgress) ds.xpTint else ds.surface, CircleShape), contentAlignment = Alignment.Center) {
                            Text(if (st == ListenEpisodeState.Done) "✓" else "$index", color = if (st == ListenEpisodeState.Done) ds.onHero else ds.ink, fontWeight = FontWeight.Bold)
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(episode.title, color = ds.ink, fontWeight = FontWeight.Bold, style = HeadlineType)
                            if (st == ListenEpisodeState.InProgress) LinearProgressIndicator(progress = { ListenShelf.fraction(episode, p).toFloat() }, color = ds.action, trackColor = ds.surface, modifier = Modifier.fillMaxWidth())
                            Text(subtitle, color = ds.inkSoft, style = FootnoteType)
                        }
                    }
                    DownloadButton(container, episode)
                }
                if (episode.id in state.quizEpisodeIds) PodcastQuizRowButton(container, episode)
            }
        }
    }
}

private suspend fun playEpisode(container: AppContainer, episode: com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode, queue: List<com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode>) {
    container.podcastPlayer.play(episode, container.downloads.localFile(episode.id)?.toURI()?.toString(), queue)
    container.downloads.markPlayed(episode.id)
}

/**
 * The full-screen player body: the room, Alphonso, the title, a seek bar, back 15 / play / forward 30, the sleep timer and the
 * transcript. With timings ([lines]) the transcript follows the audio line by line and a tapped line seeks. The audio is
 * untouched by opening or closing it; the sheet closes with the standard swipe down.
 */
@Composable
internal fun FullPlayerContent(
    title: String,
    aiNarrated: Boolean,
    elapsed: Double,
    duration: Int,
    control: com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerControl,
    lines: List<TimedLine>?,
    sleep: SleepTimerState,
    onToggle: () -> Unit,
    onSkip: (Double) -> Unit,
    onSeek: (Double) -> Unit,
    onSleep: (SleepChoice) -> Unit,
    onTranscript: () -> Unit,
    onClose: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val left = ListenShelf.clock(duration - elapsed.toInt())
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (lines != null) {
            // With timings the art shrinks to a header so the transcript has the room, as in the mock.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.size(96.dp).clip(RoundedCornerShape(20.dp)).border(2.dp, ds.onHero.copy(alpha = 0.3f), RoundedCornerShape(20.dp))) {
                    RoomImage("radio", Modifier.matchParentSize())
                }
                Column(Modifier.weight(1f)) {
                    Text(title, color = ds.onHero, fontWeight = FontWeight.Bold, style = HeadlineType)
                    Text("Alphonso" + if (aiNarrated) " · ${PodcastLabel.AI_NARRATED}" else "", color = ds.onHero, style = FootnoteType)
                }
            }
            TimedTranscript(lines, elapsed, onSeek)
        } else {
            Box(Modifier.size(240.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, ds.onHero.copy(alpha = 0.3f), RoundedCornerShape(24.dp))) {
                RoomImage("radio", Modifier.matchParentSize())
                Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.align(Alignment.BottomEnd).width(120.dp))
            }
            Text(title, color = ds.onHero, fontWeight = FontWeight.Bold, style = TitleType, textAlign = TextAlign.Center)
            Text("Alphonso" + if (aiNarrated) " · ${PodcastLabel.AI_NARRATED}" else "", color = ds.onHero, style = BodyType)
        }
        Scrubber(elapsed, duration, onSeek)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(ListenShelf.clock(elapsed.toInt()), color = ds.onHero, style = FootnoteType)
            Text("-$left", color = ds.onHero, style = FootnoteType)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
            DsCompactButton("−15", { onSkip(-15.0) })
            Box(Modifier.size(64.dp).background(ds.action, CircleShape), contentAlignment = Alignment.Center) {
                IconButton(onClick = onToggle, modifier = Modifier.size(64.dp)) {
                    val (icon, label) = if (control == com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerControl.PAUSE) Icons.Filled.Pause to "Pause" else Icons.Filled.PlayArrow to "Play"
                    Icon(icon, contentDescription = label, tint = ds.onAction)
                }
            }
            DsCompactButton("+30", { onSkip(30.0) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SleepMenu(sleep, onSleep)
            DsCompactButton("Transcript", onTranscript)
            DsCompactButton("Stop and close", onClose)
        }
    }
}

/** The seek bar: drag or tap to seek; TalkBack reads "Playback position, 1:05 of 4:10" and can adjust it. */
@Composable
internal fun Scrubber(elapsed: Double, duration: Int, onSeek: (Double) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    if (duration <= 0) return
    // While the thumb is dragged the bar follows the finger; the seek happens once, on release.
    var dragging by remember { mutableStateOf<Float?>(null) }
    val shown = dragging ?: elapsed.toFloat().coerceIn(0f, duration.toFloat())
    Slider(
        value = shown,
        onValueChange = { dragging = it },
        onValueChangeFinished = { dragging?.let { onSeek(it.toDouble()) }; dragging = null },
        valueRange = 0f..duration.toFloat(),
        colors = SliderDefaults.colors(thumbColor = ds.action, activeTrackColor = ds.action, inactiveTrackColor = ds.onHero.copy(alpha = 0.25f)),
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = "Playback position"
            stateDescription = "${ListenShelf.clock(shown.toInt())} of ${ListenShelf.clock(duration)}"
        },
    )
}

/** The sleep timer chip: off, 15, 30, 45 minutes or the end of the episode. */
@Composable
private fun SleepMenu(sleep: SleepTimerState, onSleep: (SleepChoice) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = if (sleep.choice == SleepChoice.Off) "Sleep" else "Sleep: ${sleep.choice.label}"
    Box {
        DsCompactButton("☾ $label", { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SleepChoice.entries.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(if (choice == sleep.choice) "✓ ${choice.label}" else choice.label) },
                    onClick = { onSleep(choice); open = false },
                    modifier = Modifier.semantics { selected = choice == sleep.choice },
                )
            }
        }
    }
}

/**
 * The transcript, line by line, following the audio: the line being spoken is bright, the rest dimmed, the current one
 * scrolls to the middle (without animation when the system has animations off) and tapping a line seeks to its start.
 */
@Composable
private fun TimedTranscript(lines: List<TimedLine>, elapsed: Double, onSeek: (Double) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val reduceMotion = remember {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val active = PodcastTimings.activeIndex(lines, elapsed)
    val listState = rememberLazyListState()
    LaunchedEffect(active) {
        if (active < 0) return@LaunchedEffect
        val offset = -(listState.layoutInfo.viewportSize.height / 3)
        if (reduceMotion) listState.scrollToItem(active, offset) else listState.animateScrollToItem(active, offset)
    }
    LazyColumn(state = listState, modifier = Modifier.fillMaxWidth().height(240.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        itemsIndexed(lines) { index, line ->
            Text(
                line.t,
                color = ds.onHero.copy(alpha = if (index == active) 1f else 0.55f),
                fontWeight = if (index == active) FontWeight.Bold else FontWeight.Normal,
                style = BodyType,
                modifier = Modifier.fillMaxWidth().padding(top = if (line.p && index > 0) 8.dp else 0.dp)
                    .clickable(onClickLabel = "Play from here", role = Role.Button) { onSeek(line.s) }
                    .semantics { selected = index == active },
            )
        }
    }
}
