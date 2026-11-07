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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenEpisodeState
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelf
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelfFolder
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLabel
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLibrary
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val COURSES = listOf("en" to "English", "fr" to "Français", "es" to "Español")
private fun plural(n: Int) = "$n ${if (n == 1) "episode" else "episodes"}"

@Composable
private fun RoomImage(room: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val image by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, room) {
        value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/$room.webp") }
    }
    val palette = AlphonsoColor.palette
    Box(modifier.background(palette.mossDeep)) {
        image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

/** The Listen home (round 6.1, option A): continue card, course switch, level chips, a painted room per folder. All logic is [ListenShelf]. */
@Composable
fun ListenShelfRoot(container: AppContainer, vm: ListenViewModel, onOpenFolder: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val positionsRevision by container.podcastPlayer.positionsRevision.collectAsState()
    val playerEpisode by container.podcastPlayer.state.collectAsState()
    val scope = rememberCoroutineScope()
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

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().background(palette.parchment, RoundedCornerShape(16.dp)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                COURSES.forEach { (code, label) ->
                    val on = code == course
                    Box(
                        Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(if (on) palette.moss else Color.Transparent)
                            .clickable(role = Role.Tab) { course = code }.semantics { selected = on },
                        contentAlignment = Alignment.Center,
                    ) { Text(label, color = if (on) palette.onPrimary else palette.inkSoft, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge) }
                }
            }
        }
        target?.let { t ->
            item {
                val left = ListenShelf.secondsLeft(t.episode, t.progress)
                val number = t.shelf.episodes.indexOfFirst { it.id == t.episode.id } + 1
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 176.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, palette.ember, RoundedCornerShape(24.dp))
                        .clickable(role = Role.Button) { scope.launch { playEpisode(container, t.episode, t.shelf.episodes) } }
                        .clearAndSetSemantics { contentDescription = "Continue listening: ${t.episode.title}, ${ListenShelf.clock(left)} left"; role = Role.Button },
                ) {
                    RoomImage(t.shelf.room, Modifier.matchParentSize())
                    Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(palette.mossDeep.copy(alpha = 0.4f), palette.mossDeep.copy(alpha = 0.9f)))))
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Bottom) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("CONTINUE LISTENING", color = palette.emberSoft, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
                            Text(t.episode.title, color = palette.onPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                            Text(
                                listOfNotNull(t.shelf.level, "Episode $number", if (t.progress == null) ListenShelf.clock(left) else "${ListenShelf.clock(left)} left").joinToString(" · "),
                                color = palette.onPrimary, style = MaterialTheme.typography.bodySmall,
                            )
                            LinearProgressIndicator(progress = { ListenShelf.fraction(t.episode, t.progress).toFloat() }, color = palette.ember, trackColor = palette.onPrimary.copy(alpha = 0.25f), modifier = Modifier.fillMaxWidth())
                        }
                        Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.width(96.dp))
                    }
                }
            }
        }
        if (levels.isNotEmpty()) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (listOf<String?>(null) + levels).forEach { chip ->
                        val on = level == chip
                        Box(
                            Modifier.heightIn(min = 48.dp).clip(CircleShape).background(if (on) palette.moss else palette.parchment)
                                .clickable(role = Role.Tab) { level = chip }
                                .semantics { selected = on; contentDescription = chip?.let { "Level $it" } ?: "All levels" }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text(chip ?: "All", color = if (on) palette.onPrimary else palette.inkSoft, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge) }
                    }
                }
            }
        }
        when {
            state.libraryLoading -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) } }
            state.libraryFailed -> item {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Couldn't load these episodes.", color = palette.inkSoft, style = MaterialTheme.typography.bodyMedium)
                    TextButtonLike("Try again") { scope.launch { vm.loadLibrary() } }
                }
            }
            shown.isEmpty() -> item {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.size(112.dp))
                    Text(
                        if (state.libraryEpisodes.isEmpty()) PodcastLibrary.EMPTY_MESSAGE
                        else "No ${COURSES.first { it.first == course }.second} episodes${level?.let { " at $it" } ?: ""} yet.",
                        color = palette.ink, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium,
                    )
                }
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
private fun TextButtonLike(label: String, onClick: () -> Unit) {
    val palette = AlphonsoColor.palette
    Box(Modifier.heightIn(min = 48.dp).clip(CircleShape).background(palette.moss).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 20.dp), contentAlignment = Alignment.Center) {
        Text(label, color = palette.onPrimary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun RoomTile(shelf: ListenShelfFolder, modifier: Modifier, onClick: () -> Unit) {
    val palette = AlphonsoColor.palette
    val summary = "${shelf.folder.title}, ${shelf.level ?: "all levels"}, ${plural(shelf.episodes.size)}, ${if (shelf.percent == 100) "finished" else "${shelf.percent} percent done"}"
    Box(
        modifier.heightIn(min = 128.dp).clip(RoundedCornerShape(20.dp)).border(2.dp, palette.hairline, RoundedCornerShape(20.dp))
            .clickable(role = Role.Button, onClick = onClick).clearAndSetSemantics { contentDescription = summary; role = Role.Button },
    ) {
        RoomImage(shelf.room, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, palette.mossDeep.copy(alpha = 0.85f)))))
        shelf.level?.let { Text(it, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(8.dp).background(palette.parchment, CircleShape).padding(horizontal = 8.dp)) }
        Column(Modifier.align(Alignment.BottomStart).padding(10.dp)) {
            Text(shelf.folder.title, color = palette.onPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text("${plural(shelf.episodes.size)} · ${if (shelf.percent == 100) "finished ✓" else "${shelf.percent}%"}", color = palette.onPrimary, style = MaterialTheme.typography.labelMedium)
        }
    }
}

