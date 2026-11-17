package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.AiUsageCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiUsageState
import com.obsidianmedia.learnwithalphonso.core.logic.AiUsageView
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * Settings > "AI practice this month", the same card as the web's AiUsageSetting and the iOS Settings card: usage as a
 * meter and a word, never a price. One read of /api/ai-usage; a failed read or an unknown state leaves it null and the
 * card draws nothing at all.
 */
@Composable
internal fun AiUsageSection(container: AppContainer) {
    var usage by remember { mutableStateOf<AiUsageView?>(null) }
    LaunchedEffect(Unit) { usage = container.aiUsageClient.fetch() }
    usage?.let { AiUsageCard(it) }
}

@Composable
internal fun AiUsageCard(usage: AiUsageView) {
    val ds = LocalAlphonsoTokens.current
    val tint = when (usage.state) {
        AiUsageState.OK -> ds.choice
        AiUsageState.WARN -> ds.xp
        AiUsageState.CAPPED -> ds.flame
    }
    DsCard(spacing = AlphonsoTokens.Space.s3) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Text(AiUsageCopy.TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f).semantics { heading() })
            // The state word sits beside the meter, so colour is never the only signal.
            Text(usage.label, style = CaptionType, color = ds.ink)
        }
        DsProgressBar(usage.percent / 100f, tint = tint, label = AiUsageCopy.TITLE, value = usage.valueText)
        Text(usage.summary, style = FootnoteType, color = ds.ink)
        Text(AiUsageCopy.EXPLAIN, style = FootnoteType, color = ds.inkSoft)
    }
}
