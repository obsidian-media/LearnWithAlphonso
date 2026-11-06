package com.obsidianmedia.learnwithalphonso.ui.practice.call

import android.os.SystemClock
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.audio.AudioPlayback
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarMode
import com.obsidianmedia.learnwithalphonso.core.avatar.CallCaptionRules
import com.obsidianmedia.learnwithalphonso.core.avatar.CallClock
import com.obsidianmedia.learnwithalphonso.core.avatar.CallLevel
import com.obsidianmedia.learnwithalphonso.core.avatar.CallPhase
import com.obsidianmedia.learnwithalphonso.core.avatar.CallScenes
import com.obsidianmedia.learnwithalphonso.core.avatar.CharacterKit
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.BaseConversationViewModel
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.delay

private val Glass = Color(0x75121A15)
private val GlassStrong = Color(0x9E121A15)
private val EveningNavy = Color(0xFF16203C)
private val Green = Color(0xFF6FE0A5)

/**
 * The Practice speaking session as a full-screen call: the character's room behind him, a call bar with a timer, a
 * "You" tile with the learner's microphone level, one live caption, and the call controls. The conversation itself
 * (bubbles, hints) lives in the bottom sheet [transcript] fills.
 *
 * Decorative: the character, the room and the "You" tile are hidden from TalkBack. The caption is a polite live
 * region; the sheet keeps the whole transcript accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PracticeCallScreen(
    kit: CharacterKit,
    title: String,
    scenarioId: String,
    course: Course,
    vm: BaseConversationViewModel,
    playback: AudioPlayback,
    reducedMotion: Boolean,
    onEnd: () -> Unit,
    statusHost: @Composable () -> Unit,
    transcript: @Composable () -> Unit,
) {
    val palette = AlphonsoColor.palette
    val dark = palette.isDark
    val state by vm.state.collectAsState()
    val turnPhase by vm.engine.phase.collectAsState()
    val recording = turnPhase == TurnPhase.RECORDING || turnPhase == TurnPhase.REQUESTING_MIC
    val busy = state.phase != ConversationPhase.IDLE || turnPhase == TurnPhase.TRANSCRIBING
    var mode by remember { mutableStateOf(AvatarMode.IDLE) }
    var showSheet by rememberSaveable { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val seconds by produceState(0) {
        val start = SystemClock.elapsedRealtime()
        while (true) { value = ((SystemClock.elapsedRealtime() - start) / 1000).toInt(); delay(500) }
    }
    var level by remember { mutableStateOf<Double?>(null) }
    LaunchedEffect(recording) {
        while (recording) { level = vm.micLevelDBFS(); delay(50) }
        level = null
    }

    val room = CallScenes.room(scenarioId, fallback = kit.defaultRoom)
    val roomFile = if (dark) room.dark else room.light
    val context = LocalContext.current
    val roomImage by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, roomFile) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { loadAsset(context, "scenes/$roomFile.webp") }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black)) {
        val w = maxWidth
        val h = maxHeight
        // The square is held to 72% of the height, so on a short phone the caption and controls stay clear of his mouth.
        val side = minOf(w * 1.28f, h * 0.72f)

        // The room: cover-fit, with the evening dim over a scenario's picture in dark mode, and a soft scrim.
        Box(Modifier.fillMaxSize().graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen).clearAndSetSemantics {}) {
            roomImage?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            if (dark && room.dimInDark) {
                Box(Modifier.fillMaxSize().drawBehind { drawRect(EveningNavy.copy(alpha = CallScenes.EVENING_OVERLAY_OPACITY.toFloat()), blendMode = BlendMode.Multiply) })
            }
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.28f), 0.18f to Color.Transparent, 0.55f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.5f),
                    ),
                ),
            )
        }

        CharacterAvatar(
            kit = kit,
            phase = {
                CallPhase.of(
                    requestingMic = vm.engine.phase.value == TurnPhase.REQUESTING_MIC,
                    recording = vm.engine.phase.value == TurnPhase.RECORDING,
                    transcribing = vm.engine.phase.value == TurnPhase.TRANSCRIBING || vm.state.value.phase == ConversationPhase.TRANSCRIBING,
                    thinking = vm.state.value.phase == ConversationPhase.THINKING,
                    replyPending = vm.state.value.phase == ConversationPhase.SPEAKING,
                    playing = playback.clock() != null,
                )
            },
            replyText = { vm.state.value.turns.lastOrNull { it.role == "assistant" }?.content },
            clock = playback::clock,
            verdict = { vm.state.value.let { it.verdictSerial to it.verdict } },
            course = course,
            reducedMotion = reducedMotion,
            onMode = { mode = it },
            modifier = Modifier.offset(x = (w - side) / 2, y = h * 0.15f).size(side).clearAndSetSemantics {},
        )

        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 18.dp)) {
            statusHost()
            CallBar(kit.displayName, title, speaking = mode == AvatarMode.SPEAKING, seconds = seconds)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) { YouTile(recording, level) }
            Box(Modifier.weight(1f))
            state.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.92f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
            Caption(vm, playback, mode, recording)
            Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp).clip(CircleShape).background(Glass).clearAndSetSemantics {}.padding(horizontal = 10.dp, vertical = 2.dp)) {
                Text(mode.callLabel.uppercase(), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
            }
            Controls(recording, busy, onChat = { showSheet = true }, onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded, onEnd = onEnd)
        }
    }

    if (showSheet) {
        ModalBottomSheet(onDismissRequest = { showSheet = false }, sheetState = sheetState, containerColor = palette.surface) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Conversation", style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.weight(1f))
                TextButton(onClick = { showSheet = false }) { Text("Back to call", color = palette.moss) }
            }
            Box(Modifier.weight(1f, fill = false)) { transcript() }
        }
    }
}

@Composable
private fun CallBar(name: String, title: String, speaking: Boolean, seconds: Int) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(name, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (speaking) Color(0xFFFF5A4F) else Color(0xFF9AA39D)).clearAndSetSemantics {})
                Text(title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
            }
        }
        Text(
            CallClock.format(seconds), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(Glass).padding(horizontal = 10.dp, vertical = 3.dp)
                .semantics { contentDescription = "Call time ${CallClock.format(seconds)}" },
            style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
        )
    }
}

/** The learner's self view: their voice level instead of a camera. Real metering, or resting bars; nothing is faked. */
@Composable
private fun YouTile(recording: Boolean, levelDBFS: Double?) {
    Column(
        Modifier.size(width = 86.dp, height = 116.dp).clip(RoundedCornerShape(16.dp)).background(GlassStrong)
            .border(if (recording) 2.dp else 1.dp, if (recording) Green else Color.White.copy(alpha = 0.18f), RoundedCornerShape(16.dp))
            .clearAndSetSemantics {},
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Row(Modifier.height(CallLevel.MAX_HEIGHT.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
            for (i in 0 until CallLevel.BAR_COUNT) {
                Box(Modifier.size(width = 5.dp, height = CallLevel.barHeight(levelDBFS, i).dp).clip(RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = 0.85f)))
            }
        }
        Text("You", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
    }
}

/** Only the current utterance, word by word while it is spoken; the learner's own words in a green tint. */
@Composable
private fun Caption(vm: BaseConversationViewModel, playback: AudioPlayback, mode: AvatarMode, recording: Boolean) {
    val state by vm.state.collectAsState()
    val caption = CallCaptionRules.caption(state.turns, recording)
    if (caption == null) { Box(Modifier.height(1.dp)); return }
    val words = caption.text.split(Regex("\\s+")).filter { it.isNotEmpty() }
    // Words light with the audio while he speaks the caption; otherwise the whole caption is lit.
    val lit by produceState(words.size, caption.text, mode, caption.mine) {
        while (true) {
            val c = playback.clock()
            value = if (!caption.mine && mode == AvatarMode.SPEAKING && c != null && c.second > 0) CallCaptionRules.litWords(words.size, c.first / c.second) else words.size
            delay(66)
        }
    }
    val base = if (caption.mine) Color(0xFFC9F5DC) else Color.White
    val text: AnnotatedString = buildAnnotatedString {
        words.forEachIndexed { i, word ->
            withStyle(SpanStyle(color = base.copy(alpha = if (i < lit) 1f else 0.55f))) { append(word) }
            append(" ")
        }
    }
    Text(
        text, textAlign = TextAlign.Center, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 25.sp,
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite; contentDescription = caption.text },
    )
}

