package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.core.logic.CallRecap
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Space
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Type
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle

/**
 * "From this call" (approved mock: r15-recap): up to three corrections, one new phrase, Review these. It takes the slot
 * "Your slip" has, and the result screen shows the slip whenever this has nothing to show. Text only; a speaker button
 * plays just that phrase.
 */
@Composable
internal fun RecapSection(ui: CallRecapController.Ui, onSpeak: (String) -> Unit, onReview: () -> Unit, onOpenMemory: () -> Unit, onRetry: () -> Unit = {}) {
    when (ui.status) {
        CallRecapController.Status.OFF -> Unit
        CallRecapController.Status.PENDING -> RecapSkeleton()
        CallRecapController.Status.READY -> ui.recap?.let { RecapCard(it, ui, onSpeak, onReview, onOpenMemory) }
        CallRecapController.Status.FAILED -> RecapRetry(onRetry)
    }
}

/** The attempt failed and the call is not used up: a quiet card with "Try again", never an error screen. */
@Composable
private fun RecapRetry(onRetry: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().testTag("recap-failed").clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(Space.s3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(Modifier.weight(1f)) {
            Text("From this call", style = Type.overline.toTextStyle(), color = ds.actionText)
            Text("Alphonso could not write it up this time.", style = Type.caption.toTextStyle(), color = ds.inkSoft)
        }
        Box(
            Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClickLabel = "Try again") { onRetry() }.padding(horizontal = Space.s3),
            contentAlignment = Alignment.Center,
        ) { Text("Try again", style = Type.headline.toTextStyle(), color = ds.choice) }
    }
}

@Composable
private fun RecapSkeleton() {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(
        Modifier.fillMaxWidth().testTag("recap-pending").clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(Space.s3)
            .semantics(mergeDescendants = true) { contentDescription = "From this call. Alphonso is writing it up." },
        verticalArrangement = Arrangement.spacedBy(Space.s3),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("From this call", style = Type.overline.toTextStyle(), color = ds.actionText)
            Text("Alphonso is writing it up", style = Type.caption.toTextStyle(), color = ds.inkSoft)
        }
        listOf(0.72f, 0.64f, 0.58f).forEach { w ->
            Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                Box(Modifier.fillMaxWidth(w).heightIn(min = Space.s2).background(ds.sunk, RoundedCornerShape(Space.s1)))
                Box(Modifier.fillMaxWidth().heightIn(min = Space.s2).background(ds.sunk, RoundedCornerShape(Space.s1)))
            }
        }
    }
}

@Composable
private fun SpeakButton(text: String, speaking: String?, plain: Boolean, onSpeak: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val on = speaking == text
    Box(
        Modifier.size(AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control))
            .background(if (on) ds.choice else if (plain) ds.card else ds.choiceTint)
            .clickable(role = Role.Button, onClickLabel = "Hear: $text") { onSpeak(text) }
            .semantics { contentDescription = "Hear: $text" },
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.AutoMirrored.Filled.VolumeUp, null, tint = if (on) ds.onChoice else ds.choice) }
}

@Composable
private fun RecapCard(recap: CallRecap, ui: CallRecapController.Ui, onSpeak: (String) -> Unit, onReview: () -> Unit, onOpenMemory: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        Column(Modifier.fillMaxWidth().testTag("recap-ready").clip(shape).background(ds.card).border(2.dp, ds.line, shape)) {
            Row(Modifier.fillMaxWidth().padding(Space.s3), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("From this call", style = Type.overline.toTextStyle(), color = ds.actionText)
                Text("Tap the speaker to hear it", style = Type.caption.toTextStyle(), color = ds.inkSoft)
            }
            recap.corrections.forEach { c ->
                Row(Modifier.fillMaxWidth().border(width = 1.dp, color = ds.line).padding(Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                        Text(c.said, textDecoration = TextDecoration.LineThrough, style = Type.footnote.toTextStyle(), color = ds.wrongInk)
                        Text(c.fixed, style = Type.headline.toTextStyle(), color = ds.rightInk)
                        Text(c.why, style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    }
                    SpeakButton(c.fixed, ui.speaking, plain = false, onSpeak)
                }
            }
            recap.phrase?.let { p ->
                Row(Modifier.fillMaxWidth().background(ds.actionTint).border(width = 1.dp, color = ds.line).padding(Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                        Text("New phrase", style = Type.overline.toTextStyle(), color = ds.actionText)
                        Text(p.text, style = Type.headline.toTextStyle(), color = ds.ink)
                        Text(p.meaning, style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    }
                    SpeakButton(p.text, ui.speaking, plain = true, onSpeak)
                }
            }
            if (recap.reviewToken != null) {
                Column(Modifier.fillMaxWidth().border(width = 1.dp, color = ds.line), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (ui.review == CallRecapController.Review.ADDED) {
                        Row(Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).padding(horizontal = Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                            Icon(Icons.Filled.Check, null, tint = ds.rightInk)
                            Text("Added to your review", style = Type.headline.toTextStyle(), color = ds.rightInk)
                        }
                    } else {
                        Row(
                            Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(enabled = ui.review != CallRecapController.Review.ADDING, role = Role.Button, onClick = onReview).padding(horizontal = Space.s3),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2),
                        ) {
                            Icon(Icons.Filled.Add, null, tint = ds.choice)
                            Text("Review these", style = Type.headline.toTextStyle(), color = ds.choice)
                            Text("${recap.reviewCount}", style = Type.caption.toTextStyle(), color = ds.choice, modifier = Modifier.background(ds.choiceTint, RoundedCornerShape(Space.s2)).padding(horizontal = Space.s2))
                        }
                        if (ui.review == CallRecapController.Review.FAILED) {
                            Text("Could not add these. Try again.", style = Type.caption.toTextStyle(), color = ds.wrongInk, modifier = Modifier.padding(bottom = Space.s2))
                        }
                    }
                }
            }
        }
        if (recap.saved) {
            Row(Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onOpenMemory), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Lock, null, tint = ds.choice, modifier = Modifier.size(Space.s3))
                Text(" Saved in What Alphonso remembers", style = Type.caption.toTextStyle(), color = ds.choice, textDecoration = TextDecoration.Underline, textAlign = TextAlign.Center)
            }
        }
    }
}
