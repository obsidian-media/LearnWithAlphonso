package com.obsidianmedia.learnwithalphonso.ui.firstrun

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
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Grass
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Park
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SentimentSatisfied
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush as GradientBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.obsidianmedia.learnwithalphonso.core.firstrun.AgeChoice
import com.obsidianmedia.learnwithalphonso.core.firstrun.ProfileAvatars
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.core.logic.avatarRgb
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// The first run's parts in the round-6 design system, the same as the web's FirstRunParts.tsx and the iOS
// FirstRunParts.swift: the room with Alphonso (or Hector) and the HUD, his bubble with a speaker, the choice rows and
// tiles, the age cards, the interest chips, the picker rows, the flag switch and the footer. Every colour and type size
// is a token (LocalAlphonsoTokens, AlphonsoTokens.Type); the screens stay light like the lesson (LessonLightScope).

internal val TitleType by lazy { AlphonsoTokens.Type.title.toTextStyle() }
internal val DisplayType by lazy { AlphonsoTokens.Type.display.toTextStyle() }
internal val HeadlineType by lazy { AlphonsoTokens.Type.headline.toTextStyle() }
internal val BodyType by lazy { AlphonsoTokens.Type.body.toTextStyle() }
internal val FootnoteType by lazy { AlphonsoTokens.Type.footnote.toTextStyle() }
internal val CaptionType by lazy { AlphonsoTokens.Type.caption.toTextStyle() }
internal val OverlineType by lazy { AlphonsoTokens.Type.overline.toTextStyle() }
internal val NumeralType by lazy { AlphonsoTokens.Type.numeral.toTextStyle() }

/** The web's first-run icons as Material icons, by the core's semantic names. */
internal fun firstRunIcon(name: String): ImageVector = when (name) {
    "plane" -> Icons.Filled.Flight
    "brief" -> Icons.Filled.Work
    "cap" -> Icons.Filled.School
    "home" -> Icons.Filled.Home
    "medal" -> Icons.Filled.MilitaryTech
    "smile" -> Icons.Filled.SentimentSatisfied
    "seed" -> Icons.Filled.Grass
    "sprout" -> Icons.Filled.Spa
    "tree" -> Icons.Filled.Park
    "food" -> Icons.Filled.Restaurant
    "ball" -> Icons.Filled.SportsSoccer
    "music" -> Icons.Filled.MusicNote
    "film" -> Icons.Filled.Movie
    "chip" -> Icons.Filled.Memory
    "leaf" -> Icons.Filled.Eco
    "brush" -> Icons.Filled.Brush
    "people" -> Icons.Filled.People
    "globe" -> Icons.Filled.Language
    "pin" -> Icons.Filled.Place
    "store" -> Icons.Filled.Storefront
    "search" -> Icons.Filled.Search
    "share" -> Icons.Filled.Share
    "pod" -> Icons.Filled.Podcasts
    "chat" -> Icons.Outlined.ChatBubbleOutline
    "brain" -> Icons.Filled.Psychology
    "heartc" -> Icons.Filled.FavoriteBorder
    "mail" -> Icons.Filled.Email
    "cal" -> Icons.Filled.CalendarMonth
    "clock" -> Icons.Filled.Schedule
    "target" -> Icons.Filled.TrackChanges
    else -> Icons.Filled.Circle
}

@Composable
internal fun FirstRunIcon(name: String, tint: Color, size: Dp = 22.dp) {
    Icon(firstRunIcon(name), contentDescription = null, tint = tint, modifier = Modifier.size(size))
}

@Composable
internal fun rememberFirstRunAsset(path: String): ImageBitmap? {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, path) { value = withContext(Dispatchers.IO) { loadAsset(context, path) } }
    return image
}

// ---------------------------------------------------------------- screen

/**
 * A first-run screen: the room on top running under the status bar, Alphonso's bubble overlapping its foot, the
 * step's content, and the footer pinned to the bottom. The content scrolls, so the largest font size never clips.
 */
