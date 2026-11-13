package com.obsidianmedia.learnwithalphonso.ui.lesson

import kotlinx.coroutines.launch
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.font.FontStyle
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.Confetti
import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.core.logic.LessonExpression
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.core.logic.LessonXp
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPromptCopy
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.practice.call.systemMotionReduced
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoPaletteId
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

// The lesson's parts in the round-6 design system (the approved A+B mix, Royal by default): the unit's room with
// Alphonso and the HUD, his speech bubble, the numbered answer buttons, the pressable buttons, the verdict sheet,
// lesson start and lesson complete. The same parts as the web's LessonParts.tsx / LessonCelebration.tsx and the iOS
// LessonStageViews.swift. Every colour and type size is a token (LocalAlphonsoTokens, AlphonsoTokens.Type), so Meadow
// is a palette switch, and lessons stay light in night mode (LessonLightScope).

private val QuestionType by lazy { AlphonsoTokens.Type.question.toTextStyle() }
private val QuestionSmallType by lazy { AlphonsoTokens.Type.questionSmall.toTextStyle() }
private val AnswerType by lazy { AlphonsoTokens.Type.answer.toTextStyle() }
private val HeadlineType by lazy { AlphonsoTokens.Type.headline.toTextStyle() }
private val TitleType by lazy { AlphonsoTokens.Type.title.toTextStyle() }
private val BodyType by lazy { AlphonsoTokens.Type.body.toTextStyle() }
private val FootnoteType by lazy { AlphonsoTokens.Type.footnote.toTextStyle() }
private val CaptionType by lazy { AlphonsoTokens.Type.caption.toTextStyle() }
private val OverlineType by lazy { AlphonsoTokens.Type.overline.toTextStyle() }
private val DisplayXLType by lazy { AlphonsoTokens.Type.displayXL.toTextStyle() }
private val DisplayType by lazy { AlphonsoTokens.Type.display.toTextStyle() }
private val NumeralType by lazy { AlphonsoTokens.Type.numeralXL.toTextStyle() }

/** An overline role is set in capitals by the caller (TextStyle has no text case). */
@Composable
private fun Overline(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = OverlineType, color = color, modifier = modifier)
}

/**
 * Lessons stay light in night mode: the chosen palette's light values, for the design system and for the older parts
 * still inside the lesson (the vocabulary list, generated practice) alike. Meadow comes through the palette setting.
 */
@Composable
fun LessonLightScope(themeId: AlphonsoThemeId, paletteId: AlphonsoPaletteId, content: @Composable () -> Unit) {
    AlphonsoTheme(themeId, systemDark = false, paletteId = paletteId) {
        CompositionLocalProvider(LocalAlphonsoTokens provides AlphonsoTokens.colors(paletteId, false), content = content)
    }
}

/** The lesson's screen colour. */
@Composable
fun lessonSurface(): Color = LocalAlphonsoTokens.current.surface

/** The person turned system animations off: confetti stands still, numbers show their final value, swaps cut. */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember { systemMotionReduced(context) }
}

@Composable
private fun rememberAsset(path: String): ImageBitmap? {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, path) { value = withContext(Dispatchers.IO) { loadAsset(context, path) } }
    return image
}

@Composable
private fun DsIcon(res: Int, tint: Color, size: Dp = 20.dp) {
    Icon(painterResource(res), contentDescription = null, tint = tint, modifier = Modifier.size(size))
}

// ---------------------------------------------------------------- buttons

enum class EdgeVariant { PRIMARY, SECONDARY, RIGHT, WRONG }

/** The pressable button: a face over a darker bottom edge it sinks into when pressed. Disabled primary sinks flat. */
@Composable
fun LessonEdgeButton(text: String, variant: EdgeVariant, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val ds = LocalAlphonsoTokens.current
    val edgeHeight = if (variant == EdgeVariant.SECONDARY) AlphonsoTokens.Edge.secondary else AlphonsoTokens.Edge.primary
    val off = !enabled && variant == EdgeVariant.PRIMARY
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sink = when {
        off -> edgeHeight
        pressed -> edgeHeight - AlphonsoTokens.Edge.pressedSliver
        else -> 0.dp
    }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val (face, edge, ink) = when (variant) {
        EdgeVariant.PRIMARY -> Triple(Brush.verticalGradient(0f to ds.actionHi, 0.55f to ds.action), ds.actionEdge, ds.onAction)
        EdgeVariant.SECONDARY -> Triple(SolidColor(ds.card), ds.line, ds.brand)
        EdgeVariant.RIGHT -> Triple(SolidColor(ds.right), ds.rightEdge, ds.onRight)
        EdgeVariant.WRONG -> Triple(SolidColor(ds.wrong), ds.wrongEdge, ds.onWrong)
    }
    Box(modifier.fillMaxWidth().padding(bottom = edgeHeight)) {
        if (!off) Box(Modifier.matchParentSize().offset(y = edgeHeight).clip(shape).background(edge))
        Box(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).offset(y = sink).clip(shape)
                .background(if (off) SolidColor(ds.sunk) else face)
                .then(if (variant == EdgeVariant.SECONDARY) Modifier.border(2.dp, ds.line, shape) else Modifier)
                .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = AlphonsoTokens.Space.s6, vertical = AlphonsoTokens.Space.s3),
            contentAlignment = Alignment.Center,
        ) {
            Text(text, style = HeadlineType, color = if (off) ds.inkFaint else ink, textAlign = TextAlign.Center)
        }
    }
}

