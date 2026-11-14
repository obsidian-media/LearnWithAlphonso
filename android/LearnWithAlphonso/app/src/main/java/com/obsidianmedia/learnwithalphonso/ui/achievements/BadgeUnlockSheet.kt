package com.obsidianmedia.learnwithalphonso.ui.achievements

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.logic.AchievementPresentation
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonConfetti
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * The celebration after a lesson that earned a badge (batch 2, screen 14b): Alphonso impressed beside the new medallion
 * over confetti, "Achievement unlocked", its title, tier and description, then Continue and "See all achievements".
 * More than one badge is stepped through, one at a time, with the place shown ("1 of 2"). The award itself is the
 * server's: this only announces what the lesson result already says.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BadgeUnlockSheet(unlocked: List<Achievement>, onContinue: () -> Unit, onSeeAll: () -> Unit) {
    if (unlocked.isEmpty()) return
    val ds = LocalAlphonsoTokens.current
    val reduce = rememberReduceMotion()
    var index by remember { mutableIntStateOf(0) }
    val a = unlocked[index.coerceIn(0, unlocked.lastIndex)]
    val pose = rememberFirstRunAsset("poses/alphonso-surprised-impressed.webp")
    ModalBottomSheet(
        onDismissRequest = onContinue, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Box(Modifier.fillMaxWidth()) {
            LessonConfetti(reduce, Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 4))
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.weight(1f).height(AlphonsoTokens.Space.s12 * 4).clearAndSetSemantics { }) }
                    Box(Modifier.weight(1.4f), contentAlignment = Alignment.Center) {
                        Medallion(a.id, AchievementPresentation.State.UNLOCKED, 1f, AlphonsoTokens.Space.s12 * 4)
                    }
                }
                Text(
                    "ACHIEVEMENT UNLOCKED", style = OverlineType, color = ds.actionText,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "Achievement unlocked: ${a.title}. ${a.description}" },
                )
                Text(a.title, style = DisplayType, color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
                Text(a.description, style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center)
                DsPill(AchievementPresentation.tierLabel(a.tier).uppercase(), DsPillTone.GOLD)
                AchievementPresentation.queueLabel(index, unlocked.size)?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
                val last = index >= unlocked.lastIndex
                LessonEdgeButton(if (last) "Continue" else "Next", EdgeVariant.PRIMARY, { if (last) onContinue() else index++ })
                TextButton(onClick = onSeeAll) { Text("See all achievements", style = FootnoteType, color = ds.choice) }
            }
        }
    }
}