@Composable
internal fun FirstRunScreen(
    footerPadded: Boolean = true,
    room: @Composable ColumnScope.() -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            room()
            content()
            Spacer(Modifier.height(AlphonsoTokens.Space.s4))
        }
        // The verdict sheet runs edge to edge (footerPadded = false); buttons sit inside the gutter.
        Column(
            Modifier.fillMaxWidth().background(ds.surface).navigationBarsPadding()
                .then(
                    if (footerPadded) Modifier.padding(start = AlphonsoTokens.Space.gutter, end = AlphonsoTokens.Space.gutter, top = AlphonsoTokens.Space.s3, bottom = AlphonsoTokens.Space.s2)
                    else Modifier,
                ),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        ) { footer() }
    }
}

enum class RoomSize(val height: Dp) { NORMAL(230.dp), TALL(380.dp), HERO(300.dp) }

/** The room with a figure standing in it, bottom-centred; the HUD (or a badge) floats over it. */
@Composable
internal fun FirstRunRoom(
    roomId: String,
    figurePath: String,
    figureLabel: String,
    size: RoomSize = RoomSize.NORMAL,
    chip: String? = null,
    top: @Composable () -> Unit = {},
) {
    val ds = LocalAlphonsoTokens.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val room = rememberFirstRunAsset("scenes/$roomId.webp") ?: rememberFirstRunAsset("scenes/${LessonStage.FALLBACK_ROOM}.webp")
    val figure = rememberFirstRunAsset(figurePath)
    BoxWithConstraints(Modifier.fillMaxWidth().height(size.height + statusTop).clipToBounds().background(ds.sunk)) {
        val figureSide = minOf(maxWidth * 0.62f, maxHeight * 0.82f)
        room?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, alignment = BiasAlignment(0f, -0.24f), modifier = Modifier.fillMaxSize()) }
        Box(Modifier.fillMaxSize().background(GradientBrush.verticalGradient(0f to ds.heroB.copy(alpha = 0.46f), 0.3f to Color.Transparent, 0.72f to Color.Transparent, 1f to ds.surface)))
        figure?.let {
            Image(
                it, contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = LessonStage.ALPHONSO_SINK.dp).requiredSize(figureSide)
                    .semantics { contentDescription = figureLabel; role = Role.Image },
            )
        }
        chip?.let {
            Row(
                Modifier.align(Alignment.BottomEnd).padding(end = AlphonsoTokens.Space.gutter, bottom = AlphonsoTokens.Space.s6)
                    .shadow(2.dp, CircleShape).clip(CircleShape).background(ds.card).padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(ds.action))
                Text(it, style = CaptionType, color = ds.brand)
            }
        }
        Box(Modifier.fillMaxWidth().padding(top = statusTop + AlphonsoTokens.Space.s2, start = AlphonsoTokens.Space.gutter, end = AlphonsoTokens.Space.gutter)) { top() }
    }
}

/** Back, the dashes and "Question 3 of 8", and Skip, over the room. */
@Composable
internal fun FirstRunHud(
    step: Int = 0, total: Int = 0, showCounter: Boolean = true, backLabel: String = "Back",
    onBack: (() -> Unit)? = null, onSkip: (() -> Unit)? = null,
) {
    val ds = LocalAlphonsoTokens.current
    val counted = showCounter && total > 0
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            if (onBack != null) {
                Box(
                    Modifier.size(AlphonsoTokens.Space.minTouch).shadow(2.dp, CircleShape).clip(CircleShape).background(ds.card)
                        .clickable(role = Role.Button, onClickLabel = backLabel, onClick = onBack).semantics { contentDescription = backLabel },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = ds.brand, modifier = Modifier.size(20.dp)) }
            }
            if (counted) {
                Row(
                    Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = "Question $step of $total" },
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    repeat(total) { i -> Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(if (i < step) ds.action else ds.card.copy(alpha = 0.7f))) }
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
            if (onSkip != null) {
                Box(
                    Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onSkip).padding(horizontal = AlphonsoTokens.Space.s2),
                    contentAlignment = Alignment.Center,
                ) { Text("Skip", style = HeadlineType, color = ds.card) }
            } else if (counted) {
                Spacer(Modifier.width(AlphonsoTokens.Space.minTouch))
            }
        }
        if (counted) Text("QUESTION $step OF $total", style = OverlineType, color = ds.card, modifier = Modifier.clearAndSetSemantics {})
    }
}

// ---------------------------------------------------------------- bubble