/** The pressable look shared by answers and word tiles: a bordered face over a coloured edge. */
@Composable
private fun Pressable(
    face: Color, border: Color, edge: Color, radius: Dp, onClick: () -> Unit, enabled: Boolean,
    modifier: Modifier = Modifier, edgeHeight: Dp = AlphonsoTokens.Edge.answer, alpha: Float = 1f, pressable: Boolean = true,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sink = if (pressable && pressed) edgeHeight - AlphonsoTokens.Edge.pressedSliver else 0.dp
    val shape = RoundedCornerShape(radius)
    Box(modifier.padding(bottom = edgeHeight).graphicsLayer { this.alpha = alpha }) {
        Box(Modifier.matchParentSize().offset(y = edgeHeight).clip(shape).background(edge))
        Box(
            Modifier.offset(y = sink).clip(shape).background(face).border(2.dp, border, shape)
                .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        ) { content() }
    }
}

/** A full-width numbered answer with a pressable bottom edge; the number becomes a tick or a cross with the verdict. */
@Composable
fun LessonAnswerButton(index: Int, label: String, state: LessonAnswerState, onClick: () -> Unit, enabled: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val face = when (state) {
        LessonAnswerState.IDLE, LessonAnswerState.DIMMED -> ds.card
        LessonAnswerState.SELECTED -> ds.choiceTint
        LessonAnswerState.CORRECT -> ds.rightTint
        LessonAnswerState.INCORRECT -> ds.wrongTint
    }
    val accent = when (state) {
        LessonAnswerState.IDLE, LessonAnswerState.DIMMED -> ds.line
        LessonAnswerState.SELECTED -> ds.choice
        LessonAnswerState.CORRECT -> ds.right
        LessonAnswerState.INCORRECT -> ds.wrong
    }
    val edge = when (state) {
        LessonAnswerState.IDLE, LessonAnswerState.DIMMED -> ds.line
        LessonAnswerState.SELECTED -> ds.choiceEdge
        LessonAnswerState.CORRECT -> ds.rightEdge
        LessonAnswerState.INCORRECT -> ds.wrongEdge
    }
    val textColor = when (state) {
        LessonAnswerState.CORRECT -> ds.rightInk
        LessonAnswerState.INCORRECT -> ds.wrongInk
        else -> ds.brand
    }
    val keyText = when (state) {
        LessonAnswerState.IDLE, LessonAnswerState.DIMMED -> ds.inkSoft
        LessonAnswerState.SELECTED -> ds.card
        LessonAnswerState.CORRECT -> ds.onRight
        LessonAnswerState.INCORRECT -> ds.onWrong
    }
    val keyFace = if (state == LessonAnswerState.IDLE || state == LessonAnswerState.DIMMED) ds.card else accent
    val spoken = when (state) {
        LessonAnswerState.SELECTED -> "Selected"
        LessonAnswerState.CORRECT -> "Correct answer"
        LessonAnswerState.INCORRECT -> "Your answer, not right"
        else -> ""
    }
    Pressable(
        face = face, border = accent, edge = edge, radius = AlphonsoTokens.Radius.control, onClick = onClick, enabled = enabled,
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            role = Role.Button
            selected = state == LessonAnswerState.SELECTED
            stateDescription = spoken
        },
        alpha = if (state == LessonAnswerState.DIMMED) 0.48f else 1f, pressable = state == LessonAnswerState.IDLE,
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 62.dp).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(30.dp).clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(keyFace)
                    .border(2.dp, if (keyFace == ds.card) ds.line else keyFace, RoundedCornerShape(AlphonsoTokens.Radius.key))
                    .clearAndSetSemantics {},
                contentAlignment = Alignment.Center,
            ) {
                when (state) {
                    LessonAnswerState.CORRECT -> DsIcon(R.drawable.ds_check, keyText, 16.dp)
                    LessonAnswerState.INCORRECT -> DsIcon(R.drawable.ds_close, keyText, 16.dp)
                    else -> Text("${index + 1}", style = CaptionType, color = keyText)
                }
            }
            Text(label, style = AnswerType, color = textColor, modifier = Modifier.weight(1f))
        }
    }
}

/** A word tile for word banks and sentence building. A placed word is solid robe blue; tap it to take it back. */
@Composable
fun LessonWordTile(word: String, onClick: () -> Unit, enabled: Boolean, picked: Boolean = false, placed: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    Pressable(
        face = if (placed) ds.choice else if (picked) ds.choiceTint else ds.card,
        border = if (placed || picked) ds.choice else ds.line,
        edge = if (placed || picked) ds.choiceEdge else ds.line,
        radius = 14.dp, onClick = onClick, enabled = enabled,
        edgeHeight = if (placed) 3.dp else AlphonsoTokens.Edge.answer,
        alpha = if (!enabled && !placed) 0.6f else 1f, pressable = !placed,
        modifier = Modifier.semantics(mergeDescendants = true) {
            role = Role.Button
            selected = picked
            if (placed) stateDescription = "In your sentence. Tap to take it back"
        },
    ) {
        Text(word, style = AnswerType, color = if (placed) ds.card else ds.brand, modifier = Modifier.heightIn(min = 48.dp).padding(horizontal = AlphonsoTokens.Space.s4, vertical = 10.dp))
    }
}

