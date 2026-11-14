package com.obsidianmedia.learnwithalphonso.ui.components

import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import androidx.compose.foundation.layout.heightIn
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Ports of AlphonsoComponents.swift. Radii and spacing mirror the iOS scale. */
object AlphonsoRadius {
    val md = 10.dp
    val lg = 14.dp
    val xl = 20.dp
}

/** The primary button, in the design system's pressable look (the lesson's edge button; compact when not full width). */
@Composable
fun AlphonsoPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    fullWidth: Boolean = true,
) {
    val ds = LocalAlphonsoTokens.current
    when {
        busy -> Box(
            modifier.then(if (fullWidth) Modifier.fillMaxWidth() else Modifier).heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
                .background(ds.sunk).padding(AlphonsoTokens.Space.s3).semantics { contentDescription = text },
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(modifier = Modifier.size(AlphonsoTokens.Space.s5), color = ds.choice, strokeWidth = 2.dp) }
        fullWidth -> LessonEdgeButton(text, EdgeVariant.PRIMARY, onClick, modifier, enabled)
        else -> DsCompactButton(text, onClick, modifier, primary = true, enabled = enabled)
    }
}

@Composable
fun AlphonsoSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    fullWidth: Boolean = true,
    leading: (@Composable RowScope.() -> Unit)? = null,
) {
    val ds = LocalAlphonsoTokens.current
    when {
        busy -> Box(
            modifier.then(if (fullWidth) Modifier.fillMaxWidth() else Modifier).heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
                .background(ds.sunk).padding(AlphonsoTokens.Space.s3).semantics { contentDescription = text },
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(modifier = Modifier.size(AlphonsoTokens.Space.s5), color = ds.choice, strokeWidth = 2.dp) }
        fullWidth -> LessonEdgeButton(text, EdgeVariant.SECONDARY, onClick, modifier, enabled)
        else -> DsCompactButton(text, onClick, modifier, enabled = enabled)
    }
}

@Composable
fun AlphonsoSectionHeader(text: String, modifier: Modifier = Modifier) {
    DsOverline(text, modifier)
}

@Composable
fun AlphonsoProgressBar(progress: Float, modifier: Modifier = Modifier) {
    DsProgressBar(progress, modifier)
}

/** A lesson or menu row: icon or dot, title, subtitle, on a card. */
@Composable
fun AlphonsoRowCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    accent: Color = LocalAlphonsoTokens.current.choice,
    leadingEmoji: String? = null,
) {
    val ds = LocalAlphonsoTokens.current
    DsCard(modifier.semantics(mergeDescendants = true) {}, padding = AlphonsoTokens.Space.s3, spacing = 0.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            if (leadingEmoji != null) Text(leadingEmoji, style = TitleType)
            else Box(Modifier.size(AlphonsoTokens.Space.s2).clip(CircleShape).background(accent))
            Column(Modifier.weight(1f)) {
                Text(title, style = HeadlineType, color = ds.ink)
                Text(subtitle, style = FootnoteType, color = ds.inkSoft)
            }
        }
    }
}

enum class AlphonsoMascot(@DrawableRes val res: Int, val label: String) {
    ALPHONSO(R.drawable.mascot_alphonso, "Alphonso"),
    HECTOR(R.drawable.mascot_hector, "Hector"),
}

/** The moss-to-mossDeep gradient banner with a mascot portrait and a line of copy. */
@Composable
fun AlphonsoMascotBanner(message: String, modifier: Modifier = Modifier, mascot: AlphonsoMascot = AlphonsoMascot.ALPHONSO) {
    val p = AlphonsoColor.palette
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AlphonsoRadius.xl))
            .background(Brush.linearGradient(listOf(p.moss, p.mossDeep)))
            .padding(16.dp)
            .semantics(mergeDescendants = true) { contentDescription = "${mascot.label}: $message" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(
            painterResource(mascot.res),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(AlphonsoRadius.lg)).border(2.dp, LocalAlphonsoTokens.current.onHero.copy(alpha = 0.6f), RoundedCornerShape(AlphonsoRadius.lg)),
        )
        Text(message, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = p.onMossGradient, modifier = Modifier.weight(1f))
    }
}

