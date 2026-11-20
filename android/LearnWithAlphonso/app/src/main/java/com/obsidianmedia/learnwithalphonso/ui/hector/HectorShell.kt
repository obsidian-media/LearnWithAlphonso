package com.obsidianmedia.learnwithalphonso.ui.hector

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Coffee
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeCopy
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.ImageBitmap
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.avatar.CallLevel
import com.obsidianmedia.learnwithalphonso.core.logic.HectorChip
import com.obsidianmedia.learnwithalphonso.core.logic.HectorChipIcon
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.delay

/** The course's name as the header says it: "Your English tutor". */
internal fun hectorCourseName(course: com.obsidianmedia.learnwithalphonso.core.content.Course): String = when (course) {
    com.obsidianmedia.learnwithalphonso.core.content.Course.ENGLISH -> "English"
    com.obsidianmedia.learnwithalphonso.core.content.Course.FRENCH -> "French"
    com.obsidianmedia.learnwithalphonso.core.content.Course.SPANISH -> "Spanish"
}

/** What the header's status pill says: ready while Hector waits, then what he is doing. */
enum class HectorStatusUi(val label: String, val spoken: String) {
    READY("Ready", "Hector is ready"), LISTENING("Listening…", "Hector is listening"),
    THINKING("Thinking…", "Hector is thinking"), SPEAKING("Speaking…", "Hector is speaking");

    companion object {
        /** From the recorder's phase and the conversation's: the learner talking wins, then the wait for a reply, then his voice. */
        fun from(engine: TurnPhase, conversation: ConversationPhase): HectorStatusUi = when {
            engine == TurnPhase.RECORDING -> LISTENING
            engine == TurnPhase.TRANSCRIBING || engine == TurnPhase.REQUESTING_MIC -> THINKING
            conversation == ConversationPhase.TRANSCRIBING || conversation == ConversationPhase.THINKING -> THINKING
            conversation == ConversationPhase.SPEAKING -> SPEAKING
            else -> READY
        }
    }
}

/** Hector's real full-body cut-out from the bundled kit, uncropped; null when it cannot be read (the mascot drawable stands in). */
@Composable
private fun rememberHectorCutout(): ImageBitmap? {
    val context = LocalContext.current
    return remember {
        runCatching { context.assets.open("hector/base.webp").use { BitmapFactory.decodeStream(it) }?.asImageBitmap() }.getOrNull()
    }
}

/**
 * The tutor header on the navy hero gradient: back and an overflow button on top, Hector's cut-out standing on the
 * bottom edge, his name, a status pill with a live dot and "Your <course> tutor". The status is one polite live region.
 */
@Composable
internal fun HectorHeader(
    courseName: String,
    status: HectorStatusUi,
    /** Null on the Hector tab (a tab root has nowhere to go back to); set where he is presented as a sheet. */
    onBack: (() -> Unit)?,
    reducedMotion: Boolean,
    menu: @Composable ColumnScope.(dismiss: () -> Unit) -> Unit,
    modifier: Modifier = Modifier,
) {
    val ds = LocalAlphonsoTokens.current
    val cutout = rememberHectorCutout()
    var menuOpen by remember { mutableStateOf(false) }
    Box(
        modifier.fillMaxWidth().testTag("hector-header")
            .background(Brush.verticalGradient(listOf(ds.heroA, ds.heroB))),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            if (onBack != null) HeaderRoundButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onBack) else Box {}
            Box {
                HeaderRoundButton(Icons.Filled.MoreVert, "More options") { menuOpen = true }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) { menu { menuOpen = false } }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 44.dp, start = 15.dp, end = 15.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            // The bust bleeds to the header's bottom edge: nothing is padded under it.
            Box(Modifier.size(width = 92.dp, height = 104.dp).testTag("hector-figure")) {
                Image(
                    painter = if (cutout != null) BitmapPainter(cutout) else painterResource(R.drawable.mascot_hector),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    alignment = Alignment.BottomCenter,
                    modifier = Modifier.matchParentSize(),
                )
            }
            Column(Modifier.weight(1f).padding(bottom = 16.dp)) {
                Text("Hector", style = TitleType, color = ds.onHero)
                Row(
                    Modifier.padding(top = 6.dp).testTag("hector-status")
                        .clip(CircleShape).background(ds.callRecord.copy(alpha = 0.14f)).border(1.dp, ds.callRecord.copy(alpha = 0.32f), CircleShape)
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                        .semantics(mergeDescendants = true) {
                            contentDescription = status.spoken
                            liveRegion = LiveRegionMode.Polite
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (status == HectorStatusUi.READY || status == HectorStatusUi.LISTENING) ds.callRecord else ds.onHeroKick))
                    Text(status.label, style = CaptionType.copy(fontWeight = FontWeight.Bold), color = ds.onHeroKick)
                }
                Text("Your $courseName tutor", style = FootnoteType, color = ds.onHeroSoft, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun HeaderRoundButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(ds.onHero.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = ds.onHero, modifier = Modifier.size(18.dp))
        }
    }
}