// ---------------------------------------------------------------- HUD

/** Close, the thick progress bar and the hearts pill (∞ for Alphonso Pro), floating over the room. */
@Composable
fun LessonHud(progress: Float, hearts: Int?, onClose: () -> Unit, onLight: Boolean = false, valueText: String? = null) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    val pill = if (onLight) ds.card else ds.card.copy(alpha = 0.9f)
    val clamped = progress.coerceIn(0f, 1f)
    val shown by animateFloatAsState(clamped, if (reduce) snap() else tween(AlphonsoTokens.Motion.PROGRESS_MS, easing = AlphonsoTokens.Motion.outEasing), label = "progress")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        Box(
            Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Close", onClick = onClose)
                .semantics { contentDescription = "Close" },
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(40.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(pill), contentAlignment = Alignment.Center) {
                DsIcon(R.drawable.ds_close, ds.brand)
            }
        }
        Box(
            Modifier.weight(1f).height(16.dp).clip(RoundedCornerShape(8.dp)).background(if (onLight) ds.sunk else ds.card.copy(alpha = 0.6f))
                .semantics {
                    contentDescription = "Lesson progress"
                    progressBarRangeInfo = ProgressBarRangeInfo(clamped, 0f..1f)
                    valueText?.let { stateDescription = it }
                },
        ) {
            Box(Modifier.fillMaxWidth(shown).height(16.dp).clip(RoundedCornerShape(8.dp)).background(ds.action)) {
                Box(Modifier.fillMaxWidth().height(3.dp).align(Alignment.BottomCenter).background(ds.actionEdge.copy(alpha = 0.6f)))
                Box(Modifier.fillMaxWidth().padding(horizontal = 4.dp).height(3.dp).align(Alignment.TopCenter).background(ds.card.copy(alpha = 0.42f)))
            }
        }
        Row(
            Modifier.height(40.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(pill).padding(start = 10.dp, end = 14.dp)
                .clearAndSetSemantics { contentDescription = hearts?.let { "$it hearts" } ?: "Unlimited hearts" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DsIcon(R.drawable.ds_heart_solid, ds.heart, 22.dp)
            Text(hearts?.toString() ?: "∞", style = HeadlineType, color = ds.ink)
        }
    }
}

// ---------------------------------------------------------------- room

/**
 * The unit's room with Alphonso standing in it, bottom-centred and slightly cut by the bubble. His expression swaps
 * with a short crossfade (a cut under Reduce Motion). [overlay] sits above everything (the HUD, a title, confetti).
 */
@Composable
fun LessonRoom(
    roomId: String, expression: LessonExpression, height: Dp, alphonsoWidth: Dp,
    glow: Boolean = false, titleScrim: Boolean = false, overlay: @Composable () -> Unit = {},
) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    val room = rememberAsset("scenes/$roomId.webp") ?: rememberAsset("scenes/${LessonStage.FALLBACK_ROOM}.webp")
    BoxWithConstraints(Modifier.fillMaxWidth().height(height).clipToBounds().background(ds.sunk)) {
        room?.let {
            // "center 38%": the room's focus sits a little above the middle.
            Image(it, contentDescription = null, contentScale = ContentScale.Crop, alignment = BiasAlignment(0f, -0.24f), modifier = Modifier.fillMaxSize())
        }
        val scrim = if (titleScrim) {
            Brush.verticalGradient(0f to ds.heroB.copy(alpha = 0.46f), 0.3f to Color.Transparent, 0.48f to Color.Transparent, 1f to ds.heroB.copy(alpha = 0.72f))
        } else {
            Brush.verticalGradient(0f to ds.heroB.copy(alpha = 0.46f), 0.3f to Color.Transparent, 0.62f to Color.Transparent, 1f to ds.surface)
        }
        Box(Modifier.fillMaxSize().background(scrim))
        if (glow) {
            val w = constraints.maxWidth.toFloat()
            val h = constraints.maxHeight.toFloat()
            Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(ds.onHeroKick.copy(alpha = 0.55f), Color.Transparent), center = Offset(w / 2, h * 0.64f), radius = w * 0.6f)))
        }
        Crossfade(
            targetState = expression, animationSpec = if (reduce) snap() else tween(AlphonsoTokens.Motion.SWAP_MS), label = "expression",
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = LessonStage.ALPHONSO_SINK.dp)
                .requiredSize(alphonsoWidth).semantics { contentDescription = expression.description },
        ) { e ->
            rememberAsset("lesson/${e.file}.webp")?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize()) }
        }
        overlay()
    }
}

// ---------------------------------------------------------------- bubble

