package com.obsidianmedia.learnwithalphonso.ui.listen

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.view.SurfaceView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewModelScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.obsidianmedia.learnwithalphonso.Analytics
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.video.LibraryVideo
import com.obsidianmedia.learnwithalphonso.core.video.VideoPracticeTarget
import com.obsidianmedia.learnwithalphonso.core.video.VideoShelf
import com.obsidianmedia.learnwithalphonso.core.video.VideoState
import com.obsidianmedia.learnwithalphonso.core.video.WebVtt
import com.obsidianmedia.learnwithalphonso.core.video.WebVttCue
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URL

data class WatchUiState(val videos: List<LibraryVideo> = emptyList(), val loaded: Boolean = false, val failed: Boolean = false)

/**
 * The Watch shelf's data: the published videos with this learner's progress, read on their own so a failed read never hides
 * the podcasts. Saving goes through the clamping, own-row-only database function; a failed save never interrupts a video.
 */
class WatchViewModel(private val client: PodcastClient) : ViewModel() {
    private val _state = MutableStateFlow(WatchUiState())
    val state: StateFlow<WatchUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            try {
                _state.value = WatchUiState(client.fetchVideos(), loaded = true, failed = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loaded = true, failed = true) }
            }
        }
    }

    fun saveProgress(videoId: String, seconds: Int) {
        viewModelScope.launch { runCatching { client.saveVideoProgress(videoId, seconds) } }
    }
}

