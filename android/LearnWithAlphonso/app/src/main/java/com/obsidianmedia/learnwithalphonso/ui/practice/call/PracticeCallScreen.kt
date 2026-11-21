package com.obsidianmedia.learnwithalphonso.ui.practice.call

import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import androidx.compose.runtime.DisposableEffect
import com.obsidianmedia.learnwithalphonso.AlphonsoApplication
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffect
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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.ui.draw.drawWithContent
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
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import kotlinx.coroutines.delay

// The call's chrome in the call tokens, as iOS PracticeCallView builds it: the glass and the scrims are callGlass (the same
// dark in every theme) at the iOS opacities, the learner's caption and the recording ring are callMint and callRecord, the mic
// icon is callDock, the end button is callEnd, and the ink is the on-hero white.
@Composable
internal fun callGlass(): Color = LocalAlphonsoTokens.current.callGlass.copy(alpha = 0.46f)

@Composable
internal fun callGlassStrong(): Color = LocalAlphonsoTokens.current.callGlass.copy(alpha = 0.62f)

@Composable
internal fun callScrim(): Color = LocalAlphonsoTokens.current.callGlass

@Composable
internal fun callMint(): Color = LocalAlphonsoTokens.current.callMint

@Composable
internal fun callRecord(): Color = LocalAlphonsoTokens.current.callRecord

@Composable
internal fun callInk(): Color = LocalAlphonsoTokens.current.onHero

@Composable
internal fun callEnd(): Color = LocalAlphonsoTokens.current.callEnd

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
    /** True for a campaign scene, whose [scenarioId] is the scene's room: it keeps its older <room>.webp file. */
    campaignRoom: Boolean = false,
    course: Course,
    vm: CallConversation,
    playback: AudioPlayback,
    reducedMotion: Boolean,
    onEnd: () -> Unit,
    /** The hold-to-talk button's spoken label. */
    talkLabel: String = "Hold to talk",
    statusHost: @Composable () -> Unit,
    /** Something that belongs on the call itself (a campaign's "Continue" button), shown above the caption. */
    extra: (@Composable () -> Unit)? = null,
    /** Pinned under the transcript in the conversation sheet and lifted above the keyboard (Hector's type box). */
    sheetFooter: (@Composable () -> Unit)? = null,
    transcript: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val dark = AlphonsoColor.palette.isDark
    val state by vm.state.collectAsState()
    val turnPhase by vm.engine.phase.collectAsState()
    // Sound effects: the call-start sound once per call (keyed), the call-end sound on hang-up, and none while he speaks.
    val sfx = (LocalContext.current.applicationContext as? AlphonsoApplication)?.container?.soundEffects
    val callKey = rememberSaveable { "call-${java.util.UUID.randomUUID()}" }
    DisposableEffect(sfx) {
        sfx?.registerVoiceProbe("call") { playback.clock() != null || vm.state.value.phase == ConversationPhase.SPEAKING }
        sfx?.play(SoundEffect.CALL_START, callKey)
        onDispose { sfx?.unregisterVoiceProbe("call") }
    }
    val endCall = {
        sfx?.play(SoundEffect.CALL_END)
        onEnd()
    }
    val handsFreeStatus by vm.handsFree.status.collectAsState()
    val handsFreeOn = handsFreeStatus != HandsFreeLoop.Status.Off
    HandsFreeCallEffects(vm)
    ApplyStoredHandsFree(vm)
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
        while (recording) {
            level = vm.micLevelDBFS()
            // Hands-free reads the same level (one reader: the recorder's peak resets on every read).
            val now = SystemClock.elapsedRealtime() / 1000.0
            level?.let { vm.handsFree.level(it, now) }
            // The limits run on the wall clock too: a muted mic reads no level at all.
            vm.handsFree.tick(now)
            delay(50)
        }
        level = null
    }

    val room = if (campaignRoom) {
        CallScenes.campaignRoom(scenarioId, known = com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.sceneRoomNames, fallback = CallScenes.studyRoom)
    } else {
        CallScenes.room(scenarioId, fallback = kit.defaultRoom)
    }
    val roomFile = if (dark) room.dark else room.light
    val context = LocalContext.current
    val roomImage by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, roomFile) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { loadAsset(context, "scenes/$roomFile.webp") }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(callScrim())) {
        val w = maxWidth
        val h = maxHeight
        // The square is held to 72% of the height, so on a short phone the caption and controls stay clear of his mouth.
        val side = minOf(w * 1.28f, h * 0.72f)

        // The room: cover-fit, with the evening dim over a scenario's picture in dark mode, and a soft scrim.
        Box(Modifier.fillMaxSize().graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen).clearAndSetSemantics {}) {
            roomImage?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            if (dark && room.dimInDark) {
                val evening = callScrim()
                Box(Modifier.fillMaxSize().drawBehind { drawRect(evening.copy(alpha = CallScenes.EVENING_OVERLAY_OPACITY.toFloat()), blendMode = BlendMode.Multiply) })
            }
            val scrim = callScrim()
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        0f to scrim.copy(alpha = 0.28f), 0.18f to Color.Transparent, 0.55f to Color.Transparent, 1f to scrim.copy(alpha = 0.5f),
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
            modifier = Modifier.offset(x = (w - side) / 2, y = h * 0.15f).size(side).avatarBottomFade().clearAndSetSemantics {},
        )

        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 18.dp)) {
            statusHost()
            CallBar(kit.displayName, title, speaking = mode == AvatarMode.SPEAKING, seconds = seconds)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) { YouTile(recording, level) }
            Box(Modifier.weight(1f))
            state.error?.let {
                Text(it, style = FootnoteType, color = ds.wrongInk, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(50)).background(LocalAlphonsoTokens.current.card.copy(alpha = 0.94f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
            extra?.let { Box(Modifier.align(Alignment.CenterHorizontally).padding(bottom = 10.dp)) { it() } }
            Caption(vm, playback, mode, recording)
            Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp).clip(CircleShape).background(callGlass()).clearAndSetSemantics { liveRegion = LiveRegionMode.Polite; contentDescription = mode.callLabel }.padding(horizontal = 10.dp, vertical = 2.dp)) {
                Text(mode.callLabel.uppercase(), color = callInk(), style = OverlineType)
            }
            if (handsFreeOn) Box(Modifier.align(Alignment.CenterHorizontally)) { HandsFreeStatusPill(handsFreeStatus, kit.displayName) }
            Controls(recording, busy, talkLabel, handsFreeStatus, onTogglePause = vm.handsFree::togglePause, onChat = { showSheet = true }, onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded, onEnd = endCall)
        }
    }

    if (showSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false }, sheetState = sheetState, containerColor = ds.surface,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
        ) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Conversation", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                TextButton(onClick = { showSheet = false }) { Text("Back to call", color = ds.choice) }
            }
            HandsFreeSwitch(vm, kit.displayName)
            Box(Modifier.weight(1f, fill = false)) { transcript() }
            if (sheetFooter != null) Box(Modifier.imePadding()) { sheetFooter() }
        }
    }
}