/** Hector's small round face next to his bubbles. */
@Composable
internal fun HectorMiniAvatar() {
    val ds = LocalAlphonsoTokens.current
    Image(
        painterResource(R.drawable.mascot_hector), contentDescription = null, contentScale = ContentScale.Crop,
        modifier = Modifier.size(30.dp).clip(CircleShape).background(ds.brand),
    )
}

internal val HectorBubbleShape = RoundedCornerShape(18.dp, 18.dp, 18.dp, 7.dp)
internal val LearnerBubbleShape = RoundedCornerShape(18.dp, 18.dp, 7.dp, 18.dp)

private fun HectorChipIcon.vector() = when (this) {
    HectorChipIcon.FLAME -> Icons.Filled.LocalFireDepartment
    HectorChipIcon.COFFEE -> Icons.Filled.Coffee
    HectorChipIcon.BOOK -> Icons.Filled.MenuBook
    HectorChipIcon.CHAT -> Icons.Filled.ChatBubbleOutline
}

/** Suggestion chips: frosted-solid, like the Stories choices. Each is a button that sends its message. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun HectorChipRow(chips: List<HectorChip>, enabled: Boolean, onChip: (HectorChip) -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    FlowRow(
        modifier.fillMaxWidth().padding(start = 39.dp).testTag("hector-chips"),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        for (chip in chips) {
            Row(
                Modifier.testTag("hector-chip-${chip.id}").heightIn(min = 44.dp)
                    .clip(CircleShape).background(ds.card).border(BorderStroke(1.5.dp, ds.line), CircleShape)
                    .alpha(if (enabled) 1f else 0.5f)
                    .clickable(enabled = enabled, role = Role.Button) { onChip(chip) }
                    .padding(horizontal = 13.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Icon(chip.icon.vector(), null, tint = ds.choice, modifier = Modifier.size(16.dp))
                Text(chip.label, style = FootnoteType.copy(fontWeight = FontWeight.Bold), color = ds.ink)
            }
        }
    }
}

/**
 * The type-or-talk composer. Idle: a text field and a gold mic (and a send button once there is text). Talking: the
 * field becomes a "Listening" pill with a live waveform (static bars under Reduce Motion) and the mic a red stop.
 * [level] is the real input level in dBFS, or null when unknown.
 */