/** Alphonso's line: the speaker reads it aloud; a title and an optional sub. The tail points up at him. */
@Composable
internal fun FirstRunBubble(title: String, sub: String? = null, playLabel: String = "Hear Alphonso", onPlay: (() -> Unit)? = null) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Box(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).offset(y = (-16).dp)) {
        Box(Modifier.align(Alignment.TopCenter).offset(y = (-7).dp).size(18.dp).rotate(45f).clip(RoundedCornerShape(4.dp)).background(ds.card))
        Row(
            Modifier.fillMaxWidth().shadow(10.dp, shape, ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint)
                .clip(shape).background(ds.card).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            if (onPlay != null) {
                Box(
                    Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).background(ds.choiceTint)
                        .clickable(role = Role.Button, onClickLabel = playLabel, onClick = onPlay).semantics { contentDescription = playLabel },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = null, tint = ds.actionText, modifier = Modifier.size(20.dp)) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = TitleType, color = ds.brand, modifier = Modifier.semantics { heading() })
                sub?.let { Text(it, style = FootnoteType, color = ds.inkSoft) }
            }
        }
    }
}

// ---------------------------------------------------------------- choices

/** The pressable card: a bordered face over a coloured bottom edge. */
@Composable
internal fun FirstRunCard(
    selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, description: String? = null,
    content: @Composable () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val edge = AlphonsoTokens.Edge.answer
    val sink = if (pressed) edge - AlphonsoTokens.Edge.pressedSliver else 0.dp
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Box(
        modifier.padding(bottom = edge).semantics(mergeDescendants = true) {
            role = Role.Button
            this.selected = selected
            if (selected) stateDescription = "Selected"
            description?.let { contentDescription = it }
        },
    ) {
        Box(Modifier.matchParentSize().offset(y = edge).clip(shape).background(if (selected) ds.choiceEdge else ds.line))
        Box(
            Modifier.fillMaxWidth().offset(y = sink).clip(shape).background(if (selected) ds.choiceTint else ds.card)
                .border(2.dp, if (selected) ds.choice else ds.line, shape)
                .clickable(interactionSource = interaction, indication = null, onClick = onClick),
        ) { content() }
    }
}

@Composable
internal fun FirstRunRadio(on: Boolean) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.size(26.dp).clip(CircleShape).then(if (on) Modifier.background(ds.choice) else Modifier.border(2.dp, ds.line, CircleShape)),
        contentAlignment = Alignment.Center,
    ) { if (on) Icon(Icons.Filled.Check, contentDescription = null, tint = ds.card, modifier = Modifier.size(16.dp)) }
}

@Composable
internal fun FirstRunIconBadge(icon: String, on: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(if (on) ds.brand else ds.choiceTint), contentAlignment = Alignment.Center) {
        FirstRunIcon(icon, if (on) ds.card else ds.brand, 20.dp)
    }
}

/** A full-width choice: a lead, the label and an optional sub, and the radio. */
@Composable
internal fun FirstRunChoiceRow(label: String, selected: Boolean, onClick: () -> Unit, sub: String? = null, lead: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    FirstRunCard(selected, onClick, Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            lead()
            Column(Modifier.weight(1f)) {
                Text(label, style = HeadlineType, color = ds.brand)
                sub?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
            }
            FirstRunRadio(selected)
        }
    }
}

/** A tile with an icon over its label (goals, how you heard), two to a row. */
@Composable
internal fun FirstRunChoiceTile(icon: String, label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    FirstRunCard(selected, onClick, modifier) {
        Column(
            Modifier.fillMaxWidth().heightIn(min = 84.dp).padding(AlphonsoTokens.Space.s3),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2, Alignment.CenterVertically),
        ) {
            FirstRunIcon(icon, ds.brand, 26.dp)
            Text(label, style = FootnoteType, color = ds.brand, textAlign = TextAlign.Center)
        }
    }
}

/** The age screen's card: every one looks the same until tapped. */
@Composable
internal fun FirstRunAgeCard(choice: AgeChoice, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    FirstRunCard(selected, onClick, modifier, description = choice.accessibilityLabel) {
        Column(
            Modifier.fillMaxWidth().heightIn(min = 76.dp).padding(vertical = AlphonsoTokens.Space.s3, horizontal = AlphonsoTokens.Space.s1).clearAndSetSemantics {},
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Text(choice.big, style = NumeralType, color = ds.brand, maxLines = 1)
            Text(choice.small, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center)
        }
    }
}

