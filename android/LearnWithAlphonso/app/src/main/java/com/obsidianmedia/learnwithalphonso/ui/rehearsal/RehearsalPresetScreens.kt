package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.rehearsal.PresetCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalController
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalPreset
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalUiState
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * The quick-start picker: the server's ready-made rehearsals as cards, in the server's order, then "Something else", which
 * opens the stepped intake. The app holds no preset content: every title and blurb here is the server's. A list that cannot
 * be had (offline, an error, the feature off) leaves "Something else" and a retry.
 */
@Composable
fun RehearsalPresetPicker(ui: RehearsalUiState, controller: RehearsalController, onBack: () -> Unit, onPick: (String) -> Unit, onSomethingElse: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { if (ui.presets == null) controller.loadPresets() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        DsBackBar("Learn", onBack)
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Text(PresetCopy.PICKER_TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f, fill = false).semantics { heading() })
                DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
            }
            Text(PresetCopy.PICKER_LINE, style = FootnoteType, color = ds.inkSoft)
            val presets = ui.presets
            when {
                presets == null && ui.presetsFailed -> {
                    Text(PresetCopy.LIST_FAILED, style = FootnoteType, color = ds.wrongInk)
                    AlphonsoSecondaryButton(PresetCopy.RETRY, { scope.launch { controller.loadPresets() } }, enabled = !ui.presetsLoading)
                }
                presets == null -> Text(PresetCopy.LOADING, style = BodyType, color = ds.inkSoft)
                else -> presets.forEach { p -> PresetCard(p.title, p.blurb) { onPick(p.id) } }
            }
            PresetCard(PresetCopy.SOMETHING_ELSE, PresetCopy.SOMETHING_ELSE_BLURB, onClick = onSomethingElse)
            Text(RehearsalCopy.PLAN_FOOTER, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
}

@Composable
private fun PresetCard(title: String, blurb: String, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(
        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .clickable(role = Role.Button, onClickLabel = title, onClick = onClick).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Text(title, style = HeadlineType, color = ds.ink)
        if (blurb.isNotBlank()) Text(blurb, style = CaptionType, color = ds.inkSoft)
    }
}

/**
 * One quick-start, before it exists: the title and blurb, who the other person is, the three stages with their goals, an
 * optional date, and two ways on. "Start now" makes it and shows the plan; "Personalise" makes it and opens Adjust.
 * Refusals (the Pro sheet, one active, not available) are shown as the stepped intake shows them.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RehearsalPresetPreview(
    preset: RehearsalPreset, busy: Boolean, error: RehearsalError?, controller: RehearsalController,
    onBack: () -> Unit, onStarted: () -> Unit, onPersonalise: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var addingDate by rememberSaveable { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    val picker = rememberDatePickerState(selectableDates = fromDay(today))
    val date = if (addingDate) picker.selectedDay() else null
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        DsBackBar("Rehearse", onBack)
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Text(preset.title, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f, fill = false).semantics { heading() })
                DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
            }
            if (preset.blurb.isNotBlank()) Text(preset.blurb, style = BodyType, color = ds.ink)
            if (preset.counterpart.isNotBlank()) Text(PresetCopy.withLine(preset.counterpart), style = FootnoteType, color = ds.inkSoft)
            if (preset.stages.isNotEmpty()) {
                Text(PresetCopy.STAGES_TITLE, style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
                DsCard {
                    preset.stages.forEachIndexed { i, s ->
                        Row(Modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                            Text("${i + 1}", style = HeadlineType, color = ds.ink)
                            Column(Modifier.weight(1f)) {
                                Text(PresetCopy.stageLabel(s.key), style = HeadlineType, color = ds.ink)
                                if (s.goal.isNotBlank()) Text(s.goal, style = CaptionType, color = ds.inkSoft)
                            }
                        }
                    }
                }
            }
            DsChip(if (!addingDate) PresetCopy.ADD_DATE else date?.toString() ?: PresetCopy.NO_DATE, selected = addingDate, onClick = { addingDate = !addingDate })
            if (addingDate && date == null) Text(PresetCopy.NO_DATE_HINT, style = FootnoteType, color = ds.inkSoft)
            if (addingDate) DatePicker(picker, showModeToggle = false, title = null, headline = null)
            Text(PresetCopy.PREVIEW_NOTE, style = FootnoteType, color = ds.inkSoft)
            error?.let { Text(RehearsalCopy.errorText(it), style = FootnoteType, color = ds.wrongInk) }
            AlphonsoPrimaryButton(PresetCopy.START_NOW, { scope.launch { if (controller.createFromPreset(preset.id, date)) onStarted() } }, busy = busy)
            AlphonsoSecondaryButton(PresetCopy.PERSONALISE, { scope.launch { if (controller.createFromPreset(preset.id, date)) onPersonalise() } }, enabled = !busy)
            Text(RehearsalCopy.PLAN_FOOTER, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
}
