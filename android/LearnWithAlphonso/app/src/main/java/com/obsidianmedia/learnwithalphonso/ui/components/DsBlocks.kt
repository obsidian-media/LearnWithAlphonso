package com.obsidianmedia.learnwithalphonso.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.logic.DsRankMedal
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

// The shared building blocks of the round-6 screens that were still Material defaults on Android (Review, Build my path,
// Duels, Friends, League, Teams, Out of hearts, Settings): the same set as iOS DSBlocks.swift and the web's DS cards.
// Every colour, size and type role is a design-system token, so a palette or a night setting changes them and nothing
// else. Nothing here holds a number of its own beyond the token scale.

/** The six screen scenes the web and iOS share (public/scenes, Scene-*): where each screen's picture comes from. */
enum class DsScene(val file: String) { LEARN("learn"), HECTOR("hector"), LISTEN("listen"), PROFILE("profile"), COMPLETE("complete"), PRACTICE("practice") }

/** A glass face: the card colour, a little transparent, so a scene shows faintly through it. */
@Composable
private fun glassFace(): Color = LocalAlphonsoTokens.current.card.copy(alpha = 0.86f)

/**
 * A screen on a scene: the picture along the top fading into the flat surface, the content over it. The content is the
 * caller's own scrolling column; the scene stays put behind it.
 */
@Composable
fun DsSceneScreen(scene: DsScene, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val image = rememberFirstRunAsset("screen-scenes/${scene.file}.jpg")
    Box(modifier.fillMaxSize().background(ds.surface)) {
        Box(Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 7)) {
            image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to ds.heroB.copy(alpha = 0.34f), 0.55f to Color.Transparent, 1f to ds.surface)))
        }
        content()
    }
}

/** A section's small-capitals label. It sits on a glass pill so it stays legible over a scene. */
@Composable
fun DsOverline(text: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    Box(modifier.fillMaxWidth()) {
        Text(
            text.uppercase(), style = OverlineType, color = ds.actionText,
            modifier = Modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.pill)).background(glassFace())
                .padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1 + 2.dp)
                .semantics { heading() },
        )
    }
}

/** The screen's title on a glass card, with an optional line of facts under it. */
@Composable
fun DsGlassTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).background(glassFace()).padding(AlphonsoTokens.Space.s4)
            .semantics(mergeDescendants = true) { heading() },
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Text(title, style = DisplayType, color = ds.brand)
        if (!subtitle.isNullOrEmpty()) Text(subtitle, style = FootnoteType, color = ds.inkSoft)
    }
}

