package com.obsidianmedia.learnwithalphonso.ui.listen

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.produceState
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
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelf
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastDownloadState
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastDownloadCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastDownloadFailure
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLabel
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLibrary
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerControl
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerPhase
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlaybackCopy
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSearch
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTimings
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTranscript
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTree
import com.obsidianmedia.learnwithalphonso.core.video.VideoPracticeTarget
import com.obsidianmedia.learnwithalphonso.podcast.PodcastDownloadRefusal
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHintLine
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import kotlinx.coroutines.launch

private fun length(seconds: Int) = "%d:%02d".format(seconds / 60, seconds % 60)

/** Port of ListenView.swift: the root of the folder tree with search and the offline listing. */
@Composable
fun ListenScreen(container: AppContainer, vm: ListenViewModel, onOpenFolder: (String) -> Unit, onOpenPractice: (VideoPracticeTarget) -> Unit = {}, onOpenStories: (String) -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    val isConnected by container.connectivity.isConnected.collectAsState()
    val course by container.activeCourse.course.collectAsState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(course) { vm.courseChanged(course.code) }

    DsSceneScreen(DsScene.LISTEN) {
      Column(Modifier.fillMaxSize()) {
        DsGlassTitle("Library", modifier = Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s4))
        DsField(
            value = state.query, onChange = vm::setQuery, placeholder = "Search episodes",
            modifier = Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s2),
        )
        Spacer(Modifier.height(AlphonsoTokens.Space.s2))
        when {
            state.query.isNotEmpty() -> {
                // Only this course's episodes: a search must not reach into another course's folders.
                val results = PodcastLibrary.episodes(state.searchResults, state.folders)
                SearchResults(container, state, results, onPlay = { episode -> scope.launch { play(container, episode, results) } })
            }
            state.isLoading -> Centered { CircularProgressIndicator(color = ds.choice) }
            state.offline != null || (!isConnected && state.folders.isEmpty()) -> {
                val offline = state.offline ?: emptyList()
                if (offline.isEmpty()) {
                    WithWatchShelf(container, state.courseCode, onOpenPractice) {
                        StateCard("You're offline", "Download episodes while you have a connection and they'll play here.", "Try again") { scope.launch { vm.load() } }
                    }
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { DsPill("Offline. Showing your downloads", DsPillTone.GOLD) }
                        items(offline, key = { it.id }) { episode ->
                            EpisodeRow(container, episode, subtitle = PodcastLabel.downloadedSubtitle(episode.aiNarrated), onPlay = { scope.launch { play(container, episode, offline) } })
                        }
                    }
                }
            }
            state.error != null -> WithWatchShelf(container, state.courseCode, onOpenPractice) {
                StateCard("Couldn't load episodes", state.error!!, "Try again") { scope.launch { vm.load() } }
            }
            // No podcasts is a stated state, not a blank list; the Watch shelf still shows above it when the course has
            // published videos. With neither podcasts nor videos the shelf draws nothing and this is all there is.
            state.folders.isEmpty() -> WithWatchShelf(container, state.courseCode, onOpenPractice) {
                StateCard(PodcastLibrary.emptyTitle(state.courseCode), PodcastLibrary.EMPTY_MESSAGE, "Refresh") { scope.launch { vm.load() } }
            }
            // The Listen home is the rooms shelf (ListenShelfUi.kt); a folder opens its own episode list.
            else -> ListenShelfRoot(container, vm, onOpenFolder, onOpenPractice, onOpenStories)
        }
      }
    }
}

/** An empty, offline or failed state: Alphonso on a glass card over the scene, one action under it. */
@Composable
private fun StateCard(title: String, message: String, action: String, onAction: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        DsEmptyState(title, message, artAsset = "lesson/hmm.webp")
        AlphonsoSecondaryButton(action, onClick = onAction, fullWidth = false)
    }
}

/** One level of the tree: child folders, then this folder's episodes. */
@Composable
fun ListenFolderScreen(container: AppContainer, vm: ListenViewModel, folderId: String, onBack: () -> Unit, onOpenFolder: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    val folder = state.folders.firstOrNull { it.id == folderId }
    LaunchedEffect(folderId) { vm.loadEpisodes(folderId) }
    // A folder that directly holds episodes opens as a room with its episode list; any other folder keeps the tree listing.
    val shelf = remember(state.allFolders, state.libraryEpisodes, state.progress, folderId) {
        listOf("en", "fr", "es").flatMap { ListenShelf.shelves(state.allFolders, state.libraryEpisodes, state.progress, it) }.firstOrNull { it.folder.id == folderId }
    }
    if (shelf != null) {
        ListenShelfFolderScreen(container, vm, shelf, onBack)
        return
    }
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = ds.choice) }
            Text(folder?.title ?: "Library", style = HeadlineType, color = ds.ink)
        }
        FolderListing(container, vm, folderId, onOpenFolder)
    }
}