/** Alphonso's line: a play button that reads it aloud, a small label ("Alphonso asks") and the text. The tail points up at him. */
@Composable
fun AlphonsoBubble(label: String, text: String, onPlay: (() -> Unit)?, playLabel: String = "Play the question", compact: Boolean = false, heading: Boolean = true) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Box {
        Box(Modifier.align(Alignment.TopCenter).offset(y = (-7).dp).size(18.dp).rotate(45f).clip(RoundedCornerShape(4.dp)).background(ds.card))
        Row(
            Modifier.fillMaxWidth().shadow(10.dp, shape, ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint)
                .clip(shape).background(ds.card).padding(start = 14.dp, top = 14.dp, bottom = 14.dp, end = AlphonsoTokens.Space.s4),
            horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Box(
                Modifier.size(44.dp).clip(CircleShape).background(ds.choiceTint).border(1.5.dp, ds.choice.copy(alpha = 0.18f), CircleShape)
                    .then(if (onPlay != null) Modifier.clickable(role = Role.Button, onClickLabel = playLabel, onClick = onPlay).semantics { contentDescription = playLabel } else Modifier.clearAndSetSemantics {}),
                contentAlignment = Alignment.Center,
            ) { DsIcon(if (onPlay != null) R.drawable.ds_play else R.drawable.ds_speaker, ds.choice) }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Overline(label, ds.actionText, Modifier.padding(top = 2.dp))
                Text(text, style = if (compact) QuestionSmallType else QuestionType, color = ds.brand, modifier = if (heading) Modifier.semantics { heading() } else Modifier)
            }
        }
    }
}

// ---------------------------------------------------------------- inputs and cards

/** The written-answer field in the lesson's answer style. */
@Composable
fun LessonTextField(value: String, onChange: (String) -> Unit, placeholder: String, enabled: Boolean, multiline: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Box(Modifier.fillMaxWidth().padding(bottom = AlphonsoTokens.Edge.answer)) {
        Box(Modifier.matchParentSize().offset(y = AlphonsoTokens.Edge.answer).clip(shape).background(ds.line))
        BasicTextField(
            value = value, onValueChange = onChange, enabled = enabled, singleLine = !multiline, minLines = if (multiline) 2 else 1,
            textStyle = AnswerType.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice),
            modifier = Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, if (focused) ds.choice else ds.line, shape)
                .onFocusChanged { focused = it.isFocused }.semantics { contentDescription = "Your answer" },
            decorationBox = { inner ->
                Box(Modifier.padding(AlphonsoTokens.Space.s4)) {
                    if (value.isEmpty()) Text(placeholder, style = AnswerType, color = ds.inkFaint)
                    inner()
                }
            },
        )
    }
}

/** A small card on the lesson's surface. */
@Composable
fun LessonCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(
        modifier.fillMaxWidth().shadow(2.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(ds.card).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) { content() }
}

/** The phrase to say, with "Hear it first". */
@Composable
fun LessonSpeakPhraseCard(phrase: String, onHear: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    LessonCard {
        Overline("Your phrase", ds.inkSoft)
        Text(phrase, style = TitleType, color = ds.brand)
        Row(
            Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(CircleShape).background(ds.choiceTint).clickable(role = Role.Button, onClick = onHear).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DsIcon(R.drawable.ds_speaker, ds.choice, 18.dp)
            Text("Hear it first", style = HeadlineType, color = ds.choice)
        }
    }
}

/** A short note, such as the translation grader's reason. */
@Composable
fun LessonNote(text: String) {
    val ds = LocalAlphonsoTokens.current
    LessonCard { Text(text, style = FootnoteType, color = ds.ink) }
}

/** The sentence being built in a word-order question: a dashed well holding the placed words. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LessonSentenceSlot(isEmpty: Boolean, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(18.dp)).background(ds.sunk)
            .drawDashedBorder(ds.line).padding(AlphonsoTokens.Space.s3)
            .semantics { contentDescription = "Your sentence" },
    ) {
        if (isEmpty) Text("Tap the words below in order", style = FootnoteType, color = ds.inkFaint, modifier = Modifier.align(Alignment.CenterStart))
        else FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) { content() }
    }
}

private fun Modifier.drawDashedBorder(color: Color): Modifier = drawBehind {
    drawRoundRect(color = color, cornerRadius = CornerRadius(18.dp.toPx()), style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))))
}

/** Rows of word tiles that wrap. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LessonWordRow(content: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) { content() }
}

// ---------------------------------------------------------------- verdict sheet

/**
 * The verdict, pinned to the bottom of the lesson: Alphonso's face, Exactly! or Not quite, the XP for a right answer
 * (only XP the server will pay), the correct answer first when you missed (with a speaker), the one-line why, and the
 * button on. It slides up (a fade under Reduce Motion). Long reasons scroll inside it while the button stays put.
 */
