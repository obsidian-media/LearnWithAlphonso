package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.logic.LearnMap
import com.obsidianmedia.learnwithalphonso.core.logic.deriveVocab
import com.obsidianmedia.learnwithalphonso.core.logic.typeKey
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.delay

/**
 * Learn's climbing map ("Path B", PARITY-SPEC-6), drawn from the shared model (core LearnMap): one unit as a climb up a
 * night hill. The unit strip sits on top, the lessons wind up the trail from the foot (done green, the next one gold
 * and bobbing, the rest locked), the unit's reward chest crowns the summit, and Alphonso waits at the trailhead. Tapping
 * the next lesson lifts a start sheet. Same behaviour and words as src/components/LearnMap.tsx.
 */

/** Room above the summit (for the chest) and below the foot (for the trailhead chest and the Start pill). */
private val TopRoom = 44.dp
private val FootRoom = 52.dp
/** How long the "finish X first" hint stays. */
private const val HINT_MS = 6000L
/** Where a finished unit's chest sits at the foot of the next climb: left of the first lesson, at the very bottom. */
private val Trailhead = LearnMap.Point(0.15, 1.0)

private val NodeDone = 56.dp
private val NodeNext = 80.dp
private val NodeLocked = 52.dp
private val ChestSummit = 56.dp
private val ChestFoot = 48.dp

/** The tags a face carries so a test can see whether the next lesson is bobbing. */
internal const val TAG_BOB_ON = "climb-bob-on"
internal const val TAG_BOB_OFF = "climb-bob-off"

/** Tall enough per slot that nodes never touch, and never shorter than a phone's first screen of map. */
internal fun climbHeight(slots: Int): Dp = maxOf(360, slots * 88 + 44 + 52).dp

/** The level's units in the shape the model wants. The word count is what the lesson teaches (the same derivation as the lesson screen). */
internal fun climbUnitsOf(units: List<com.obsidianmedia.learnwithalphonso.core.content.Unit>, vocabImages: Map<String, VocabImageRef>): List<LearnMap.Unit> =
    units.map { u ->
        LearnMap.Unit(u.id, u.title, u.lessons.map { l ->
            LearnMap.Lesson(l.id, l.title, l.subtitle, l.questions.map { it.typeKey }, deriveVocab(l, vocabImages).size)
        })
    }