@Composable
private fun FolderListing(container: AppContainer, vm: ListenViewModel, folderId: String?, onOpenFolder: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    // Rows show what this device last stored: refresh them when that changes (for example after closing the player).
    val positionsRevision by container.podcastPlayer.positionsRevision.collectAsState()
    val scope = rememberCoroutineScope()
    val children = PodcastTree.children(folderId, state.folders)
    val episodes = folderId?.let { state.episodesByFolder[it] } ?: emptyList()
    val loading = folderId != null && state.loadingFolderId == folderId
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(children, key = { "f-" + it.id }) { child ->
            Box(Modifier.clickable { onOpenFolder(child.id) }) {
                AlphonsoRowCard(child.title, child.description ?: "Browse episodes", leadingEmoji = "📁")
            }
        }
        items(episodes, key = { "e-" + it.id }) { episode ->
            // The list is a snapshot from when the folder opened: show the position this device last stored, if newer.
            val shown = remember(positionsRevision, episode) { container.podcastPlayer.resumed(episode) }
            EpisodeRow(container, shown, subtitle = PodcastLabel.rowSubtitle(shown.durationSeconds, resume = shown.positionSeconds > 0, aiNarrated = shown.aiNarrated), hasQuiz = episode.id in state.quizEpisodeIds, onPlay = { scope.launch { play(container, episode, episodes) } })
        }
        if (children.isEmpty() && episodes.isEmpty() && !loading) {
            item { Text("Nothing here yet. New episodes appear as they're published.", style = BodyType, color = ds.inkSoft) }
        }
        if (loading) item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) } }
    }
}

@Composable
private fun SearchResults(container: AppContainer, state: ListenUiState, results: List<PodcastEpisode>, onPlay: (PodcastEpisode) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    when {
        PodcastSearch.normalizeQuery(state.query) == null -> Message("Keep typing to search episodes.")
        state.isSearching -> Message("Searching…")
        results.isEmpty() -> Message("No episodes match “${state.query}”.")
        else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(results, key = { it.id }) { episode ->
                EpisodeRow(container, episode, subtitle = PodcastLabel.rowSubtitle(episode.durationSeconds, resume = false, aiNarrated = episode.aiNarrated), onPlay = { onPlay(episode) })
            }
        }
    }
    Spacer(Modifier.height(0.dp).background(ds.surface))
}

@Composable
private fun Message(text: String) {
    Text(text, style = BodyType, color = LocalAlphonsoTokens.current.inkSoft, modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center)
}

/** The podcast-side placeholder (empty, offline, failed) under the Watch shelf, which draws nothing when there are no videos. */
@Composable
private fun WithWatchShelf(container: AppContainer, course: String, onOpenPractice: (VideoPracticeTarget) -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.padding(horizontal = 16.dp)) { WatchShelfHost(container, course, onOpenPractice) }
        Box(Modifier.weight(1f)) { content() }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) { content() }
}

private suspend fun play(container: AppContainer, episode: PodcastEpisode, queue: List<PodcastEpisode>) {
    container.podcastPlayer.play(episode, container.downloads.localFile(episode.id)?.toURI()?.toString(), queue)
    container.downloads.markPlayed(episode.id)
}

@Composable
private fun EpisodeRow(container: AppContainer, episode: PodcastEpisode, subtitle: String, onPlay: () -> Unit, hasQuiz: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    Column {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).clickable(onClick = onPlay).clearAndSetSemantics { contentDescription = "Play ${episode.title}"; role = androidx.compose.ui.semantics.Role.Button }) {
                AlphonsoRowCard(episode.title, subtitle, accent = if (episode.positionSeconds > 0) ds.action else ds.choice, leadingEmoji = "🎧")
            }
            DownloadButton(container, episode)
        }
        if (hasQuiz) PodcastQuizRowButton(container, episode)
    }
}