/** An interest: a pill with an icon, toggled on and off. */
@Composable
internal fun FirstRunInterestChip(icon: String, label: String, selected: Boolean, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(
        Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(CircleShape).background(if (selected) ds.choice else ds.card)
            .border(2.dp, if (selected) ds.choice else ds.line, CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { this.selected = selected; if (selected) stateDescription = "Selected" }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FirstRunIcon(icon, if (selected) ds.card else ds.brand, 16.dp)
        Text(label, style = FootnoteType, color = if (selected) ds.card else ds.brand)
    }
}

/** A course's flag as the system's flag emoji. */
@Composable
internal fun FirstRunCourseFlag(course: String) {
    val flag = when (course) { "fr" -> "🇫🇷"; "es" -> "🇪🇸"; else -> "🇬🇧" }
    Box(Modifier.width(40.dp).clearAndSetSemantics {}, contentAlignment = Alignment.Center) { Text(flag, style = TitleType) }
}

/** A country as its two letters in a chip (the web's choice). */
@Composable
internal fun FirstRunCountryChip(code: String) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(9.dp)).background(ds.xpTint).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        Text(code, style = HeadlineType, color = ds.brand)
    }
}

/** "I speak / English >": opens a picker. */
@Composable
internal fun FirstRunPickerRow(overline: String, value: String, onClick: () -> Unit, lead: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    FirstRunCard(false, onClick, Modifier.fillMaxWidth(), description = "$overline, $value") {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            lead()
            Column(Modifier.weight(1f)) {
                Text(overline.uppercase(), style = OverlineType, color = ds.actionText)
                Text(value, style = HeadlineType, color = ds.brand)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = ds.inkSoft)
        }
    }
}

/** "Show my flag on leaderboards": off unless turned on. */
@Composable
internal fun FirstRunSwitchRow(label: String, sub: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .clickable(role = Role.Switch) { onChange(!checked) }
            .semantics(mergeDescendants = true) { stateDescription = if (checked) "On" else "Off" }
            .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = FootnoteType, color = ds.brand)
            Text(sub, style = CaptionType, color = ds.inkSoft)
        }
        Switch(
            checked = checked, onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = ds.choice, checkedThumbColor = ds.card, uncheckedTrackColor = ds.sunk, uncheckedBorderColor = ds.line),
        )
    }
}

@Composable
internal fun FirstRunHint(text: String) {
    Text(text, style = FootnoteType, color = LocalAlphonsoTokens.current.inkSoft, modifier = Modifier.fillMaxWidth())
}

/** The primary button, with an optional note above it and a text button under it. */
@Composable
internal fun FirstRunFooter(
    label: String, onClick: () -> Unit, enabled: Boolean = true, note: String? = null,
    secondaryLabel: String? = null, onSecondary: (() -> Unit)? = null,
) {
    val ds = LocalAlphonsoTokens.current
    note?.let { Text(it, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
    com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton(label, com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant.PRIMARY, onClick, enabled = enabled)
    if (secondaryLabel != null && onSecondary != null) FirstRunTextButton(secondaryLabel, onSecondary)
}

@Composable
internal fun FirstRunTextButton(label: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, style = HeadlineType, color = ds.choice, textAlign = TextAlign.Center) }
}

// ---------------------------------------------------------------- picker

data class PickerItem(val id: String, val label: String)