@Composable
internal fun LearnClimbMap(
    climb: LearnMap.Climb,
    greeting: String,
    /** The course-wide Continue lesson, or null. The map is one level's climb: when its next lesson is not that one, the sheet says "Start lesson". */
    continueLessonId: String?,
    reduceMotion: Boolean,
    onOpenLesson: (String) -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    // Saveable like the rest of Learn's state, so turning the phone does not close an open sheet.
    var sheetOpen by rememberSaveable { mutableStateOf(false) }
    var hint by remember { mutableStateOf<String?>(null) }
    // Counts hint taps: tapping the same locked node again restarts the 6 s clock and redraws the status line.
    var hintTap by remember { mutableIntStateOf(0) }
    fun showHint(message: String) {
        hint = message
        hintTap++
    }
    // The "finish X first" hint is about this moment: it clears after a few seconds, and at once when the next lesson
    // changes, so the live region never holds a stale instruction.
    val nextId = climb.next?.lessonId
    LaunchedEffect(nextId) { hint = null }
    LaunchedEffect(hintTap) { if (hint != null) { delay(HINT_MS); hint = null } }

    val total = climb.nodes.size
    val nextNode = climb.nodes.firstOrNull { it.state == LearnMap.NodeState.NEXT }
    val earnedTrailhead = climb.trailhead is LearnMap.Trailhead.EarnedChest
    val alphonso = rememberFirstRunAsset("lesson/happy.webp")
    // At large font sizes the greeting takes its own full-width row and Alphonso steps aside, so nothing overlaps the climb.
    val big = LocalDensity.current.fontScale >= 1.3f
    val sceneShape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    val trail = remember(climb, earnedTrailhead) {
        buildList {
            if (earnedTrailhead) add(Trailhead)
            climb.nodes.forEach { add(it.point) }
            add(climb.chest.point)
        }
    }

    Column(Modifier.testTag("learn-climb")) {
        Column(
            Modifier.fillMaxWidth().clip(sceneShape).background(Brush.verticalGradient(listOf(ds.heroA, ds.heroB))).semantics { isTraversalGroup = true },
        ) {
            Strip(climb.strip, Modifier.semantics { traversalIndex = 0f })
            // The climb: the scene, the trail, the nodes, Alphonso.
            Box(Modifier.fillMaxWidth().height(climbHeight(total + 1)).semantics { isTraversalGroup = true; traversalIndex = 1f }) {
                Scene(Modifier.matchParentSize())
                BoxWithConstraints(Modifier.fillMaxSize().padding(top = TopRoom, bottom = FootRoom).semantics { isTraversalGroup = true }) {
                    val w = maxWidth
                    val h = maxHeight
                    Canvas(Modifier.fillMaxSize()) { drawTrail(trail, ds.onHero.copy(alpha = 0.15f), ds.onHeroKick.copy(alpha = 0.6f)) }
                    var order = 0f
                    if (earnedTrailhead) {
                        val n = climb.strip.number - 1
                        val footIndex = order
                        Placed(Trailhead, w, h, ChestFoot, Modifier.testTag("climb-chest-trailhead").semantics { traversalIndex = footIndex; contentDescription = "Unit $n reward, earned"; role = Role.Image }) {
                            ChestFace(earned = true, size = ChestFoot, glyph = 24.dp)
                        }
                        order += 1f
                    }
                    climb.nodes.forEachIndexed { i, node ->
                        val idx = order
                        val label = "Lesson ${i + 1} of $total, ${node.title}, ${node.state.key}"
                        val size = when (node.state) { LearnMap.NodeState.NEXT -> NodeNext; LearnMap.NodeState.DONE -> NodeDone; LearnMap.NodeState.LOCKED -> NodeLocked }
                        val onTap: () -> Unit = when (node.state) {
                            LearnMap.NodeState.NEXT -> { { hint = null; sheetOpen = true } }
                            LearnMap.NodeState.DONE -> { { onOpenLesson(node.id) } }
                            LearnMap.NodeState.LOCKED -> { { showHint(nextNode?.let { "Finish ${it.title} first, then this one opens." } ?: "Finish the lessons before it first.") } }
                        }
                        Placed(
                            node.point, w, h, size,
                            Modifier.testTag("climb-node-${node.id}").semantics { traversalIndex = idx; contentDescription = label }.clickable(role = Role.Button, onClick = onTap),
                        ) { NodeFace(node, reduceMotion) }
                        order += 1f
                    }
                    // The summit chest: a picture once earned, a button that explains itself while locked.
                    val chestDescription = if (climb.chest.earned) "Unit ${climb.strip.number} reward, earned" else "Unit ${climb.strip.number} reward, locked until you finish the unit"
                    val summitIndex = order
                    val chestModifier = Modifier.testTag("climb-chest-summit").semantics { traversalIndex = summitIndex; contentDescription = chestDescription }.let {
                        if (climb.chest.earned) it.semantics { role = Role.Image } else it.clickable(role = Role.Button) { showHint("Finish this unit to open the chest.") }
                    }
                    Placed(climb.chest.point, w, h, ChestSummit, chestModifier) {
                        ChestFace(earned = climb.chest.earned, size = ChestSummit, glyph = 28.dp)
                        Text("Unit reward", style = OverlineType, color = ds.onHeroKick, maxLines = 1, modifier = floatAbove(6.dp).clearAndSetSemantics { })
                    }
                }
                if (!big) {
                    // Alphonso at the trailhead, bottom right, with his greeting. Decorative apart from the greeting words.
                    Column(
                        Modifier.align(Alignment.BottomEnd).fillMaxWidth(0.34f).widthIn(max = 144.dp).semantics { traversalIndex = 2f },
                        horizontalAlignment = Alignment.End,
                    ) {
                        GreetingBubble(greeting, Modifier.padding(end = AlphonsoTokens.Space.s2, bottom = AlphonsoTokens.Space.s1))
                        alphonso?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().aspectRatio(1f).clearAndSetSemantics { }) }
                    }
                }
            }
            if (big) GreetingBubble(greeting, Modifier.padding(AlphonsoTokens.Space.s3).semantics { traversalIndex = 2f })
        }
        // Keyed on the tap count: a repeat tap makes a fresh live-region node, so TalkBack has a change to speak.
        key(hintTap) {
            Text(
                hint ?: "", style = FootnoteType, color = ds.inkSoft,
                modifier = Modifier.fillMaxWidth().heightIn(min = 20.dp).padding(top = AlphonsoTokens.Space.s2).testTag("climb-hint").semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }

    val next = climb.next
    if (sheetOpen && next != null) {
        ClimbStartSheet(
            strip = climb.strip,
            lessonNumber = climb.nodes.indexOfFirst { it.id == next.lessonId } + 1,
            sheet = next,
            ctaLabel = if (next.lessonId == continueLessonId) "Continue lesson" else "Start lesson",
            onStart = { sheetOpen = false; onOpenLesson(next.lessonId) },
            onClose = { sheetOpen = false },
        )
    }
}