@Composable
fun LessonVerdictSheet(
    correct: Boolean, title: String, xp: Int?, correctAnswer: String, onHearAnswer: () -> Unit,
    continueLabel: String, onContinue: () -> Unit,
    /** Under the one-line why, above the button: the "Explain in my language" chip on a wrong answer. */
    extra: @Composable () -> Unit = {},
    explanation: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    val face = rememberAsset("lesson/${if (correct) LessonExpression.HAPPY.file else LessonExpression.HMM.file}.webp")
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    AnimatedVisibility(
        visible = shown,
        enter = if (reduce) fadeIn(tween(AlphonsoTokens.Motion.REDUCED_MAX_MS)) else slideInVertically(tween(AlphonsoTokens.Motion.SHEET_WEB_MS, easing = AlphonsoTokens.Motion.sheetEasing)) { it },
    ) {
        val spoken = if (correct) (xp?.let { "$title Plus $it XP." } ?: title) else "$title. The correct answer is $correctAnswer."
        Column(
            Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet))
                .clip(RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet))
                .background(if (correct) ds.rightTint else ds.wrongTint)
                .padding(start = AlphonsoTokens.Space.s4, end = AlphonsoTokens.Space.s4, top = AlphonsoTokens.Space.s5, bottom = AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Row(
                Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite; contentDescription = spoken },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Box(Modifier.size(56.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(ds.card).border(3.dp, ds.card, CircleShape)) {
                    face?.let {
                        Image(it, null, contentScale = ContentScale.Crop, alignment = BiasAlignment(0f, -0.52f), modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = 1.9f; scaleY = 1.9f; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 0.24f) })
                    }
                }
                Text(title, style = TitleType, color = if (correct) ds.rightInk else ds.wrongInk, modifier = Modifier.weight(1f))
                if (xp != null) {
                    Row(
                        Modifier.clip(CircleShape).background(ds.card).padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        DsIcon(R.drawable.ds_bolt_solid, ds.xp, 16.dp)
                        Text("+$xp XP", style = FootnoteType, color = ds.rightInk)
                    }
                }
            }
            if (!correct && correctAnswer.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card.copy(alpha = 0.75f)).padding(horizontal = AlphonsoTokens.Space.s3, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Overline("Correct answer", ds.wrongInk)
                        Text(correctAnswer, style = HeadlineType, color = ds.ink)
                    }
                    Box(
                        Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).clickable(role = Role.Button, onClick = onHearAnswer)
                            .semantics { contentDescription = "Hear the correct answer" },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(ds.card).border(1.5.dp, ds.line, CircleShape), contentAlignment = Alignment.Center) {
                            DsIcon(R.drawable.ds_speaker, ds.choice, 18.dp)
                        }
                    }
                }
            }
            Column(Modifier.heightIn(max = 116.dp).verticalScroll(rememberScrollState())) { explanation() }
            // Its own scroll, so a long explanation in the learner's language never pushes the button off the screen.
            Column(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) { extra() }
            LessonEdgeButton(continueLabel, if (correct) EdgeVariant.RIGHT else EdgeVariant.WRONG, onContinue, Modifier.padding(top = 2.dp))
        }
    }
}

/** The one-line why in the sheet, in the body type. */
@Composable
fun lessonBodyStyle(): TextStyle = BodyType

// ---------------------------------------------------------------- lesson start

data class LessonStartStep(val icon: Int, val label: String, val detail: String)

/** Lesson start, set in the unit's room: unit and title over it, the honest estimate, the steps and the gold Start. */
@Composable
fun LessonStart(roomId: String, unitLine: String, title: String, meta: String, steps: List<LessonStartStep>, hearts: Int?, onClose: () -> Unit, onStart: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            LessonRoom(roomId, LessonExpression.TALK, 380.dp, 335.dp, titleScrim = true) {
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.padding(AlphonsoTokens.Space.s4)) { LessonHud(0f, hearts, onClose) }
                    Spacer(Modifier.weight(1f))
                    Column(Modifier.padding(start = 18.dp, end = 18.dp, bottom = AlphonsoTokens.Space.s4)) {
                        Overline(unitLine, ds.onHeroKick)
                        Text(title, style = DisplayXLType.copy(shadow = androidx.compose.ui.graphics.Shadow(ds.heroB.copy(alpha = 0.6f), Offset(0f, 4f), 12f)), color = ds.onHero, modifier = Modifier.semantics { heading() })
                    }
                }
            }
            Text(meta, style = FootnoteType, color = ds.inkSoft, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = AlphonsoTokens.Space.s3))
            Column(Modifier.padding(start = AlphonsoTokens.Space.s4, end = AlphonsoTokens.Space.s4, top = AlphonsoTokens.Space.s3), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                steps.forEach { step ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                            .border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                            .padding(horizontal = AlphonsoTokens.Space.s3, vertical = 10.dp).semantics(mergeDescendants = true) {},
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                    ) {
                        Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(ds.choiceTint), contentAlignment = Alignment.Center) { DsIcon(step.icon, ds.actionText) }
                        Column(Modifier.weight(1f)) {
                            Text(step.label, style = HeadlineType, color = ds.brand)
                            Text(step.detail, style = CaptionType, color = ds.inkSoft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Box(Modifier.background(ds.surface).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3)) {
            LessonEdgeButton("Start lesson", EdgeVariant.PRIMARY, onStart)
        }
    }
}

// ---------------------------------------------------------------- lesson complete