/** "Alphonso says" tip shown on a wrong answer. */
@Composable
fun AlphonsoTipCard(explanation: String, modifier: Modifier = Modifier, saveCourse: String? = null, saveMode: SaveWordMode = SaveWordMode.Plain) {
    val p = AlphonsoColor.palette
    // The words are links only when the caller knows which text is in the course's language (SavedWordPolicy.scope: all of it
    // in English, the proven spans in French and Spanish) and the screen can open a save sheet. Then the card is a container whose children read themselves, so TalkBack can reach
    // the links; a merged label would hide them.
    val onSave = LocalSaveWordHandler.current
    val linksReachable = saveCourse != null && onSave != null && saveMode != SaveWordMode.Plain
    Row(
        modifier.fillMaxWidth().then(
            if (linksReachable) Modifier else Modifier.semantics(mergeDescendants = true) { contentDescription = "Incorrect. Alphonso says: $explanation" },
        ),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(
            Modifier
                .weight(1f)
                .clip(RoundedCornerShape(AlphonsoRadius.lg))
                .background(p.parchment)
                .border(1.dp, p.ember.copy(alpha = 0.45f), RoundedCornerShape(AlphonsoRadius.lg))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                "Alphonso says", style = CaptionType, color = p.ember,
                modifier = if (linksReachable) Modifier.semantics { contentDescription = "Incorrect. Alphonso says" } else Modifier,
            )
            if (linksReachable) TappableText(explanation, saveCourse!!, saveMode, onSave!!, style = MaterialTheme.typography.bodyMedium, color = p.ink)
            else Text(explanation, style = MaterialTheme.typography.bodyMedium, color = p.ink)
        }
        Spacer(Modifier.width(6.dp))
        Image(
            painterResource(R.drawable.mascot_alphonso),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.width(72.dp).height(92.dp).clip(RoundedCornerShape(AlphonsoRadius.lg)).border(2.dp, p.ember, RoundedCornerShape(AlphonsoRadius.lg)),
        )
    }
}

/** The explanation under a checked question: quiet when right, a tip card when wrong. */
@Composable
fun ExplanationBlock(isCorrect: Boolean, explanation: String, modifier: Modifier = Modifier, saveCourse: String? = null, saveMode: SaveWordMode = SaveWordMode.Plain) {
    val onSave = LocalSaveWordHandler.current
    if (isCorrect) {
        if (saveCourse != null && onSave != null && saveMode != SaveWordMode.Plain) {
            TappableText(explanation, saveCourse, saveMode, onSave, modifier = modifier, style = MaterialTheme.typography.bodySmall, color = AlphonsoColor.palette.inkSoft, accessibilityPrefix = "Correct.")
        } else {
            Text(explanation, modifier = modifier.semantics { contentDescription = "Correct. $explanation" }, style = MaterialTheme.typography.bodySmall, color = AlphonsoColor.palette.inkSoft)
        }
    } else {
        AlphonsoTipCard(explanation, modifier, saveCourse, saveMode)
    }
}

/** Tappable answer choice with selected / correct / incorrect states and a full accessibility label. */
@Composable
fun ChoiceButton(
    choice: String,
    selected: Boolean,
    checked: Boolean,
    isCorrectChoice: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = AlphonsoColor.palette
    val label = when {
        !checked -> choice
        isCorrectChoice && selected -> "$choice, your answer, correct"
        isCorrectChoice -> "$choice, correct answer"
        selected -> "$choice, your answer, incorrect"
        else -> choice
    }
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AlphonsoRadius.lg))
            .background(if (selected) p.moss.copy(alpha = 0.14f) else p.parchment)
            .border(if (selected) 1.5.dp else 1.dp, if (selected) p.moss else p.hairline, RoundedCornerShape(AlphonsoRadius.lg))
            .let { if (checked) it else it.clickable(onClick = onClick) }
            .padding(12.dp)
            .semantics(mergeDescendants = true) { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(choice, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.weight(1f))
        when {
            checked && isCorrectChoice -> Text("✓", color = p.moss, fontWeight = FontWeight.Bold)
            checked && selected -> Text("✗", color = p.destructive, fontWeight = FontWeight.Bold)
        }
    }
}