/** A card on the screen's surface: the DS card colour, the bubble radius, the resting line. */
@Composable
fun DsCard(
    modifier: Modifier = Modifier,
    padding: androidx.compose.ui.unit.Dp = AlphonsoTokens.Space.s4,
    spacing: androidx.compose.ui.unit.Dp = AlphonsoTokens.Space.s3,
    fill: Color? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        modifier.fillMaxWidth().clip(shape).background((fill ?: ds.card).copy(alpha = 0.94f)).border(2.dp, ds.line, shape).padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

/** The hero: the navy gradient card the My path card uses, with white text. */
@Composable
fun DsHeroCard(modifier: Modifier = Modifier, spacing: androidx.compose.ui.unit.Dp = AlphonsoTokens.Space.s2, content: @Composable ColumnScope.() -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Column(
        modifier.fillMaxWidth().shadow(8.dp, shape, clip = false, ambientColor = AlphonsoTokens.Elevation.shadowTint, spotColor = AlphonsoTokens.Elevation.shadowTint)
            .clip(shape).background(Brush.linearGradient(listOf(ds.heroA, ds.heroB))).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

/** A thin progress bar on a card (a duel's head to head, a mission, a goal). Decorative unless given a label and a value. */
@Composable
fun DsProgressBar(fraction: Float, modifier: Modifier = Modifier, onHero: Boolean = false, tint: Color? = null, label: String? = null, value: String? = null) {
    val ds = LocalAlphonsoTokens.current
    val f = fraction.coerceIn(0f, 1f)
    val sem = if (label != null) Modifier.semantics(mergeDescendants = true) { contentDescription = label; stateDescription = value.orEmpty() } else Modifier.clearAndSetSemantics { }
    Box(modifier.then(sem).fillMaxWidth().height(AlphonsoTokens.Space.s3).clip(CircleShape).background(if (onHero) ds.onHeroSoft.copy(alpha = 0.3f) else ds.sunk)) {
        Box(Modifier.fillMaxWidth(f).height(AlphonsoTokens.Space.s3).clip(CircleShape).background(tint ?: if (onHero) ds.xp else ds.action))
    }
}

/** An empty or failed state: Alphonso (or an icon) over a title and a line, on a card. */
@Composable
fun DsEmptyState(title: String, message: String?, modifier: Modifier = Modifier, artAsset: String? = null, icon: Int? = null) {
    val ds = LocalAlphonsoTokens.current
    val art = artAsset?.let { rememberFirstRunAsset(it) }
    DsCard(modifier.semantics(mergeDescendants = true) { }, spacing = AlphonsoTokens.Space.s2) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            if (art != null) Image(art, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 2))
            else if (icon != null) androidx.compose.material3.Icon(androidx.compose.ui.res.painterResource(icon), null, tint = ds.heart, modifier = Modifier.size(AlphonsoTokens.Space.s12))
            Text(title, style = HeadlineType, color = ds.ink, textAlign = TextAlign.Center)
            if (!message.isNullOrEmpty()) Text(message, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
        }
    }
}

/** One choice as a chip: the answer look (a bordered face), the choice tint when it is picked. */
@Composable
fun DsChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, accessibilityText: String? = null, leading: (@Composable () -> Unit)? = null) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(if (selected) ds.choiceTint else ds.card)
            .border(2.dp, if (selected) ds.choice else ds.line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = AlphonsoTokens.Space.s2, horizontal = AlphonsoTokens.Space.s3)
            .semantics(mergeDescendants = true) { this.selected = selected; contentDescription = accessibilityText ?: label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        leading?.invoke()
        Text(label, style = FootnoteType, color = if (selected) ds.choice else ds.brand)
    }
}

/** A wrapping row of chips: a long list never runs off the edge, and large text wraps instead of clipping. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun DsChipRow(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    FlowRow(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) { content() }
}

/** A segmented control: a sunk track with the picked segment raised on a card. */
@Composable
fun <T> DsSegmented(options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit, accessibilityLabel: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val trackShape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val segShape = RoundedCornerShape(AlphonsoTokens.Radius.control - AlphonsoTokens.Space.s1)
    Row(
        modifier.fillMaxWidth().clip(trackShape).background(ds.sunk).padding(AlphonsoTokens.Space.s1).semantics { contentDescription = accessibilityLabel },
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        options.forEach { (value, label) ->
            val on = value == selection
            Box(
                Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clip(segShape)
                    .background(if (on) ds.card else Color.Transparent)
                    .then(if (on) Modifier.border(1.dp, ds.line, segShape) else Modifier)
                    .clickable(role = Role.RadioButton) { onSelect(value) }
                    .padding(horizontal = AlphonsoTokens.Space.s1)
                    .semantics { this.selected = on },
                contentAlignment = Alignment.Center,
            ) { Text(label, style = FootnoteType, color = if (on) ds.brand else ds.inkSoft, textAlign = TextAlign.Center) }
        }
    }
}

/** A rank in a board: a numbered circle, with the medal colours (gold, silver, bronze from the tokens) for the top three. */
@Composable
fun DsRankBadge(rank: Int, medal: DsRankMedal?) {
    val ds = LocalAlphonsoTokens.current
    val (face, ink) = when (medal) {
        DsRankMedal.GOLD -> ds.xp to ds.onAction
        DsRankMedal.SILVER -> ds.line to ds.ink
        DsRankMedal.BRONZE -> ds.flame to ds.onWrong
        null -> ds.sunk to ds.inkSoft
    }
    Box(
        Modifier.size(AlphonsoTokens.Space.s8 - AlphonsoTokens.Space.s1).clip(CircleShape).background(face).semantics { contentDescription = "Rank $rank" },
        contentAlignment = Alignment.Center,
    ) { Text("$rank", style = CaptionType, color = ink, modifier = Modifier.clearAndSetSemantics { }) }
}