/** The confetti over the room: falls once, then rests as a still scatter; under Reduce Motion only the scatter. */
@Composable
fun LessonConfetti(reduce: Boolean, modifier: Modifier = Modifier, seed: Int = 7) {
    val ds = LocalAlphonsoTokens.current
    var t by remember { mutableStateOf(if (reduce) Confetti.SECONDS else -0.15) }
    if (!reduce) {
        LaunchedEffect(Unit) {
            val start = withFrameNanos { it }
            while (t < Confetti.SECONDS) {
                // 150 ms after the room appears, per the spec's timeline.
                t = withFrameNanos { (it - start) / 1e9 - 0.15 }
            }
        }
    }
    Canvas(modifier.fillMaxSize().clearAndSetSemantics {}) {
        val density = density
        val pieces = Confetti.pieces(seed, (size.width / density).toDouble())
        for (p in pieces) {
            val (x, y, angle) = if (t >= Confetti.SECONDS) Triple(p.restX, p.restY, p.rot) else if (t < 0) continue else Confetti.position(p, t).let { Triple(it.x, it.y, it.angle) }
            val colour = when (p.colour) {
                Confetti.Colour.XP -> ds.xp
                Confetti.Colour.ON_HERO_KICK -> ds.onHeroKick
                Confetti.Colour.BRAND -> ds.brand
                Confetti.Colour.CHOICE -> ds.choice
                Confetti.Colour.CARD -> ds.card
                Confetti.Colour.XP_EDGE -> ds.xpEdge
            }
            translate((x * density).toFloat(), (y * density).toFloat()) {
                rotateRad(angle.toFloat(), pivot = Offset.Zero) {
                    if (p.star) {
                        val path = Path()
                        for (k in 0 until 10) {
                            val r = (if (k % 2 == 1) 3f else 7f) * density
                            val a = k * Math.PI / 5
                            val px = (cos(a) * r).toFloat()
                            val py = (sin(a) * r).toFloat()
                            if (k == 0) path.moveTo(px, py) else path.lineTo(px, py)
                        }
                        path.close()
                        drawPath(path, colour)
                    } else {
                        val w = (p.w * density).toFloat()
                        val h = (p.h * density).toFloat()
                        drawRect(colour, topLeft = Offset(-w / 2, -h / 2), size = Size(w, h))
                    }
                }
            }
        }
    }
}

enum class TileKind { XP, STREAK, ACCURACY, TIME }

private data class TileLook(val title: String, val icon: Int, val tone: Color, val tint: Color)

/** One reward tile: a coloured top edge, an icon, a condensed number that counts up, and its name. */
@Composable
fun LessonRewardTile(kind: TileKind, value: String, index: Int, reduce: Boolean, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val look = when (kind) {
        TileKind.XP -> TileLook("XP earned", R.drawable.ds_bolt_solid, ds.xp, ds.xpTint)
        TileKind.STREAK -> TileLook("Day streak", R.drawable.ds_flame_solid, ds.flame, ds.flameTint)
        TileKind.ACCURACY -> TileLook("Accuracy", R.drawable.ds_target, ds.choice, ds.choiceTint)
        TileKind.TIME -> TileLook("Time", R.drawable.ds_clock, ds.brand, ds.sunk)
    }
    val spokenTitle = when (kind) { TileKind.XP -> "XP"; TileKind.STREAK -> "Streak"; TileKind.ACCURACY -> "Accuracy"; TileKind.TIME -> "Time" }
    val number = Regex("\\d+").find(value)
    val shown = remember { Animatable(if (reduce) 1f else 0f) }
    val count = remember { Animatable(if (reduce || kind == TileKind.TIME || number == null) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (reduce) return@LaunchedEffect
        val delayMs = 600L + index * 120L
        delay(delayMs)
        shown.animateTo(1f, tween(AlphonsoTokens.Motion.SHEET_WEB_MS, easing = AlphonsoTokens.Motion.outEasing))
        count.animateTo(1f, tween(AlphonsoTokens.Motion.COUNT_UP_MS, easing = AlphonsoTokens.Motion.outEasing))
    }
    val display = if (number != null && kind != TileKind.TIME) {
        val n = (number.value.toInt() * count.value).toInt()
        value.substring(0, number.range.first) + n + value.substring(number.range.last + 1)
    } else value
    Column(
        modifier.graphicsLayer { alpha = shown.value; translationY = (1 - shown.value) * 14 * density }
            .shadow(2.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(ds.card)
            .clearAndSetSemantics { contentDescription = "$spokenTitle: $value" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().height(4.dp).background(look.tone))
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s3), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(look.tint), contentAlignment = Alignment.Center) { DsIcon(look.icon, look.tone) }
            Text(display, style = NumeralType, color = ds.ink)
            Text(look.title, style = CaptionType, color = ds.inkSoft)
        }
    }
}