/** One folder: the room as header, one continue/start button, and every episode with its state. */
@Composable
fun ListenShelfFolderScreen(container: AppContainer, vm: ListenViewModel, shelf: ListenShelfFolder, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val prog = state.progress.associateBy { it.episodeId }
    val current = ListenShelf.continueListening(listOf(shelf), state.progress)?.episode
    val target = current ?: shelf.episodes.firstOrNull { ListenShelf.state(prog[it.id]) == ListenEpisodeState.New }
    val minutes = maxOf(1, Math.round(shelf.totalSeconds / 60.0).toInt())
    LaunchedEffect(shelf.folder.id) { vm.loadEpisodes(shelf.folder.id) }

    LazyColumn(Modifier.fillMaxSize().background(palette.surface), verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Box(Modifier.fillMaxWidth().heightIn(min = 240.dp)) {
                RoomImage(shelf.room, Modifier.matchParentSize())
                Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, palette.surface))))
                IconButton(onClick = onBack, modifier = Modifier.padding(8.dp).background(palette.parchment, CircleShape)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to Listen", tint = palette.ink) }
                Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        shelf.level?.let { Text(it, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.background(palette.parchment, CircleShape).padding(horizontal = 8.dp)) }
                        Text(shelf.folder.title, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineMedium)
                        Text("Hosted by Alphonso · ${plural(shelf.episodes.size)} · $minutes min", color = palette.inkSoft, style = MaterialTheme.typography.bodySmall)
                    }
                    Image(painterResource(R.drawable.mascot_alphonso), contentDescription = null, modifier = Modifier.width(110.dp))
                }
            }
        }
        target?.let { t ->
            item {
                val number = shelf.episodes.indexOfFirst { it.id == t.id } + 1
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp).heightIn(min = 48.dp).clip(RoundedCornerShape(16.dp)).background(palette.moss)
                        .clickable(role = Role.Button) { scope.launch { playEpisode(container, t, shelf.episodes) } },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = palette.onPrimary)
                    Text("${if (current != null) "Continue" else "Start"} Episode $number", color = palette.onPrimary, fontWeight = FontWeight.Bold)
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
                add("Transcript")
            }.joinToString(" · ")
            Column(Modifier.padding(horizontal = 16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        Modifier.weight(1f).heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(palette.parchment)
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
                        Box(Modifier.size(36.dp).background(if (st == ListenEpisodeState.Done) palette.moss else if (st == ListenEpisodeState.InProgress) palette.emberSoft else palette.surface, CircleShape), contentAlignment = Alignment.Center) {
                            Text(if (st == ListenEpisodeState.Done) "✓" else "$index", color = if (st == ListenEpisodeState.Done) palette.onPrimary else palette.ink, fontWeight = FontWeight.Bold)
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(episode.title, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            if (st == ListenEpisodeState.InProgress) LinearProgressIndicator(progress = { ListenShelf.fraction(episode, p).toFloat() }, color = palette.ember, trackColor = palette.surface, modifier = Modifier.fillMaxWidth())
                            Text(subtitle, color = palette.inkSoft, style = MaterialTheme.typography.bodySmall)
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
