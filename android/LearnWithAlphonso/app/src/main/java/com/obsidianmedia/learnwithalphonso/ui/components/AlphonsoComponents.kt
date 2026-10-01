package com.obsidianmedia.learnwithalphonso.ui.components

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
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Ports of AlphonsoComponents.swift. Radii and spacing mirror the iOS scale. */
object AlphonsoRadius {
    val md = 10.dp
    val lg = 14.dp
    val xl = 20.dp
}

@Composable
fun AlphonsoPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    fullWidth: Boolean = true,
) {
    val p = AlphonsoColor.palette
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = if (fullWidth) modifier.fillMaxWidth().height(50.dp) else modifier.height(44.dp),
        shape = RoundedCornerShape(AlphonsoRadius.lg),
        colors = ButtonDefaults.buttonColors(containerColor = p.moss, contentColor = p.onPrimary, disabledContainerColor = p.moss.copy(alpha = 0.45f), disabledContentColor = p.onPrimary),
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), color = p.onPrimary, strokeWidth = 2.dp)
        else Text(text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
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
    val p = AlphonsoColor.palette
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = if (fullWidth) modifier.fillMaxWidth().height(50.dp) else modifier.height(44.dp),
        shape = RoundedCornerShape(AlphonsoRadius.lg),
        border = BorderStroke(1.dp, p.hairline),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = p.parchment, contentColor = p.ink),
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), color = p.moss, strokeWidth = 2.dp)
        else {
            leading?.invoke(this)
            Text(text, fontWeight = FontWeight.Medium, fontSize = 15.sp)
        }
    }
}

@Composable
fun AlphonsoSectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier = modifier,
        style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 0.8.sp, fontWeight = FontWeight.SemiBold),
        color = AlphonsoColor.palette.ember,
    )
}

@Composable
fun AlphonsoProgressBar(progress: Float, modifier: Modifier = Modifier) {
    val p = AlphonsoColor.palette
    Box(modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(p.parchment)) {
        Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(8.dp).clip(CircleShape).background(p.moss))
    }
}

/** A lesson or menu row: accent dot, title, subtitle, on parchment. */
@Composable
fun AlphonsoRowCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    accent: Color = AlphonsoColor.palette.moss,
    leadingEmoji: String? = null,
) {
    val p = AlphonsoColor.palette
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AlphonsoRadius.lg))
            .background(p.parchment)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (leadingEmoji != null) Text(leadingEmoji, fontSize = 28.sp)
        else Box(Modifier.size(8.dp).clip(CircleShape).background(accent))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Medium), color = p.ink)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
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
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(AlphonsoRadius.lg)).border(2.dp, Color.White.copy(alpha = 0.6f), RoundedCornerShape(AlphonsoRadius.lg)),
        )
        Text(message, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = p.onMossGradient, modifier = Modifier.weight(1f))
    }
}

/** "Alphonso says" tip shown on a wrong answer. */
@Composable
fun AlphonsoTipCard(explanation: String, modifier: Modifier = Modifier) {
    val p = AlphonsoColor.palette
    Row(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "Incorrect. Alphonso says: $explanation" },
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
            Text("Alphonso says", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp), color = p.ember)
            Text(explanation, style = MaterialTheme.typography.bodyMedium, color = p.ink)
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
fun ExplanationBlock(isCorrect: Boolean, explanation: String, modifier: Modifier = Modifier) {
    if (isCorrect) {
        Text(explanation, modifier = modifier.semantics { contentDescription = "Correct. $explanation" }, style = MaterialTheme.typography.bodySmall, color = AlphonsoColor.palette.inkSoft)
    } else {
        AlphonsoTipCard(explanation, modifier)
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