/** A new achievement: a gold medal on navy, sliding in after the tiles (a fade under Reduce Motion). */
@Composable
fun LessonAchievementToast(title: String, detail: String, index: Int, reduce: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val shown = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        if (!reduce) delay(1_700L + index * 250L)
        shown.animateTo(1f, tween(if (reduce) AlphonsoTokens.Motion.REDUCED_MAX_MS else AlphonsoTokens.Motion.SHEET_WEB_MS))
    }
    Row(
        Modifier.fillMaxWidth().graphicsLayer { alpha = shown.value; translationY = if (reduce) 0f else (1 - shown.value) * -16 * density }
            .shadow(10.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(ds.hero)
            .padding(AlphonsoTokens.Space.s3).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Box(
            Modifier.size(56.dp).clip(CircleShape).background(Brush.radialGradient(listOf(ds.xpTint, ds.xp, ds.xpEdge))),
            contentAlignment = Alignment.Center,
        ) { DsIcon(R.drawable.ds_trophy, ds.brand, 28.dp) }
        Column(Modifier.weight(1f)) {
            Overline("Achievement unlocked", ds.onHeroKick)
            Text(title, style = HeadlineType, color = ds.onHero)
            Text(detail, style = FootnoteType, color = ds.onHeroSoft)
        }
    }
}

/** The in-app reminder card on lesson complete. The system permission is only requested from Remind me. */
@Composable
fun LessonReminderCard(onRemindMe: () -> Unit, onNotNow: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    LessonCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(ReminderPromptCopy.TITLE, style = HeadlineType, color = ds.brand, modifier = Modifier.semantics { heading() })
        Text(ReminderPromptCopy.BODY, style = FootnoteType, color = ds.inkSoft)
        LessonEdgeButton(ReminderPromptCopy.ACCEPT, EdgeVariant.PRIMARY, onRemindMe, Modifier.heightIn(min = 48.dp))
        LessonEdgeButton(ReminderPromptCopy.DECLINE, EdgeVariant.SECONDARY, onNotNow, Modifier.heightIn(min = 48.dp))
    }
}

/**
 * Lesson complete, celebrated in the unit's room in code: confetti in the robe's colours, Alphonso going "wow" then
 * smiling, his line in the bubble, reward tiles that count up (XP, streak, accuracy, time), the XP lines that add up
 * to the award, the hearts bonus, achievement toasts and the review list. [extras] carries the rest of the existing
 * mechanics (the reminder card, generated practice). Reduce Motion: a still scatter, final numbers, fades only.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LessonComplete(
    roomId: String, headline: String, onHearHeadline: () -> Unit, tiles: List<Pair<TileKind, String>>, xpLines: List<LessonXp.Line>,
    correct: Int, total: Int, heartsBonus: String?, achievements: List<Pair<String, String>>, missed: List<MissedQuestion>,
    continueLabel: String, onContinue: () -> Unit, extras: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    var amazed by remember { mutableStateOf(!reduce) }
    LaunchedEffect(Unit) {
        if (reduce) return@LaunchedEffect
        delay(1_400)
        amazed = false
    }
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            LessonRoom(roomId, if (amazed) LessonExpression.WOW else LessonExpression.HAPPY, 430.dp, 345.dp, glow = true) {
                LessonConfetti(reduce)
                Text(
                    "Lesson complete", style = DisplayXLType, color = ds.onHero, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 48.dp).semantics { heading() },
                )
            }
            Column(Modifier.padding(horizontal = AlphonsoTokens.Space.s4).offset(y = (-36).dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                AlphonsoBubble("Alphonso says", headline, onHearHeadline, playLabel = "Hear Alphonso", compact = true, heading = false)
                val columns = if (tiles.size == 4) 2 else max(1, tiles.size)
                tiles.chunked(columns).forEachIndexed { row, chunk ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        chunk.forEachIndexed { i, (kind, value) ->
                            LessonRewardTile(kind, value, row * columns + i, reduce, Modifier.weight(1f))
                        }
                    }
                }
                if (xpLines.size > 1) {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4, Alignment.CenterHorizontally)) {
                        xpLines.forEach { Text(it.text, style = FootnoteType, color = ds.inkSoft) }
                    }
                }
                Text("$correct/$total correct", style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                heartsBonus?.let {
                    Row(
                        Modifier.align(Alignment.CenterHorizontally).heightIn(min = 34.dp).clip(CircleShape).background(ds.heartTint).padding(start = 10.dp, end = 14.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        DsIcon(R.drawable.ds_heart_solid, ds.heart, 18.dp)
                        Text(if (it == "streak") "Streak milestone: hearts fully refilled" else "Perfect lesson: +1 heart", style = FootnoteType, color = ds.heartText)
                    }
                }
                achievements.forEachIndexed { i, (title, detail) -> LessonAchievementToast(title, detail, i, reduce) }
                extras()
                if (missed.isNotEmpty()) {
                    Overline("Review · ${missed.size} to practice again", ds.inkSoft)
                    missed.forEach { m ->
                        LessonCard {
                            Text(m.prompt, style = FootnoteType, color = ds.ink)
                            Text(
                                buildAnnotatedString {
                                    append("You said ")
                                    withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(m.yours) }
                                    append(" · ")
                                    withStyle(SpanStyle(color = ds.rightInk)) { append(m.answer) }
                                },
                                style = CaptionType, color = ds.inkSoft,
                                modifier = Modifier.semantics { contentDescription = "You said ${m.yours}. Answer: ${m.answer}" },
                            )
                        }
                    }
                }
            }
        }
        Box(Modifier.background(ds.surface.copy(alpha = 0.95f)).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3)) {
            LessonEdgeButton(continueLabel, EdgeVariant.PRIMARY, onContinue)
        }
    }
}

// ---------------------------------------------------------------- words to learn

/** "Next word" until the last card, then "Start practice" (the web's vocab-deck.ts, iOS VocabDeck). */
fun vocabDeckButtonTitle(index: Int, count: Int): String = if (index < count - 1) "Next word" else "Start practice"

