package com.obsidianmedia.learnwithalphonso.ui.hector

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.HectorCorrection
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/** What a screen reader says for the correction line: the slip, then the fix. */
internal fun correctionSpoken(c: HectorCorrection): String = "You said ${c.slip}; better: ${c.fix}"

/**
 * Hector's gentle correction under the learner's bubble: "Almost — one fix", the slip struck through, the fix in bold, an
 * optional note, "Hear it" (gold) and "Try again" (the mic). "Hear it" is the device's own voice, so it is dropped when
 * [canHear] is false (no voice for the course) and the written fix stays.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun HectorCorrectionCard(
    correction: HectorCorrection,
    canHear: Boolean,
    tryAgainEnabled: Boolean,
    onHear: () -> Unit,
    onTryAgain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ds = LocalAlphonsoTokens.current
    Column(
        modifier.fillMaxWidth().padding(start = 39.dp, end = 40.dp).testTag("hector-correction")
            .clip(RoundedCornerShape(18.dp, 18.dp, 18.dp, 7.dp)).background(ds.card)
            .border(BorderStroke(1.dp, ds.line), RoundedCornerShape(18.dp, 18.dp, 18.dp, 7.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            Modifier.testTag("hector-correction-tag").clip(CircleShape).background(ds.rightTint).padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(painterResource(R.drawable.ds_check), null, tint = ds.rightInk, modifier = Modifier.size(12.dp))
            Text("Almost — one fix", style = CaptionType.copy(fontWeight = FontWeight.ExtraBold), color = ds.rightInk)
        }
        // One element for a screen reader ("You said ...; better: ..."); the drawn text keeps its own testTag in the
        // unmerged tree, so it can still be measured.
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = ds.wrong, textDecoration = TextDecoration.LineThrough)) { append(correction.slip) }
                withStyle(SpanStyle(color = ds.inkSoft)) { append("  →  ") }
                withStyle(SpanStyle(color = ds.rightInk, fontWeight = FontWeight.ExtraBold)) { append(correction.fix) }
            },
            style = FootnoteType,
            modifier = Modifier.testTag("hector-correction-line").clearAndSetSemantics { contentDescription = correctionSpoken(correction) },
        )
        correction.note?.let { Text(it, style = CaptionType, color = ds.inkSoft, modifier = Modifier.testTag("hector-correction-note")) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (canHear) {
                CorrectionAction("Hear it: ${correction.fix}", "Hear it", "hector-hear-it", R.drawable.ds_play, ds.action, ds.onAction, true, onHear)
            }
            CorrectionAction("Try again: say it once more", "Try again", "hector-try-again", R.drawable.ds_mic, ds.sunk, ds.brand, tryAgainEnabled, onTryAgain)
        }
    }
}

@Composable
private fun CorrectionAction(
    description: String,
    label: String,
    tag: String,
    icon: Int,
    fill: androidx.compose.ui.graphics.Color,
    content: androidx.compose.ui.graphics.Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier.testTag(tag).heightIn(min = 48.dp).clip(CircleShape).background(fill).alpha(if (enabled) 1f else 0.5f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(painterResource(icon), null, tint = content, modifier = Modifier.size(13.dp))
        Text(label, style = FootnoteType.copy(fontWeight = FontWeight.ExtraBold), color = content, modifier = Modifier.clearAndSetSemantics { })
    }
}