/** A searchable list for "I speak" and "I'm joining from". */
@Composable
internal fun FirstRunPickerDialog(
    title: String, searchLabel: String, items: List<PickerItem>, selected: String?, showsCode: Boolean,
    onPick: (String) -> Unit, onClose: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    var query by remember { mutableStateOf("") }
    val shown = remember(query, items) {
        val q = query.trim()
        if (q.isEmpty()) items else items.filter { it.label.contains(q, ignoreCase = true) || it.id.equals(q, ignoreCase = true) }
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(ds.surface)) {
            Row(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = TitleType, color = ds.brand, modifier = Modifier.weight(1f).padding(start = AlphonsoTokens.Space.s2).semantics { heading() })
                FirstRunTextButton("Close", onClose)
            }
            BasicTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                textStyle = HeadlineType.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice),
                modifier = Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter)
                    .clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                    .border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                    .padding(AlphonsoTokens.Space.s3).semantics { contentDescription = searchLabel },
                decorationBox = { inner -> if (query.isEmpty()) Text(searchLabel, style = HeadlineType, color = ds.inkFaint); inner() },
            )
            LazyColumn(Modifier.weight(1f).padding(top = AlphonsoTokens.Space.s2)) {
                items(shown, key = { it.id }) { item ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { onPick(item.id) }
                            .semantics(mergeDescendants = true) { this.selected = item.id == selected }
                            .padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s2),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                    ) {
                        if (showsCode) FirstRunCountryChip(item.id)
                        Text(item.label, style = HeadlineType, color = ds.brand, modifier = Modifier.weight(1f))
                        if (item.id == selected) Icon(Icons.Filled.Check, contentDescription = null, tint = ds.choice)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- profile picture

/** A learner's picture: their animal, or their initial on their colour. Decorative; the caller names the person. */
@Composable
fun ProfileAvatar(seed: String?, name: String?, size: Dp = 40.dp) {
    val ds = LocalAlphonsoTokens.current
    val animal = ProfileAvatars.animalFromSeed(seed)
    if (animal != null) {
        val art = rememberFirstRunAsset(ProfileAvatars.assetPath(animal.id))
        Box(Modifier.size(size).clip(CircleShape).background(ds.sunk).clearAndSetSemantics {}) {
            art?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        }
    } else {
        val (r, g, b) = avatarRgb(ProfileAvatars.initialsSeed(seed))
        Box(Modifier.size(size).clip(CircleShape).background(Color(r, g, b)).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
            Text(ProfileAvatars.initial(name), style = if (size >= 64.dp) TitleType else HeadlineType, color = ds.card, maxLines = 1)
        }
    }
}

/** The 16 animals four by four, and the learner's initial last. Presets only: there is no upload. */
@Composable
internal fun AvatarPickerGrid(value: String, name: String, initialsSeed: String, onChange: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val chosen = ProfileAvatars.animalFromSeed(value)
    val cells: List<Triple<String, String, Boolean>> =
        ProfileAvatars.all.map { Triple(ProfileAvatars.seedFor(it.id), it.label, chosen?.id == it.id) } +
            Triple(initialsSeed, "My initial, ${ProfileAvatars.initial(name)}", chosen == null)
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3), modifier = Modifier.semantics { contentDescription = "Profile pictures" }) {
        cells.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                row.forEach { (seed, label, on) ->
                    BoxWithConstraints(
                        Modifier.weight(1f).aspectRatio(1f)
                            .clickable(role = Role.Button) { onChange(seed) }
                            .semantics(mergeDescendants = true) { contentDescription = label; selected = on; if (on) stateDescription = "Selected" },
                        contentAlignment = Alignment.Center,
                    ) {
                        val side = maxWidth - 8.dp
                        Box(Modifier.size(side + 6.dp).border(if (on) 3.dp else 2.dp, if (on) ds.brand else ds.line, CircleShape), contentAlignment = Alignment.Center) {
                            ProfileAvatar(seed, name, side - 4.dp)
                        }
                        if (on) {
                            Box(
                                Modifier.align(Alignment.TopEnd).size(24.dp).clip(CircleShape).background(ds.brand).border(2.dp, ds.card, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.Check, contentDescription = null, tint = ds.card, modifier = Modifier.size(14.dp)) }
                        }
                    }
                }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** A circular room picture on the plan path, greyed for the third unit. */
@Composable
internal fun FirstRunPlanNode(roomId: String, ring: Color, muted: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val art = rememberFirstRunAsset("scenes/$roomId.webp")
    Box(Modifier.size(78.dp).border(3.dp, ring, CircleShape).padding(3.dp).clip(CircleShape).background(ds.card).padding(3.dp).clip(CircleShape).clearAndSetSemantics {}) {
        art?.let {
            Image(
                it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                colorFilter = if (muted) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0.4f) }) else null,
            )
        }
    }
}

@Composable
internal fun FirstRunScreenWidth(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().widthIn(max = 600.dp)) { content() }
}
