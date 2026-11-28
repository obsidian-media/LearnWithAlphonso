package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalPartner
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Stage
import com.obsidianmedia.learnwithalphonso.core.rehearsal.StagePartnerRules
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * The partner, chosen at the start of EACH stage (the owner's pick 5B, the web's StagePartnerSheet). "Start with Alphonso"
 * is the main button for everyone. Hector is the second choice: a learner who is not Pro sees a Pro badge on him and
 * choosing him opens the Pro screen, never a refusal after the call has started. On the last stage a Hector run can
 * also be a hard mode. Both partners are AI and the sheet says so.
 *
 * [hectorAvailable] is the server's answer (true Pro, false not Pro, null "could not tell": the learner may try and the
 * run's start decides). The sheet only draws the choices; [StagePartnerRules] decides what they mean.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StagePartnerSheet(
    stage: Stage,
    hectorAvailable: Boolean?,
    /** The app's own Pro state: the server's answer can be older than a purchase just made, so a Pro learner is never locked out. */
    isPro: Boolean,
    onChoose: (StagePartnerRules.Choice) -> Unit,
    onDismiss: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    var hard by rememberSaveable { mutableStateOf(false) }
    val locked = StagePartnerRules.hectorLocked(hectorAvailable, isPro)
    val hardOffered = StagePartnerRules.hardModeOffered(stage, hectorAvailable, isPro)
    // What the button will do reads from the rules, so a stale toggle never shows on a stage that has no hard mode.
    val hardOn = hard && hardOffered
    ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(
            Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Text(stage.label, style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
            Text(StagePartnerRules.SUBTITLE, style = FootnoteType, color = ds.inkSoft)
            AlphonsoPrimaryButton(StagePartnerRules.ALPHONSO_BUTTON, { onChoose(StagePartnerRules.alphonso()) })
            DsCard(padding = AlphonsoTokens.Space.s3) {
                // One announcement for the name, the AI label and the Pro badge, so a screen reader hears all three.
                Row(
                    Modifier.semantics(mergeDescendants = true) {
                        contentDescription = buildString {
                            append(RehearsalPartner.HECTOR.displayName).append(", ").append(RehearsalCopy.AI_LABEL)
                            if (locked) append(", ").append(StagePartnerRules.PRO_BADGE_DESCRIPTION)
                        }
                    },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                ) {
                    Text(RehearsalPartner.HECTOR.displayName, style = HeadlineType, color = ds.ink)
                    DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
                    if (locked) DsPill(StagePartnerRules.PRO_BADGE, DsPillTone.GOLD)
                }
                Text(StagePartnerRules.HECTOR_LINE, style = FootnoteType, color = ds.inkSoft)
                if (hardOffered) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch)
                            .toggleable(value = hard, role = Role.Switch, onValueChange = { hard = it }),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(StagePartnerRules.HARD_MODE_TITLE, style = HeadlineType, color = ds.ink)
                            Text(StagePartnerRules.HARD_MODE_LINE, style = FootnoteType, color = ds.inkSoft)
                        }
                        DsSwitch(checked = hard, onChange = null)
                    }
                }
                AlphonsoSecondaryButton(
                    StagePartnerRules.hectorButton(stage, hectorAvailable, isPro, hardOn),
                    { onChoose(StagePartnerRules.hector(stage, hectorAvailable, isPro, hardOn)) },
                )
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch)) {
                Text(StagePartnerRules.NOT_NOW, color = ds.inkSoft)
            }
        }
    }
}