@Composable
private fun GreetingBubble(text: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text, style = CaptionType, color = ds.ink,
        modifier = modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.surface).padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1),
    )
}

/** "Unit N of M . name", "done / total" and a thin gold progress bar. */
@Composable
private fun Strip(strip: LearnMap.Strip, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(
        modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s3)
            .clip(shape).background(ds.onHero.copy(alpha = 0.10f)).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3), verticalAlignment = Alignment.Top) {
            Text("Unit ${strip.number} of ${strip.count} · ${strip.name}", style = HeadlineType, color = ds.onHero, modifier = Modifier.weight(1f).semantics { heading() })
            Text("${strip.done} / ${strip.total}", style = CaptionType, color = ds.onHeroSoft)
        }
        Box(
            Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(ds.heroB.copy(alpha = 0.6f))
                .semantics { contentDescription = "Unit progress"; progressBarRangeInfo = ProgressBarRangeInfo(strip.done.toFloat(), 0f..strip.total.toFloat()) },
        ) {
            if (strip.progress > 0.0) Box(Modifier.fillMaxHeight().fillMaxWidth(strip.progress.toFloat().coerceIn(0f, 1f)).clip(CircleShape).background(Brush.horizontalGradient(listOf(ds.onHeroKick, ds.action))))
        }
    }
}

