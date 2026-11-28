package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalSpeaking
import com.obsidianmedia.learnwithalphonso.core.rehearsal.SpeakingRules
import com.obsidianmedia.learnwithalphonso.core.rehearsal.SpeakingTrend
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * "How you spoke" on the rehearsal debrief: up to three counts in the server's order, each with a small trend mark
 * against the last run. No score, percentage or grade, and a worse number is never red: every mark is the same quiet
 * neutral. TalkBack reads each sentence once; the marks are decorative. Nothing is drawn when the server
 * sent no notes.
 */
@Composable
fun HowYouSpokeCard(speaking: RehearsalSpeaking?, courseCode: String) {
    if (speaking == null || speaking.notes.isEmpty()) return
    val ds = LocalAlphonsoTokens.current
    val language = SpeakingRules.languageName(courseCode)
    DsCard(padding = AlphonsoTokens.Space.s3) {
        Text(RehearsalSpeaking.TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
        speaking.notes.forEach { note ->
            val sentence = SpeakingRules.sentence(note, language)
            val trend = SpeakingRules.trend(note)
            Row(
                Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                verticalAlignment = Alignment.Top,
            ) {
                TrendMark(trend)
                Text(sentence, style = BodyType, color = ds.ink, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TrendMark(trend: SpeakingTrend) {
    val ds = LocalAlphonsoTokens.current
    if (trend.direction == SpeakingTrend.Direction.NONE) {
        Box(Modifier.size(26.dp).clearAndSetSemantics {})
        return
    }
    Box(
        Modifier.size(26.dp).clip(RoundedCornerShape(9.dp)).background(ds.sunk).clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        val icon = when (trend.direction) {
            SpeakingTrend.Direction.UP -> Icons.Filled.ArrowUpward
            SpeakingTrend.Direction.DOWN -> Icons.Filled.ArrowDownward
            else -> Icons.Filled.Remove
        }
        Icon(icon, contentDescription = null, tint = ds.inkSoft, modifier = Modifier.size(16.dp))
    }
}