/**
 * The bottom of the character's square fades out (solid to 80%, transparent at 100%), so his robe has no hard straight
 * edge above the caption. Size and position are unchanged.
 */
private fun Modifier.avatarBottomFade(): Modifier = this
    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
    .drawWithContent {
        drawContent()
        drawRect(
            Brush.verticalGradient(0f to Color.Black, CallScenes.AVATAR_FADE_START to Color.Black, 1f to Color.Transparent),
            blendMode = BlendMode.DstIn,
        )
    }

@Composable
private fun CallBar(name: String, title: String, speaking: Boolean, seconds: Int) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(name, color = callInk(), style = TitleType)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (speaking) callEnd() else callInk().copy(alpha = 0.55f)).clearAndSetSemantics {})
                Text(title, color = callInk(), style = FootnoteType, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
            }
        }
        Text(
            CallClock.format(seconds), color = callInk(),
            modifier = Modifier.clip(CircleShape).background(callGlass()).padding(horizontal = 10.dp, vertical = 3.dp)
                .semantics { contentDescription = "Call time ${CallClock.format(seconds)}" },
            style = CaptionType.copy(fontFeatureSettings = "tnum"),
        )
    }
}

/** The learner's self view: their voice level instead of a camera. Real metering, or resting bars; nothing is faked. */
@Composable
private fun YouTile(recording: Boolean, levelDBFS: Double?) {
    Column(
        Modifier.size(width = 86.dp, height = 116.dp).clip(RoundedCornerShape(16.dp)).background(callGlassStrong())
            .border(if (recording) 2.dp else 1.dp, if (recording) callRecord() else callInk().copy(alpha = 0.18f), RoundedCornerShape(16.dp))
            .clearAndSetSemantics {},
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Row(Modifier.height(CallLevel.MAX_HEIGHT.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
            for (i in 0 until CallLevel.BAR_COUNT) {
                Box(Modifier.size(width = 5.dp, height = CallLevel.barHeight(levelDBFS, i).dp).clip(RoundedCornerShape(3.dp)).background(callInk().copy(alpha = 0.85f)))
            }
        }
        Text("You", color = callInk().copy(alpha = 0.9f), style = CaptionType, modifier = Modifier.padding(top = 8.dp))
    }
}

/** Only the current utterance, word by word while it is spoken; the learner's own words in a green tint. */
@Composable
private fun Caption(vm: CallConversation, playback: AudioPlayback, mode: AvatarMode, recording: Boolean) {
    val state by vm.state.collectAsState()
    val caption = CallCaptionRules.caption(state.turns, recording)
    if (caption == null) { Box(Modifier.height(1.dp)); return }
    val words = caption.text.split(Regex("\\s+")).filter { it.isNotEmpty() }
    // Words light with the audio while he speaks the caption; otherwise the whole caption is lit.
    val lit by produceState(words.size, caption.text, mode, caption.mine) {
        value = words.size
        // Ticks only while his words are lighting up with the audio; a still caption costs nothing.
        if (caption.mine || mode != AvatarMode.SPEAKING) return@produceState
        while (true) {
            val c = playback.clock()
            value = if (!caption.mine && mode == AvatarMode.SPEAKING && c != null && c.second > 0) CallCaptionRules.litWords(words.size, c.first / c.second) else words.size
            delay(66)
        }
    }
    val base = if (caption.mine) callMint() else callInk()
    val text: AnnotatedString = buildAnnotatedString {
        words.forEachIndexed { i, word ->
            withStyle(SpanStyle(color = base.copy(alpha = if (i < lit) 1f else 0.55f))) { append(word) }
            append(" ")
        }
    }
    Text(
        text, textAlign = TextAlign.Center, style = TitleType,
        // At most four lines on screen, so a long reply (or a large font scale) cannot climb over his mouth or push the
        // talk button off a small phone. The whole text is the live region's and the sheet's.
        maxLines = 4, overflow = TextOverflow.Ellipsis,
        // Cleared and set: the live region is the plain text only, so the word-by-word restyling (a new
        // AnnotatedString each tick) never makes TalkBack announce the caption again.
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics { liveRegion = LiveRegionMode.Polite; contentDescription = caption.text },
    )
}

@Composable
private fun Controls(recording: Boolean, busy: Boolean, talkLabel: String, handsFreeStatus: HandsFreeLoop.Status, onTogglePause: () -> Unit, onChat: () -> Unit, onPressBegan: () -> Unit, onPressEnded: () -> Unit, onEnd: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(26.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
        RoundButton(callGlassStrong(), "Show the conversation", onChat) { Icon(Icons.Filled.Chat, null, tint = callInk()) }
        if (handsFreeStatus != HandsFreeLoop.Status.Off) HandsFreePauseButton(handsFreeStatus, onTogglePause) else Box(
            Modifier.size(78.dp).clip(CircleShape).background(if (recording) callRecord() else callInk())
                .semantics {
                    contentDescription = "Hold to talk"
                    role = Role.Button
                    stateDescription = if (recording) "Recording" else "Not recording"
                    // TalkBack has no hold: a double-tap starts talking and the next one stops and sends.
                    if (busy) {
                        disabled()
                    } else {
                        onClick(label = if (recording) "Stop and send" else "Start talking") {
                            if (recording) onPressEnded() else onPressBegan()
                            true
                        }
                    }
                }
                .holdToTalk(enabled = !busy, onPressBegan, onPressEnded),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Mic, null, tint = LocalAlphonsoTokens.current.callDock, modifier = Modifier.size(30.dp)) }
        RoundButton(callEnd(), "End the call", onEnd) { Icon(Icons.Filled.CallEnd, null, tint = callInk()) }
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