/** The night hill: a gold glow over the summit, layered hills and a few stars. Decoration only, no semantics. */
@Composable
private fun Scene(modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    Box(
        modifier.drawBehind {
            drawRect(Brush.radialGradient(listOf(ds.onHeroKick.copy(alpha = 0.4f), Color.Transparent), center = Offset(size.width / 2f, 0f), radius = size.width * 0.7f))
            drawOval(ds.heroB.copy(alpha = 0.7f), topLeft = Offset(-size.width * 0.1f, size.height - 0.2f * size.width), size = Size(size.width * 1.2f, size.width * 0.5f))
            drawOval(ds.heroB.copy(alpha = 0.5f), topLeft = Offset(-size.width * 0.3f, size.height - 0.5f * size.width), size = Size(size.width * 1.0f, size.width * 0.4f))
            drawOval(ds.heroB.copy(alpha = 0.45f), topLeft = Offset(size.width * 0.4f, size.height - 0.35f * size.width), size = Size(size.width * 0.9f, size.width * 0.4f))
            listOf(0.18f to 0.03f, 0.72f to 0.02f, 0.54f to 0.06f, 0.33f to 0.015f, 0.86f to 0.07f).forEach { (x, y) ->
                drawCircle(ds.onHero.copy(alpha = 0.7f), radius = 1.5.dp.toPx(), center = Offset(size.width * x, size.height * y))
            }
        },
    )
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTrail(points: List<LearnMap.Point>, soft: Color, dots: Color) {
    if (points.size < 2) return
    val path = Path().apply {
        points.forEachIndexed { i, p ->
            val x = (p.x * size.width).toFloat()
            val y = (p.y * size.height).toFloat()
            if (i == 0) moveTo(x, y) else lineTo(x, y)
        }
    }
    drawPath(path, soft, style = Stroke(width = 18.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    drawPath(path, dots, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(1f, 12.dp.toPx()), 0f)))
}

/** Puts a [size] box centred on the model point (x, y fractions of the inner climb box). */
@Composable
private fun Placed(p: LearnMap.Point, boxW: Dp, boxH: Dp, size: Dp, modifier: Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier.offset(x = boxW * p.x.toFloat() - size / 2, y = boxH * p.y.toFloat() - size / 2).size(size).then(modifier),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** BoxScope: a zero-size anchor at the top centre of the parent that draws its content above it, never moving the parent's layout. */
private fun BoxScope.floatAbove(gap: Dp): Modifier = Modifier.align(Alignment.TopCenter).layout { measurable, _ ->
    val p = measurable.measure(Constraints(maxWidth = 200.dp.roundToPx()))
    layout(0, 0) { p.place(-p.width / 2, -p.height - gap.roundToPx()) }
}

/** BoxScope: the same, below the parent's bottom centre. */
private fun BoxScope.floatBelow(gap: Dp): Modifier = Modifier.align(Alignment.BottomCenter).layout { measurable, _ ->
    val p = measurable.measure(Constraints(maxWidth = 200.dp.roundToPx()))
    layout(0, 0) { p.place(-p.width / 2, gap.roundToPx()) }
}

@Composable
private fun NodeFace(node: LearnMap.Node, reduceMotion: Boolean) {
    val ds = LocalAlphonsoTokens.current
    when (node.state) {
        LearnMap.NodeState.DONE -> Disc(
            NodeDone, Brush.radialGradient(listOf(lerp(ds.onHero, ds.right, 0.58f), ds.right)), ds.rightEdge, 6.dp,
        ) { Icon(painterResource(R.drawable.ds_check), null, tint = ds.onRight, modifier = Modifier.size(AlphonsoTokens.Space.s6).clearAndSetSemantics { }) }
        LearnMap.NodeState.LOCKED -> Disc(
            NodeLocked, Brush.radialGradient(listOf(ds.onHero, lerp(ds.heroA, ds.onHero, 0.68f))), ds.onHero.copy(alpha = 0.4f), 5.dp,
        ) { Icon(painterResource(R.drawable.ds_lock), null, tint = ds.inkSoft, modifier = Modifier.size(AlphonsoTokens.Space.s6).clearAndSetSemantics { }) }
        LearnMap.NodeState.NEXT -> {
            val bob = !reduceMotion
            // The face bobs inside a still clickable node: the tap target never moves under a finger.
            BobBox(bob, Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().drawBehind {
                    drawCircle(ds.action.copy(alpha = 0.35f), radius = size.minDimension / 2f + 14.dp.toPx())
                    drawCircle(ds.heroA.copy(alpha = 0.9f), radius = size.minDimension / 2f + 10.dp.toPx())
                    drawCircle(ds.onHero.copy(alpha = 0.3f), radius = size.minDimension / 2f + 9.dp.toPx())
                })
                Disc(NodeNext, Brush.radialGradient(listOf(ds.actionHi, ds.action)), ds.actionEdge, 8.dp) {
                    Icon(painterResource(R.drawable.ds_play), null, tint = ds.onAction, modifier = Modifier.size(AlphonsoTokens.Space.s8 + 4.dp).clearAndSetSemantics { })
                }
                Text(
                    node.title, style = CaptionType, color = ds.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                    modifier = floatAbove(8.dp).widthIn(max = 176.dp).clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(ds.surface)
                        .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1).clearAndSetSemantics { },
                )
                Text(
                    "START", style = OverlineType, color = ds.actionText, maxLines = 1,
                    modifier = floatBelow(10.dp).clip(CircleShape).background(ds.surface)
                        .padding(horizontal = AlphonsoTokens.Space.s3, vertical = 2.dp).clearAndSetSemantics { },
                )
            }
        }
    }
}

/** A round node: a drop edge under a gradient face, the glyph in the middle. Glyphs carry no semantics of their own. */
@Composable
private fun Disc(size: Dp, face: Brush, edge: Color, lip: Dp, glyph: @Composable () -> Unit) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().offset(y = lip).background(edge, CircleShape))
        Box(Modifier.fillMaxSize().background(face, CircleShape), contentAlignment = Alignment.Center) { glyph() }
    }
}

