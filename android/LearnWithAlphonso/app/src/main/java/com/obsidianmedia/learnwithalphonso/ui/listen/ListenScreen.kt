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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastDownloadState
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSearch
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTranscript
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastTree
import com.obsidianmedia.learnwithalphonso.podcast.PodcastDownloadRefusal
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.launch

private fun length(seconds: Int) = "%d:%02d".format(seconds / 60, seconds % 60)

/** Port of ListenView.swift: the root of the folder tree with search and the offline listing. */
@Composable
fun ListenScreen(container: AppContainer, vm: ListenViewModel, onOpenFolder: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val isConnected by container.connectivity.isConnected.collectAsState()
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Text("Listen", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 8.dp))
        OutlinedTextField(
            value = state.query, onValueChange = vm::setQuery, singleLine = true,
            placeholder = { Text("Search episodes") },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).semantics { contentDescription = "Search episodes" },
        )
        Spacer(Modifier.height(8.dp))
        when {
            state.query.isNotEmpty() -> SearchResults(container, state, onPlay = { episode -> scope.launch { play(container, episode, state.searchResults) } })
            state.isLoading -> Centered { CircularProgressIndicator(color = palette.moss) }
            state.offline != null || (!isConnected && state.folders.isEmpty()) -> {
                val offline = state.offline ?: emptyList()
                if (offline.isEmpty()) {
                    Centered {
                        Text("You're offline", style = MaterialTheme.typography.titleMedium, color = palette.ink)
                        Text("Download episodes while you have a connection and they'll play here.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
                        AlphonsoSecondaryButton("Try again", onClick = { scope.launch { vm.load() } }, fullWidth = false)
                    }
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { Text("Offline — showing your downloads", style = MaterialTheme.typography.labelMedium, color = palette.ember, fontWeight = FontWeight.SemiBold) }
                        items(offline, key = { it.id }) { episode ->
                            EpisodeRow(container, episode, subtitle = "Downloaded", onPlay = { scope.launch { play(container, episode, offline) } })
                        }
                    }
                }
            }
            state.error != null -> Centered {
                Text("Couldn't load episodes", style = MaterialTheme.typography.titleMedium, color = palette.ink)
                Text(state.error!!, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
                AlphonsoSecondaryButton("Try again", onClick = { scope.launch { vm.load() } }, fullWidth = false)
            }
            else -> FolderListing(container, vm, folderId = null, onOpenFolder = onOpenFolder)
        }
    }
}

/** One level of the tree: child folders, then this folder's episodes. */
@Composable
fun ListenFolderScreen(container: AppContainer, vm: ListenViewModel, folderId: String, onBack: () -> Unit, onOpenFolder: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val folder = state.folders.firstOrNull { it.id == folderId }
    LaunchedEffect(folderId) { vm.loadEpisodes(folderId) }
    Column(Modifier.fillMaxSize().background(palette.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
            Text(folder?.title ?: "Listen", style = MaterialTheme.typography.titleMedium, color = palette.ink)
        }
        FolderListing(container, vm, folderId, onOpenFolder)
    }
}

@Composable
private fun FolderListing(container: AppContainer, vm: ListenViewModel, folderId: String?, onOpenFolder: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
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
            val length = length(episode.durationSeconds)
            EpisodeRow(container, episode, subtitle = if (episode.positionSeconds > 0) "$length · Resume" else length, onPlay = { scope.launch { play(container, episode, episodes) } })
        }
        if (children.isEmpty() && episodes.isEmpty() && !loading) {
            item { Text("Nothing here yet. New episodes appear as they're published.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft) }
        }
        if (loading) item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) } }
    }
}

@Composable
private fun SearchResults(container: AppContainer, state: ListenUiState, onPlay: (PodcastEpisode) -> Unit) {
    val palette = AlphonsoColor.palette
    when {
        PodcastSearch.normalizeQuery(state.query) == null -> Message("Keep typing to search episodes.")
        state.isSearching -> Message("Searching…")
        state.searchResults.isEmpty() -> Message("No episodes match “${state.query}”.")
        else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.searchResults, key = { it.id }) { episode ->
                EpisodeRow(container, episode, subtitle = length(episode.durationSeconds), onPlay = { onPlay(episode) })
            }
        }
    }
    Spacer(Modifier.height(0.dp).background(palette.surface))
}

@Composable
private fun Message(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = AlphonsoColor.palette.inkSoft, modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center)
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
private fun EpisodeRow(container: AppContainer, episode: PodcastEpisode, subtitle: String, onPlay: () -> Unit) {
    val palette = AlphonsoColor.palette
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f).clickable(onClick = onPlay).semantics { contentDescription = "Play ${episode.title}" }) {
            AlphonsoRowCard(episode.title, subtitle, accent = if (episode.positionSeconds > 0) palette.ember else palette.moss, leadingEmoji = "🎧")
        }
        DownloadButton(container, episode)
    }
}