@Composable
private fun Controls(recording: Boolean, busy: Boolean, onChat: () -> Unit, onPressBegan: () -> Unit, onPressEnded: () -> Unit, onEnd: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(26.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
        RoundButton(GlassStrong, "Show the conversation", onChat) { Icon(Icons.Filled.Chat, null, tint = Color.White) }
        Box(
            Modifier.size(78.dp).clip(CircleShape).background(if (recording) Green else Color.White)
                .semantics { contentDescription = "Hold to talk" }
                .holdToTalk(enabled = !busy, onPressBegan, onPressEnded),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Mic, null, tint = Color(0xFF17241C), modifier = Modifier.size(30.dp)) }
        RoundButton(Color(0xFFE5483D), "End the call", onEnd) { Icon(Icons.Filled.CallEnd, null, tint = Color.White) }
    }
}

@Composable
private fun RoundButton(color: Color, label: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Box(
        Modifier.size(54.dp).clip(CircleShape).background(color).semantics { contentDescription = label }.clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { icon() }
}

private fun Modifier.holdToTalk(enabled: Boolean, onBegan: () -> Unit, onEnded: () -> Unit): Modifier =
    pointerInput(enabled) {
        if (!enabled) return@pointerInput
        detectTapGestures(onPress = {
            onBegan()
            try { tryAwaitRelease() } finally { onEnded() }
        })
    }