/** Bobs its content 6 dp up and down (about 1.8 s a cycle), or holds still. Tagged so a test can tell which. */
@Composable
private fun BobBox(on: Boolean, modifier: Modifier, content: @Composable BoxScope.() -> Unit) {
    val tag = Modifier.clearAndSetSemantics { testTag = if (on) TAG_BOB_ON else TAG_BOB_OFF }
    if (on) {
        val dy by rememberInfiniteTransition(label = "climb-bob").animateFloat(
            initialValue = 0f, targetValue = -6f,
            animationSpec = infiniteRepeatable(tween(durationMillis = 900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "climb-bob-dy",
        )
        Box(modifier.then(tag).graphicsLayer { translationY = dy * density }, contentAlignment = Alignment.Center, content = content)
    } else {
        Box(modifier.then(tag), contentAlignment = Alignment.Center, content = content)
    }
}

/** The unit's reward chest: gold with a check badge once earned, muted with a small lock badge while locked. */
@Composable
private fun ChestFace(earned: Boolean, size: Dp, glyph: Dp) {
    val ds = LocalAlphonsoTokens.current
    val face = if (earned) Brush.radialGradient(listOf(ds.actionHi, ds.action)) else Brush.radialGradient(listOf(lerp(ds.heroA, ds.onHero, 0.55f), lerp(ds.heroA, ds.onHero, 0.25f)))
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().offset(y = 5.dp).background(if (earned) ds.actionEdge else ds.heroB, CircleShape))
        Box(Modifier.fillMaxSize().background(face, CircleShape), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ds_chest), null, tint = if (earned) ds.onAction else ds.onHeroSoft, modifier = Modifier.size(glyph).clearAndSetSemantics { })
        }
        Box(
            Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp).size(AlphonsoTokens.Space.s5).background(if (earned) ds.right else ds.heroB, CircleShape).clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(if (earned) R.drawable.ds_check else R.drawable.ds_lock), null, tint = if (earned) ds.onRight else ds.onHeroSoft, modifier = Modifier.size(12.dp))
        }
    }
}

/** The start sheet for the next lesson: where it sits, its name, what it covers, its time / XP / words, and the way in. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ClimbStartSheet(strip: LearnMap.Strip, lessonNumber: Int, sheet: LearnMap.StartSheet, ctaLabel: String, onStart: () -> Unit, onClose: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    ModalBottomSheet(
        onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(
            Modifier.fillMaxWidth().testTag("climb-sheet").verticalScroll(rememberScrollState())
                .padding(start = AlphonsoTokens.Space.gutter, end = AlphonsoTokens.Space.gutter, bottom = AlphonsoTokens.Space.s6),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        ) {
            Text("Unit ${strip.number} · Lesson $lessonNumber", style = OverlineType, color = ds.actionText)
            Text(sheet.title, style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
            if (sheet.coverage.isNotEmpty()) Text(sheet.coverage, style = BodyType, color = ds.inkSoft)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), modifier = Modifier.padding(top = AlphonsoTokens.Space.s2)) {
                Chip(R.drawable.ds_clock, "${sheet.minutes} min", "Time")
                Chip(R.drawable.ds_bolt, "+${sheet.xp}", "XP")
                Chip(R.drawable.ds_words, sheet.words.toString(), "Words")
            }
            SheetButton(ctaLabel, primary = true, onClick = onStart, modifier = Modifier.padding(top = AlphonsoTokens.Space.s3))
            SheetButton("Not now", primary = false, onClick = onClose)
        }
    }
}

@Composable
private fun Chip(icon: Int, value: String, label: String) {
    val ds = LocalAlphonsoTokens.current
    Column(
        Modifier.widthIn(min = 88.dp).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card).padding(AlphonsoTokens.Space.s3).semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
            Icon(painterResource(icon), null, tint = ds.actionText, modifier = Modifier.size(AlphonsoTokens.Space.s4))
            Text(value, style = HeadlineType, color = ds.ink)
        }
        Text(label, style = CaptionType, color = ds.inkFaint)
    }
}

/** Full-width sheet button: the design system's gold primary (darker lip) or the quiet secondary. */
@Composable
private fun SheetButton(text: String, primary: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val base = if (primary) modifier.fillMaxWidth().clip(shape).background(ds.actionEdge).padding(bottom = 4.dp).clip(shape).background(ds.action)
    else modifier.fillMaxWidth().clip(shape).background(ds.card)
    Box(
        base.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onClick).padding(horizontal = AlphonsoTokens.Space.s6, vertical = AlphonsoTokens.Space.s3),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = HeadlineType, color = if (primary) ds.onAction else ds.ink) }
}