enum class DsPillTone { INFO, GOOD, BAD, NEUTRAL, GOLD }

/** A short status label: "You won", "Owner", "Blocked", "YOU". */
@Composable
fun DsPill(text: String, tone: DsPillTone = DsPillTone.INFO, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val (face, ink) = when (tone) {
        DsPillTone.INFO -> ds.choiceTint to ds.choice
        DsPillTone.GOOD -> ds.rightTint to ds.rightInk
        DsPillTone.BAD -> ds.wrongTint to ds.wrongInk
        DsPillTone.NEUTRAL -> ds.sunk to ds.inkSoft
        DsPillTone.GOLD -> ds.actionTint to ds.actionText
    }
    Text(
        text, style = CaptionType, color = ink,
        modifier = modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(face)
            .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s1),
    )
}

/** The small pressable button that sits in a row beside text: the lesson's edge button, compact. */
@Composable
fun DsCompactButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, primary: Boolean = false, enabled: Boolean = true, danger: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control - AlphonsoTokens.Space.s1)
    val face = if (primary) ds.action else ds.card
    val ink = when { primary -> ds.onAction; danger -> ds.wrongInk; else -> ds.brand }
    Box(
        modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(face)
            .then(if (primary) Modifier else Modifier.border(2.dp, ds.line, shape))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s2)
            .then(if (enabled) Modifier else Modifier.background(Color.Transparent)),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = FootnoteType, color = if (enabled) ink else ds.inkFaint, textAlign = TextAlign.Center) }
}

/** A text field in the lesson's answer look: a well with a border that turns to the choice colour on focus. */
@Composable
fun DsField(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val ds = LocalAlphonsoTokens.current
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    BasicTextField(
        value = value, onValueChange = onChange, enabled = enabled, singleLine = true,
        textStyle = BodyType.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice),
        modifier = modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).onFocusChanged { focused = it.isFocused }
            .clip(shape).background(ds.card).border(2.dp, if (focused) ds.choice else ds.line, shape).padding(AlphonsoTokens.Space.s3)
            .semantics { contentDescription = placeholder },
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = BodyType, color = ds.inkFaint)
                inner()
            }
        },
    )
}

/** A DS switch: the action colour when on, the sunk track when off. */
@Composable
fun DsSwitch(checked: Boolean, onChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val ds = LocalAlphonsoTokens.current
    Switch(
        checked = checked, onCheckedChange = onChange, enabled = enabled, modifier = modifier,
        colors = SwitchDefaults.colors(
            checkedThumbColor = ds.card, checkedTrackColor = ds.choice, checkedBorderColor = ds.choice,
            uncheckedThumbColor = ds.card, uncheckedTrackColor = ds.sunk, uncheckedBorderColor = ds.line,
            disabledCheckedTrackColor = ds.choice.copy(alpha = 0.5f), disabledUncheckedTrackColor = ds.sunk,
        ),
    )
}

/** A hairline between rows inside a card. */
@Composable
fun DsDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(LocalAlphonsoTokens.current.line))
}

/** The back control over a scene: a glass pill with the parent screen's name, then any chips the screen offers on the right. */
@Composable
fun DsBackBar(parent: String, onBack: () -> Unit, modifier: Modifier = Modifier, actions: @Composable () -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Row(
            Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(CircleShape).background(glassFace())
                .clickable(role = Role.Button, onClick = onBack).padding(horizontal = AlphonsoTokens.Space.s3)
                .semantics(mergeDescendants = true) { contentDescription = "Back to $parent" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
        ) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = ds.choice, modifier = Modifier.size(AlphonsoTokens.Space.s4))
            Text(parent, style = FootnoteType, color = ds.choice)
        }
        Box(Modifier.weight(1f))
        actions()
    }
}

/** A small glass chip on a scene (Teams, Season, Recap on the League screen). */
@Composable
fun DsGlassChip(label: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Box(
        Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(CircleShape).background(glassFace()).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = AlphonsoTokens.Space.s3),
        contentAlignment = Alignment.Center,
    ) { Text(label, style = FootnoteType, color = ds.brand) }
}

/** A titled section: the glass overline over a card. */
@Composable
fun DsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        DsOverline(title)
        DsCard(content = content)
    }
}