/** Download or remove one episode; a refusal is a prompt naming what could be removed, never a silent deletion. */
@Composable
internal fun DownloadButton(container: AppContainer, episode: PodcastEpisode) {
    val ds = LocalAlphonsoTokens.current
    val states by container.downloads.states.collectAsState()
    val scope = rememberCoroutineScope()
    var refusal by remember { mutableStateOf<PodcastDownloadRefusal?>(null) }
    val state = states[episode.id] ?: if (container.downloads.localFile(episode.id) != null) PodcastDownloadState.Downloaded(0) else PodcastDownloadState.NotDownloaded

    fun start() = scope.launch {
        try { container.downloads.download(episode) } catch (e: PodcastDownloadRefusal) { refusal = e }
    }

    when (state) {
        is PodcastDownloadState.Downloading -> CircularProgressIndicator(progress = { state.progress.toFloat() }, color = ds.choice, modifier = Modifier.size(28.dp))
        is PodcastDownloadState.Downloaded -> IconButton(onClick = {
            // Review Focus 1: stop playback before the file goes away.
            container.podcastPlayer.stopIfPlaying(episode.id)
            scope.launch { container.downloads.delete(episode.id) }
        }) { Icon(Icons.Filled.CheckCircle, contentDescription = "Downloaded. Tap to remove.", tint = ds.choice) }
        is PodcastDownloadState.Failed -> IconButton(onClick = { start() }) { Icon(Icons.Filled.Refresh, contentDescription = "Download failed. Tap to retry.", tint = ds.wrong) }
        PodcastDownloadState.NotDownloaded -> IconButton(onClick = { start() }) { Icon(Icons.Filled.Download, contentDescription = "Download for offline", tint = ds.inkSoft) }
    }

    refusal?.let { r ->
        val failure = when (r) {
            is PodcastDownloadRefusal.BudgetExceeded -> PodcastDownloadFailure.BudgetExceeded(r.candidates, r.neededBytes)
            is PodcastDownloadRefusal.TransferFailed -> r.failure
        }
        AlertDialog(
            onDismissRequest = { refusal = null },
            title = { Text(PodcastDownloadCopy.title(failure)) },
            text = { Text(PodcastDownloadCopy.message(failure)) },
            confirmButton = { TextButton(onClick = { refusal = null }) { Text("OK") } },
        )
    }
}