/** Download or remove one episode; a refusal is a prompt naming what could be removed, never a silent deletion. */
@Composable
private fun DownloadButton(container: AppContainer, episode: PodcastEpisode) {
    val palette = AlphonsoColor.palette
    val states by container.downloads.states.collectAsState()
    val scope = rememberCoroutineScope()
    var refusal by remember { mutableStateOf<PodcastDownloadRefusal?>(null) }
    val state = states[episode.id] ?: if (container.downloads.localFile(episode.id) != null) PodcastDownloadState.Downloaded(0) else PodcastDownloadState.NotDownloaded

    fun start() = scope.launch {
        try { container.downloads.download(episode) } catch (e: PodcastDownloadRefusal) { refusal = e }
    }

    when (state) {
        is PodcastDownloadState.Downloading -> CircularProgressIndicator(progress = { state.progress.toFloat() }, color = palette.moss, modifier = Modifier.size(28.dp))
        is PodcastDownloadState.Downloaded -> IconButton(onClick = {
            // Review Focus 1: stop playback before the file goes away.
            container.podcastPlayer.stopIfPlaying(episode.id)
            scope.launch { container.downloads.delete(episode.id) }
        }) { Icon(Icons.Filled.CheckCircle, contentDescription = "Downloaded. Tap to remove.", tint = palette.moss) }
        is PodcastDownloadState.Failed -> IconButton(onClick = { start() }) { Icon(Icons.Filled.Refresh, contentDescription = "Download failed. Tap to retry.", tint = palette.destructive) }
        PodcastDownloadState.NotDownloaded -> IconButton(onClick = { start() }) { Icon(Icons.Filled.Download, contentDescription = "Download for offline", tint = palette.inkSoft) }
    }

    refusal?.let { r ->
        val message = when (r) {
            is PodcastDownloadRefusal.BudgetExceeded ->
                if (r.candidates.isEmpty()) "This episode is larger than the space set aside for downloads."
                else "Remove ${r.candidates.size} downloaded episode${if (r.candidates.size == 1) "" else "s"} to make room, starting with the ones you haven't played."
            is PodcastDownloadRefusal.TransferFailed -> "That download didn't finish. Please try again."
        }
        AlertDialog(
            onDismissRequest = { refusal = null },
            title = { Text(if (r is PodcastDownloadRefusal.BudgetExceeded) "Not enough space set aside" else "Download failed") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { refusal = null }) { Text("OK") } },
        )
    }
}

/** Port of PodcastMiniBar.swift: the control surface; the audio lives in PodcastPlayer above the view tree. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastMiniBar(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val state by container.podcastPlayer.state.collectAsState()
    val episode = state.episode ?: return
    val scope = rememberCoroutineScope()
    var showTranscript by remember { mutableStateOf(false) }
    var transcript by remember(episode.id) { mutableStateOf<String?>(null) }
    var loadingTranscript by remember(episode.id) { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth().background(palette.parchment)) {
        HorizontalDivider(color = palette.hairline)
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Column(Modifier.weight(1f)) {
                Text(episode.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = palette.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${length(state.elapsedSeconds.toInt())} / ${length(episode.durationSeconds)}", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
            }
            IconButton(onClick = { container.podcastPlayer.toggle() }, modifier = Modifier.size(40.dp).background(palette.moss, CircleShape)) {
                Icon(if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (state.isPlaying) "Pause" else "Play", tint = palette.onPrimary)
            }
            state.nextEpisode?.let { next ->
                IconButton(onClick = { scope.launch { play(container, next, state.queue) } }) { Icon(Icons.Filled.SkipNext, contentDescription = "Next episode", tint = palette.inkSoft) }
            }
            IconButton(onClick = {
                showTranscript = true
                if (transcript == null && !loadingTranscript) scope.launch {
                    loadingTranscript = true
                    transcript = runCatching { container.podcastClient.fetchTranscript(episode.id) }.getOrNull() ?: ""
                    loadingTranscript = false
                }
            }) { Icon(Icons.Filled.Notes, contentDescription = "Show transcript", tint = palette.inkSoft) }
            IconButton(onClick = { container.podcastPlayer.close() }) { Icon(Icons.Filled.Close, contentDescription = "Close player", tint = palette.inkSoft) }
        }
    }

    if (showTranscript) {
        ModalBottomSheet(onDismissRequest = { showTranscript = false }, containerColor = palette.surface) {
            Column(Modifier.fillMaxWidth().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(episode.title, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                val paragraphs = PodcastTranscript.paragraphs(transcript ?: "")
                when {
                    loadingTranscript -> CircularProgressIndicator(color = palette.moss)
                    paragraphs.isEmpty() -> Text("This episode doesn't have a transcript yet.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                    else -> paragraphs.forEach { Text(it, style = MaterialTheme.typography.bodyLarge, color = palette.ink) }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}