/** A poster fetched from its public URL (no image library in the app): null while loading or when it cannot be read. */
@Composable
private fun rememberRemoteImage(url: String?): Bitmap? = produceState<Bitmap?>(null, url) {
    value = if (url == null) null else withContext(Dispatchers.IO) {
        runCatching { URL(url).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull()
    }
}.value

/**
 * The Watch shelf: the course's Alphonso videos as a row of vertical posters. The caller draws it only when there is a video
 * or a failure to show (no empty box). A finished video shows a tick, one part-way through shows a bar.
 */
@Composable
fun WatchShelfSection(videos: List<LibraryVideo>, failed: Boolean, onRetry: () -> Unit, onOpen: (LibraryVideo) -> Unit) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (failed) {
            Row(Modifier.fillMaxWidth().background(palette.parchment, RoundedCornerShape(16.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("We couldn't load the videos.", color = palette.inkSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                AlphonsoSecondaryButton("Try again", onClick = onRetry, fullWidth = false)
            }
            return@Column
        }
        Text("Watch", color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(videos, key = { it.id }) { video ->
                val state = VideoShelf.state(video)
                val word = when (state) { VideoState.DONE -> "watched"; VideoState.IN_PROGRESS -> "in progress"; VideoState.NEW -> "new" }
                val poster = rememberRemoteImage(video.posterUrl)
                Column(
                    Modifier.width(120.dp).clickable(role = Role.Button) { onOpen(video) }
                        .clearAndSetSemantics { contentDescription = "${video.title}, ${VideoShelf.clock(video.durationSeconds.toDouble())}, $word"; role = Role.Button },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f).clip(RoundedCornerShape(16.dp)).background(palette.parchment)) {
                        poster?.let { Image(it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(androidx.compose.ui.graphics.Color.Transparent, palette.mossDeep.copy(alpha = 0.7f)))))
                        video.level?.let {
                            Text(it, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.TopStart).padding(8.dp).background(palette.surface, CircleShape).padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                        if (state == VideoState.DONE) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = palette.moss, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp))
                        }
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = palette.ink, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).size(32.dp).background(palette.surface.copy(alpha = 0.9f), CircleShape).padding(4.dp))
                        if (state == VideoState.IN_PROGRESS) {
                            LinearProgressIndicator(progress = { VideoShelf.fraction(video).toFloat() }, color = palette.ember, trackColor = palette.surface.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth())
                        }
                    }
                    Text(video.title, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                    Text(VideoShelf.clock(video.durationSeconds.toDouble()) + if (state == VideoState.NEW) " · New" else "", color = palette.inkSoft, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

/**
 * The player sheet (mock mocks-r8, cell A3): a vertical Media3 ExoPlayer video with play and pause, a scrubber, a speed button
 * and a captions button. Captions are ON when it opens and are drawn from the video's WebVTT file with the same parser iOS
 * uses ([WebVtt]). When the video ends, one tap goes to the matching practice item. TalkBack: every control is labelled,
 * the scrubber is a slider with a spoken time and the current caption is a polite live region. Reduce motion (animator scale
 * 0): the video does not start by itself.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoPlayerSheet(
    video: LibraryVideo,
    onSaveProgress: (Int) -> Unit,
    onPractice: (VideoPracticeTarget) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val reduceMotion = remember {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val exo = remember {
        ExoPlayer.Builder(context)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .build()
    }
    var time by remember { mutableDoubleStateOf(VideoShelf.resumeSeconds(video).toDouble()) }
    var duration by remember { mutableDoubleStateOf(video.durationSeconds.toDouble()) }
    var playing by remember { mutableStateOf(false) }
    var ended by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var attempt by remember { mutableStateOf(0) }
    var speed by remember { mutableDoubleStateOf(1.0) }
    var captionsOn by remember { mutableStateOf(VideoShelf.CAPTIONS_DEFAULT_ON) }
    var cues by remember { mutableStateOf<List<WebVttCue>>(emptyList()) }
    var lastSaved by remember { mutableDoubleStateOf(0.0) }
    var startedTracked by remember { mutableStateOf(false) }
    val currentOnSave by rememberUpdatedState(onSaveProgress)

    fun save(seconds: Double) {
        lastSaved = seconds
        currentOnSave(Math.round(seconds).toInt())
    }

    LaunchedEffect(video.id, attempt) {
        failed = false
        exo.setMediaItem(MediaItem.fromUri(video.videoUrl))
        exo.prepare()
        val resume = VideoShelf.resumeSeconds(video)
        if (resume > 0 && attempt == 0) exo.seekTo(resume * 1000L)
        exo.playWhenReady = attempt > 0 || !reduceMotion
        cues = withContext(Dispatchers.IO) { runCatching { WebVtt.parse(URL(video.captionsUrl).readText()) }.getOrDefault(emptyList()) }
    }
    LaunchedEffect(speed) { exo.setPlaybackSpeed(speed.toFloat()) }
    LaunchedEffect(exo) {
        while (true) {
            if (!ended) time = exo.currentPosition / 1000.0
            if (exo.isPlaying && time - lastSaved >= VideoShelf.SAVE_EVERY_SECONDS) save(time)
            delay(250)
        }
    }
    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
                if (isPlaying) {
                    ended = false
                    if (!startedTracked) {
                        startedTracked = true
                        Analytics.track(AnalyticsEvent.VIDEO_STARTED, mapOf("video_id" to video.id, "course" to video.course))
                    }
                } else if (exo.playbackState != Player.STATE_ENDED && exo.currentPosition > 0) {
                    save(exo.currentPosition / 1000.0)
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY && exo.duration > 0) duration = exo.duration / 1000.0
                if (playbackState == Player.STATE_ENDED) {
                    ended = true
                    playing = false
                    time = duration
                    save(duration)
                    Analytics.track(AnalyticsEvent.VIDEO_COMPLETED, mapOf("video_id" to video.id, "course" to video.course))
                }
            }

            override fun onPlayerError(error: PlaybackException) { failed = true }
        }
        exo.addListener(listener)
        // A video stops when the app goes to the background.
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) exo.pause() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            exo.removeListener(listener)
            if (!ended && exo.currentPosition > 0) currentOnSave(Math.round(exo.currentPosition / 1000.0).toInt())
            exo.release()
        }
    }

    fun togglePlay() {
        if (ended) {
            exo.seekTo(0)
            ended = false
            time = 0.0
            lastSaved = 0.0
        }
        if (exo.isPlaying) exo.pause() else exo.play()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(video.title, color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Close video", tint = palette.inkSoft) }
            }
            Box(Modifier.align(Alignment.CenterHorizontally).heightIn(max = 420.dp).aspectRatio(9f / 16f).clip(RoundedCornerShape(16.dp)).background(palette.ink)) {
                AndroidView(
                    factory = { ctx -> SurfaceView(ctx).also { exo.setVideoSurfaceView(it) } },
                    modifier = Modifier.fillMaxSize(),
                )
                val caption = if (captionsOn) WebVtt.cueAt(time, cues)?.text else null
                if (caption != null) {
                    Text(
                        caption, color = palette.onPrimary, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp).background(palette.mossDeep.copy(alpha = 0.8f), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 8.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "Caption: $caption" },
                    )
                }
                if (failed) {
                    Column(Modifier.fillMaxSize().background(palette.mossDeep.copy(alpha = 0.85f)).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("We couldn't play this video.", color = palette.onPrimary, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                        AlphonsoSecondaryButton("Try again", onClick = { attempt++ }, fullWidth = false)
                    }
                } else if (ended) {
                    Column(Modifier.fillMaxSize().background(palette.mossDeep.copy(alpha = 0.85f)).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Nice work", color = palette.onPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                        val practice = video.practice
                        val target = VideoShelf.practiceTarget(practice)
                        if (practice != null && target != null) {
                            AlphonsoSecondaryButton(VideoShelf.practiceLabel(practice), onClick = { onPractice(target) }, fullWidth = false)
                        }
                        AlphonsoSecondaryButton("Watch again", onClick = { togglePlay() }, fullWidth = false)
                    }
                }
            }
            Slider(
                value = time.toFloat().coerceIn(0f, duration.toFloat().coerceAtLeast(1f)),
                onValueChange = { v -> time = v.toDouble(); ended = false; exo.seekTo((v * 1000).toLong()) },
                valueRange = 0f..duration.toFloat().coerceAtLeast(1f),
                colors = SliderDefaults.colors(thumbColor = palette.moss, activeTrackColor = palette.moss),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Seek"; stateDescription = "${VideoShelf.clock(time)} of ${VideoShelf.clock(duration)}" },
            )
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(
                    onClick = { togglePlay() },
                    modifier = Modifier.size(48.dp).background(palette.moss, CircleShape),
                ) {
                    Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (playing) "Pause" else "Play", tint = palette.onPrimary)
                }
                Text("${VideoShelf.clock(time)} / ${VideoShelf.clock(duration)}", color = palette.inkSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                Box(
                    Modifier.heightIn(min = 48.dp).clip(CircleShape).background(palette.parchment).clickable(role = Role.Button) { speed = VideoShelf.nextSpeed(speed) }
                        .semantics { contentDescription = "Playback speed ${VideoShelf.speedLabel(speed)}. Change speed" }.padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(VideoShelf.speedLabel(speed), color = palette.ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge) }
                Box(
                    Modifier.heightIn(min = 48.dp).clip(CircleShape).background(if (captionsOn) palette.moss else palette.parchment).clickable(role = Role.Button) { captionsOn = !captionsOn }
                        .semantics { contentDescription = "Captions"; selected = captionsOn }.padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("CC", color = if (captionsOn) palette.onPrimary else palette.inkSoft, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}