/** Port of PodcastMiniBar.swift: the control surface; the audio lives in PodcastPlayer above the view tree. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastMiniBar(container: AppContainer) {
    val ds = LocalAlphonsoTokens.current
    val state by container.podcastPlayer.state.collectAsState()
    val episode = state.episode ?: return
    val scope = rememberCoroutineScope()
    var showTranscript by remember { mutableStateOf(false) }
    var transcript by remember(episode.id) { mutableStateOf<String?>(null) }
    var loadingTranscript by remember(episode.id) { mutableStateOf(false) }
    // The language of the episode's text: its ROOT folder's course. Unknown (folders not readable) means no saving rather than a guess.
    var transcriptCourse by remember(episode.id) { mutableStateOf<String?>(null) }

    var expanded by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current
    // The bundled timing file (episode id to timed lines), read once.
    val timings = remember {
        runCatching { PodcastTimings.decode(context.assets.open("podcast-timings.json").bufferedReader().use { it.readText() }) }.getOrDefault(emptyMap())
    }
    val sleep by container.podcastPlayer.sleep.collectAsState()
    // The follow-along needs the transcript text; read it once when the full player opens (the panel shares it).
    LaunchedEffect(expanded, episode.id) {
        if (expanded && transcript == null && !loadingTranscript) {
            loadingTranscript = true
            transcriptCourse = runCatching { PodcastLibrary.courseOf(episode.folderId, container.podcastClient.fetchFolders()) }.getOrNull()
            transcript = runCatching { container.podcastClient.fetchTranscript(episode.id) }.getOrNull() ?: ""
            loadingTranscript = false
        }
    }
    // Round 6.1 "mini player": a navy pill with the episode's room as art, the title, minutes left and a gold play button,
    // a thin gold progress line along its foot. The quiz offer sits above it, on the surface.
    val folders by container.podcastFolders.collectAsState()
    val room = folders.firstOrNull { it.id == episode.folderId }?.let { ListenShelf.room(it) } ?: "radio"
    Column(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s3).padding(bottom = AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        // The quiz is offered once the episode has played to its end (and only if it has one the learner can see).
        PodcastQuizOfferRow(container, episode, finished = state.phase == PodcastPlayerPhase.Finished)
        val pill = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
        Box(Modifier.fillMaxWidth().shadow(AlphonsoTokens.Space.s2, pill, clip = false, ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint).clip(pill).background(ds.hero)) {
            Row(Modifier.fillMaxWidth().padding(start = AlphonsoTokens.Space.s2, end = AlphonsoTokens.Space.s3, top = AlphonsoTokens.Space.s2, bottom = AlphonsoTokens.Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                Row(
                    Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = androidx.compose.ui.semantics.Role.Button) { expanded = true }.clearAndSetSemantics { contentDescription = "Open player: ${episode.title}, ${ListenShelf.clock(episode.durationSeconds - state.elapsedSeconds.toInt())} left"; role = androidx.compose.ui.semantics.Role.Button },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                ) {
                    RoomImage(room, Modifier.size(AlphonsoTokens.Space.s12).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)))
                    Column(Modifier.weight(1f)) {
                        Text(episode.title, style = FootnoteType, fontWeight = FontWeight.ExtraBold, color = ds.onHero, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val failure = state.failure
                        when {
                            failure != null -> Text(PodcastPlaybackCopy.message(failure), style = CaptionType, color = ds.onHeroKick)
                            state.phase == PodcastPlayerPhase.Buffering -> Text(PodcastPlaybackCopy.BUFFERING_LABEL, style = CaptionType, color = ds.onHeroSoft)
                            else -> Text("Alphonso · ${ListenShelf.clock(episode.durationSeconds - state.elapsedSeconds.toInt())} left", style = CaptionType, color = ds.onHeroSoft)
                        }
                    }
                }
                // Only a confirmed player shows Pause; a loading one shows a spinner; a failed one offers Retry.
                Box(Modifier.size(AlphonsoTokens.Space.minTouch).background(ds.action, CircleShape), contentAlignment = Alignment.Center) {
                    when (state.control) {
                        PodcastPlayerControl.SPINNER -> {
                            CircularProgressIndicator(color = ds.onAction, strokeWidth = 2.dp, modifier = Modifier.size(AlphonsoTokens.Space.s5).semantics { contentDescription = "Loading" })
                        }
                        else -> IconButton(onClick = { container.podcastPlayer.toggle() }, modifier = Modifier.size(AlphonsoTokens.Space.minTouch)) {
                            val label = com.obsidianmedia.learnwithalphonso.core.podcast.MiniBarPresentation.toggleLabel(state.control, PodcastPlaybackCopy.RETRY_TITLE)
                            val icon = when (state.control) {
                                PodcastPlayerControl.PAUSE -> Icons.Filled.Pause
                                PodcastPlayerControl.RETRY -> Icons.Filled.Refresh
                                else -> Icons.Filled.PlayArrow
                            }
                            Icon(icon, contentDescription = label, tint = ds.onAction)
                        }
                    }
                }
            }
            // The thin gold progress line along the foot of the pill.
            val fraction = if (episode.durationSeconds > 0) (state.elapsedSeconds / episode.durationSeconds).toFloat().coerceIn(0f, 1f) else 0f
            Box(Modifier.align(Alignment.BottomStart).padding(horizontal = AlphonsoTokens.Space.s4).fillMaxWidth().height(3.dp).clip(CircleShape).background(ds.onHero.copy(alpha = 0.2f)).clearAndSetSemantics { }) {
                Box(Modifier.fillMaxWidth(fraction).height(3.dp).background(ds.xp))
            }
        }
    }

    if (expanded) {
        ModalBottomSheet(onDismissRequest = { expanded = false }, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.hero) {
            FullPlayerContent(
                title = episode.title, aiNarrated = episode.aiNarrated, elapsed = state.elapsedSeconds, duration = episode.durationSeconds,
                control = state.control, onToggle = { container.podcastPlayer.toggle() },
                lines = PodcastTimings.linesMatching(timings[episode.id], transcript),
                sleep = sleep,
                onSleep = { container.podcastPlayer.setSleep(it) },
                onSeek = { container.podcastPlayer.seek(it) },
                onSkip = { container.podcastPlayer.skip(it) },
                onTranscript = {
                    expanded = false
                    showTranscript = true
                    if (transcript == null && !loadingTranscript) scope.launch {
                        loadingTranscript = true
                        transcriptCourse = runCatching { PodcastLibrary.courseOf(episode.folderId, container.podcastClient.fetchFolders()) }.getOrNull()
                        transcript = runCatching { container.podcastClient.fetchTranscript(episode.id) }.getOrNull() ?: ""
                        loadingTranscript = false
                    }
                },
                onClose = { expanded = false; container.podcastPlayer.close() },
                onNext = state.nextEpisode?.let { next -> { scope.launch { play(container, next, state.queue) } } },
            )
        }
    }

    if (showTranscript) {
        ModalBottomSheet(onDismissRequest = { showTranscript = false }, containerColor = ds.surface) {
          SaveWordHost(container) {
            Column(Modifier.fillMaxWidth().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(episode.title, style = HeadlineType, color = ds.ink)
                val paragraphs = PodcastTranscript.paragraphs(transcript ?: "")
                when {
                    loadingTranscript -> CircularProgressIndicator(color = ds.choice)
                    paragraphs.isEmpty() -> Text("This episode doesn't have a transcript yet.", style = BodyType, color = ds.inkSoft)
                    else -> {
                        val saveWord = LocalSaveWordHandler.current
                        val course = transcriptCourse
                        if (course != null && saveWord != null) SaveWordHintLine(container, SavedWordCopy.TRANSCRIPT_HINT, limited = false)
                        paragraphs.forEach { paragraph ->
                            // A transcript is in the language of its episode's root folder (PodcastLibrary.courseOf).
                            if (course != null && saveWord != null) TappableText(paragraph, course, SaveWordMode.AllWords, saveWord, style = BodyType, color = ds.ink)
                            else Text(paragraph, style = BodyType, color = ds.ink)
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
          }
        }
    }
}
