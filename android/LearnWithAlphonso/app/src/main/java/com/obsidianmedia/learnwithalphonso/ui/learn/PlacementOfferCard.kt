package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.obsidianmedia.learnwithalphonso.core.firstrun.PlacementOffer
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * The placement offer, in the existing card styling (no new screen). PROMINENT is the invitation with Start and Not
 * now, used after a Hector call and at the top of Learn; QUIET is the small card that stays on Learn for beginners and
 * after a "Not now". The decision is PlacementOffer.style in the core.
 */
@Composable
fun PlacementOfferCard(style: PlacementOffer.Style, onStart: () -> Unit, onNotNow: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    when (style) {
        PlacementOffer.Style.NONE -> Unit
        PlacementOffer.Style.QUIET -> DsCard(modifier, spacing = AlphonsoTokens.Space.s2) {
            Text("Not sure where to start?", style = FootnoteType, color = ds.ink)
            DsCompactButton("Take the placement test", onStart)
        }
        PlacementOffer.Style.PROMINENT -> DsCard(modifier, spacing = AlphonsoTokens.Space.s2) {
            Text(PlacementOffer.TITLE, style = HeadlineType, color = ds.ink)
            Text(PlacementOffer.BODY, style = FootnoteType, color = ds.inkSoft)
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                DsCompactButton(PlacementOffer.START, onStart, primary = true)
                DsCompactButton(PlacementOffer.NOT_NOW, onNotNow)
            }
        }
    }
}