/**
 * Words to learn, one big card at a time (visual round 6): the word, its sound, the meaning and an example, with
 * Alphonso peeking over the corner. "Next word" moves on, the last card starts practice, Skip goes straight there, and
 * swiping moves between cards.
 */
@Composable
fun LessonWordDeck(
    overline: String,
    title: String,
    items: List<VocabItem>,
    hearts: Int?,
    onClose: () -> Unit,
    onSpeak: (String) -> Unit,
    image: @Composable (VocabImageRef) -> Unit,
    onStart: () -> Unit,
    /** Under the example on each card: the "Explain in my language" block for the word. */
    extra: @Composable (VocabItem) -> Unit = {},
) {
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    val pager = rememberPagerState { items.size }
    val scope = rememberCoroutineScope()
    val page = pager.currentPage
    val avatar = rememberAsset("lesson/talk.webp")
    // The pager runs edge to edge so the card's shadow and Alphonso's corner are not clipped; the rest keeps the gutter.
    val gutter = Modifier.padding(horizontal = AlphonsoTokens.Space.s4)
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Box(gutter.padding(top = AlphonsoTokens.Space.s2)) { LessonHud(0f, hearts, onClose, onLight = true) }
        Overline(overline, ds.actionText, gutter.padding(top = AlphonsoTokens.Space.s4))
        Text(title, style = DisplayType, color = ds.brand, modifier = gutter.padding(top = AlphonsoTokens.Space.s1).semantics { heading() })
        Row(gutter.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1), verticalAlignment = Alignment.CenterVertically) {
            Text("Word ${page + 1} of ${items.size}", style = FootnoteType, color = ds.inkSoft, modifier = Modifier.weight(1f))
            if (items.size > 1) {
                TextButton(onClick = onStart) { Text("Skip to practice", style = FootnoteType, color = ds.choice) }
            }
        }
        HorizontalPager(pager, Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) { index ->
            val item = items[index]
            Box(Modifier.fillMaxWidth().padding(start = AlphonsoTokens.Space.s4, end = AlphonsoTokens.Space.s4, top = AlphonsoTokens.Space.s4, bottom = AlphonsoTokens.Space.s6)) {
                Column(
                    Modifier.fillMaxWidth()
                        .shadow(14.dp, RoundedCornerShape(AlphonsoTokens.Radius.sheet), ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint)
                        .clip(RoundedCornerShape(AlphonsoTokens.Radius.sheet)).background(ds.card).padding(AlphonsoTokens.Space.s3),
                    verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                ) {
                    item.image?.let { image(it) }
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).background(ds.choiceTint)
                            .padding(vertical = AlphonsoTokens.Space.s8, horizontal = AlphonsoTokens.Space.s4),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4),
                    ) {
                        Text(item.term, style = DisplayXLType, color = ds.brand, textAlign = TextAlign.Center)
                        Box(
                            Modifier.size(AlphonsoTokens.Space.s12).clip(CircleShape).background(ds.card).border(2.dp, ds.line, CircleShape)
                                .clickable(role = Role.Button, onClickLabel = "Hear it") { onSpeak(item.term) }
                                .semantics { contentDescription = "Hear ${item.term}" },
                            contentAlignment = Alignment.Center,
                        ) { DsIcon(R.drawable.ds_speaker, ds.choice) }
                    }
                    if (item.meaning.isNotEmpty()) {
                        Text(item.meaning, style = BodyType, color = ds.inkSoft, modifier = Modifier.padding(horizontal = AlphonsoTokens.Space.s2))
                    }
                    if (item.example.isNotEmpty()) {
                        Text(
                            item.example, style = BodyType.copy(fontStyle = FontStyle.Italic), color = ds.brand,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.sunk)
                                .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
                        )
                    }
                    extra(item)
                }
                // Alphonso peeks over the card's corner.
                avatar?.let {
                    Image(
                        it, contentDescription = null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter,
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = AlphonsoTokens.Space.s1, y = -AlphonsoTokens.Space.s2)
                            .size(64.dp).clip(CircleShape).background(ds.card).border(3.dp, ds.card, CircleShape),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, horizontalArrangement = Arrangement.Center) {
            items.indices.forEach { i ->
                Box(Modifier.padding(horizontal = 3.dp).size(width = if (i == page) 20.dp else 8.dp, height = 8.dp).clip(CircleShape).background(if (i == page) ds.xp else ds.line))
            }
        }
        Spacer(Modifier.weight(1f))
        Box(gutter.padding(vertical = AlphonsoTokens.Space.s3)) {
            LessonEdgeButton(vocabDeckButtonTitle(page, items.size), EdgeVariant.PRIMARY, {
                if (page < items.size - 1) {
                    scope.launch { if (reduce) pager.scrollToPage(page + 1) else pager.animateScrollToPage(page + 1) }
                } else {
                    onStart()
                }
            })
        }
    }
}