@Composable
internal fun HectorComposer(
    listening: Boolean,
    busy: Boolean,
    text: String,
    onText: (String) -> Unit,
    onSend: () -> Unit,
    onMic: () -> Unit,
    onStop: () -> Unit,
    level: () -> Double?,
    reducedMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val ds = LocalAlphonsoTokens.current
    Row(
        modifier.fillMaxWidth().testTag("hector-composer")
            .background(ds.card).border(BorderStroke(1.dp, ds.line))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        if (listening) {
            Row(
                Modifier.weight(1f).heightIn(min = 44.dp).testTag("hector-listening")
                    .clip(RoundedCornerShape(22.dp)).background(ds.choiceTint).border(1.5.dp, ds.choice.copy(alpha = 0.3f), RoundedCornerShape(22.dp))
                    .padding(horizontal = 16.dp)
                    .semantics(mergeDescendants = true) { contentDescription = "Listening" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                Text("Listening", style = FootnoteType.copy(fontWeight = FontWeight.ExtraBold), color = ds.choice)
                HectorWaveform(level, reducedMotion)
            }
            RoundAction("Stop recording and send", "hector-stop", Brush.verticalGradient(listOf(ds.wrong.copy(alpha = 0.85f), ds.wrong)), true, onStop) {
                Icon(Icons.Filled.Stop, null, tint = ds.onWrong, modifier = Modifier.size(22.dp))
            }
        } else {
            Box(
                Modifier.weight(1f).heightIn(min = 44.dp).testTag("hector-field")
                    .clip(RoundedCornerShape(22.dp)).background(ds.surface).border(1.5.dp, ds.line, RoundedCornerShape(22.dp))
                    .padding(horizontal = 15.dp, vertical = 11.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                BasicTextField(
                    value = text, onValueChange = onText, enabled = !busy,
                    textStyle = BodyType.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice), maxLines = 4,
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Message Hector" },
                    decorationBox = { inner ->
                        if (text.isEmpty()) Text("Type or tap the mic…", style = BodyType, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics { })
                        inner()
                    },
                )
            }
            RoundAction("Record a voice message", "hector-mic", Brush.verticalGradient(listOf(ds.actionHi, ds.action)), !busy, onMic) {
                Icon(Icons.Filled.Mic, null, tint = ds.onAction, modifier = Modifier.size(22.dp))
            }
            if (text.isNotBlank()) {
                RoundAction("Send", "hector-send", Brush.verticalGradient(listOf(ds.choice, ds.choice)), !busy, onSend) {
                    Icon(Icons.AutoMirrored.Filled.Send, null, tint = ds.onChoice, modifier = Modifier.size(21.dp))
                }
            }
        }
    }
}

@Composable
private fun RoundAction(label: String, tag: String, fill: Brush, enabled: Boolean, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Box(
        Modifier.size(48.dp).testTag(tag).clip(CircleShape).background(fill).alpha(if (enabled) 1f else 0.5f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { icon() }
}

private val STATIC_BARS = listOf(7, 14, 20, 11, 16, 8)

/** Live bars from the recorder's level; fixed bars under Reduce Motion or while the level is unknown. */
@Composable
internal fun HectorWaveform(level: () -> Double?, reducedMotion: Boolean) {
    val ds = LocalAlphonsoTokens.current
    var db by remember { mutableStateOf<Double?>(null) }
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) return@LaunchedEffect
        while (true) { db = level(); delay(90) }
    }
    Row(Modifier.height(24.dp).testTag("hector-wave"), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (i in STATIC_BARS.indices) {
            val h = if (reducedMotion || db == null) STATIC_BARS[i].toDouble() else CallLevel.barHeight(db, i) * 0.7
            Box(Modifier.size(width = 3.dp, height = h.dp).clip(RoundedCornerShape(2.dp)).background(ds.choice.copy(alpha = 0.85f)))
        }
    }
}

/**
 * The "mic is live" line for the classic screen while hands-free is on: what it is doing (or why it paused) and the one
 * Pause or Resume button. Shown whenever hands-free is on, wherever it was turned on (the switch, or the stored choice
 * starting it), so the microphone is never open without a visible sign.
 */
@Composable
internal fun HectorHandsFreeBar(status: HandsFreeLoop.Status, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val line = HandsFreeCopy.statusLine(status, "Hector") ?: return
    val paused = status is HandsFreeLoop.Status.Paused
    // A pause is a safety stop the learner must hear about; the rest is read on demand.
    val view = LocalView.current
    var wasPaused by remember { mutableStateOf(false) }
    LaunchedEffect(paused) {
        if (paused || wasPaused) view.announceForAccessibility(line)
        wasPaused = paused
    }
    Row(
        modifier.fillMaxWidth().testTag("hector-handsfree").background(ds.choiceTint).padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (paused) ds.action else ds.right))
        Text(line, style = FootnoteType, color = ds.ink, modifier = Modifier.weight(1f))
        Row(
            Modifier.testTag("hector-handsfree-toggle").heightIn(min = 44.dp).clip(CircleShape).background(ds.card).border(1.5.dp, ds.line, CircleShape)
                .clickable(role = Role.Button, onClick = onToggle).padding(horizontal = 14.dp)
                .semantics { contentDescription = if (paused) HandsFreeCopy.RESUME else HandsFreeCopy.PAUSE },
            verticalAlignment = Alignment.CenterVertically,
        ) { Text(if (paused) HandsFreeCopy.RESUME else HandsFreeCopy.PAUSE, style = FootnoteType.copy(fontWeight = FontWeight.Bold), color = ds.choice, modifier = Modifier.clearAndSetSemantics { }) }
    }
}
