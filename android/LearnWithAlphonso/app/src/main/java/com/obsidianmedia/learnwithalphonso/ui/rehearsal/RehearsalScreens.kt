package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import androidx.activity.compose.BackHandler
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
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.rehearsal.EventKind
import com.obsidianmedia.learnwithalphonso.core.rehearsal.INTAKE_TEXT_MAX
import com.obsidianmedia.learnwithalphonso.core.rehearsal.IntakeCheck
import com.obsidianmedia.learnwithalphonso.core.rehearsal.OutcomeChoice
import com.obsidianmedia.learnwithalphonso.core.rehearsal.PresetCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Rehearsal
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalApi
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalController
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalEntry
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalRules
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalState
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalSummary
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Stage
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import com.obsidianmedia.learnwithalphonso.ui.components.DsHeroCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Holds the controller across rotation; the screens read [controller]'s state. */
class RehearsalViewModel(api: RehearsalApi, course: String) : ViewModel() {
    val controller = RehearsalController(api, course)
}

/** "Tue 1 Dec 2026" -> the UTC millis a Material date picker works in, and back. */
private fun LocalDate.toPickerMillis(): Long = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
internal fun DatePickerState.selectedDay(): String? = selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }

/** Days the picker offers: from [first] on (the event is in the future, or today). */
@OptIn(ExperimentalMaterial3Api::class)
internal fun fromDay(first: LocalDate) = object : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean =
        !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isBefore(first)
}

/**
 * The Rehearsals screen: the plan when one is active, the stepped intake when none is, "How did it go?" after the event.
 * [mode] "outcome" opens the follow-up (the Today row). The tutor is always labelled AI and nothing here is a score.
 */
@Composable
fun RehearsalScreen(
    container: AppContainer, mode: String, onBack: () -> Unit,
    onOpenStage: (id: String, stage: Stage) -> Unit, onOpenPaywall: () -> Unit,
) {
    val course = remember { container.activeCourse.course.value }
    val vm: RehearsalViewModel = viewModel(key = "rehearsal-${course.code}") { RehearsalViewModel(container.rehearsalClient, course.code) }
    val c = vm.controller
    val ui by c.ui.collectAsState()
    var screen by rememberSaveable { mutableStateOf(mode) }
    val hostScope = rememberCoroutineScope()
    LaunchedEffect(Unit) { c.load() }
    // System Back from a preview or the intake returns to the picker.
    BackHandler(enabled = ui.state?.active == null && (screen == "intake" || screen.startsWith(PRESET_PREFIX))) { c.clearError(); screen = "" }
    // A learner who may not rehearse (free one used, not Pro) with nothing active meets the Pro sheet at once.
    LaunchedEffect(ui.state) { ui.state?.let { if (it.active == null) c.entryTapped(container.entitlements.isPro) } }
    val ds = LocalAlphonsoTokens.current
    AiConsentGate(container, onDecline = onBack) {
        Column(Modifier.fillMaxSize().background(ds.surface)) {
            val state = ui.state
            when {
                state == null && ui.loading -> Text("Loading…", style = BodyType, color = ds.inkSoft, modifier = Modifier.padding(AlphonsoTokens.Space.gutter))
                state == null -> {
                    DsBackBar("Learn", onBack)
                    Text(RehearsalCopy.errorText(ui.error ?: com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError.FAILED), style = BodyType, color = ds.wrongInk, modifier = Modifier.padding(AlphonsoTokens.Space.gutter))
                    AlphonsoPrimaryButton("Try again", { hostScope.launch { c.load() } }, Modifier.padding(AlphonsoTokens.Space.gutter))
                }
                state.active != null && screen == "outcome" -> HowDidItGo(state.active!!, ui.busy, ui.error, c, onBack = { screen = "" }, onDone = onBack, onMoved = { screen = "" })
                state.active != null && screen == "adjust" -> RehearsalIntakeScreen(course.code, state.active, ui.busy, ui.error, c, onBack = { screen = "" }, onSaved = { screen = "" })
                state.active != null -> RehearsalPlan(state, c, onBack = onBack, onOpenStage = onOpenStage, onAdjust = { screen = "adjust" })
                // The free rehearsal is used and the learner is not Pro: the Pro sheet is the screen, the picker stays hidden.
                entryOpensPaywall(state, container.entitlements.isPro) -> DsBackBar("Learn", onBack)
                screen == "intake" -> RehearsalIntakeScreen(course.code, null, ui.busy, ui.error, c, onBack = { c.clearError(); screen = "" }, onSaved = { screen = "" })
                screen.startsWith(PRESET_PREFIX) && ui.presets?.any { it.id == screen.removePrefix(PRESET_PREFIX) } == true -> {
                    val preset = ui.presets!!.first { it.id == screen.removePrefix(PRESET_PREFIX) }
                    // Start now: the plan shows once the state has an active rehearsal. Personalise: the same, with Adjust on top.
                    RehearsalPresetPreview(preset, ui.busy, ui.error, c, onBack = { c.clearError(); screen = "" }, onStarted = { screen = "" }, onPersonalise = { screen = "adjust" })
                }
                else -> RehearsalPresetPicker(ui, c, onBack = onBack, onPick = { c.clearError(); screen = PRESET_PREFIX + it }, onSomethingElse = { c.clearError(); screen = "intake" })
            }
        }
        if (ui.paywall) RehearsalPaywallSheet(ui.state?.history?.firstOrNull(), onSeePro = { c.dismissPaywall(); onOpenPaywall() }, onNotNow = { c.dismissPaywall(); if (ui.state?.active == null) onBack() })
    }
}

/** The screen key of one quick-start's preview ("preset:" plus the server's preset id). */
private const val PRESET_PREFIX = "preset:"

// ---------------------------------------------------------------- the stepped intake

private const val STEPS = 4

/** The four questions, one per screen with a progress bar; also the Adjust screen (pre-filled). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RehearsalIntakeScreen(
    course: String, editing: Rehearsal?, busy: Boolean, error: com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError?,
    controller: RehearsalController, onBack: () -> Unit, onSaved: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var step by rememberSaveable { mutableIntStateOf(1) }
    var kind by rememberSaveable { mutableStateOf(editing?.kind) }
    var date by rememberSaveable { mutableStateOf(editing?.eventDate) }
    var who by rememberSaveable { mutableStateOf(editing?.counterpart ?: "") }
    var worries by rememberSaveable { mutableStateOf(editing?.worries ?: "") }
    var invalid by remember { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = date?.takeIf { RehearsalRules.isCalendarDate(it) }?.let { LocalDate.parse(it).toPickerMillis() },
        selectableDates = fromDay(today),
    )
    LaunchedEffect(pickerState.selectedDateMillis) { date = pickerState.selectedDay() }
    BackHandler(enabled = step > 1) { step -= 1 }

    fun submit(worriesText: String) {
        when (val check = RehearsalRules.validate(course, kind, date, who, worriesText)) {
            is IntakeCheck.Invalid -> invalid = true
            is IntakeCheck.Valid -> scope.launch {
                invalid = false
                val ok = if (editing != null) controller.adjust(editing.id, check.intake) else controller.create(check.intake)
                if (ok) onSaved()
            }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        DsBackBar(if (step > 1) "Step ${step - 1}" else "Learn", { if (step > 1) step -= 1 else onBack() })
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Text(if (editing != null) "Adjust your rehearsal" else "Rehearse", style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
                DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
            }
            DsProgressBar(step / STEPS.toFloat(), label = "Progress", value = "Step $step of $STEPS")
            Text("Step $step of $STEPS", style = CaptionType, color = ds.inkSoft)
            when (step) {
                1 -> {
                    Text("What is coming up?", style = TitleType, color = ds.ink)
                    DsChipRow { EventKind.entries.forEach { k -> DsChip(k.label, selected = kind == k, onClick = { kind = k }) } }
                }
                2 -> {
                    Text("When is it?", style = TitleType, color = ds.ink)
                    DatePicker(pickerState, showModeToggle = false, title = null, headline = null)
                    DsChip("Not sure yet", selected = date == null, onClick = { pickerState.selectedDateMillis = null; date = null })
                    Text("If you are not sure, the plan still works. Alphonso offers a stage every other day.", style = FootnoteType, color = ds.inkSoft)
                }
                3 -> {
                    Text("Who will you be talking to?", style = TitleType, color = ds.ink)
                    DsField(who, { if (it.length <= INTAKE_TEXT_MAX) who = it }, (kind ?: EventKind.OTHER).placeholder, label = "Example: “a hiring manager”. Up to $INTAKE_TEXT_MAX characters.", maxLines = 3)
                    Text(RehearsalCopy.PRIVACY_LINE, style = FootnoteType, color = ds.inkSoft)
                }
                else -> {
                    Text("What worries you most?", style = TitleType, color = ds.ink)
                    Text("Optional", style = CaptionType, color = ds.inkSoft)
                    DsField(worries, { if (it.length <= INTAKE_TEXT_MAX) worries = it }, "Questions about salary, and my English when I am nervous", label = "Optional. Up to $INTAKE_TEXT_MAX characters.", maxLines = 3)
                    Text("For example: a type of question, understanding fast speech, your accent.", style = FootnoteType, color = ds.inkSoft)
                }
            }
            if (invalid) Text(com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy.errorText(com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError.INVALID), style = FootnoteType, color = ds.wrongInk)
            error?.let { Text(RehearsalCopy.errorText(it), style = FootnoteType, color = ds.wrongInk) }
            if (step < STEPS) {
                val canNext = when (step) { 1 -> kind != null; 3 -> who.trim().isNotEmpty(); else -> true }
                AlphonsoPrimaryButton("Next", { step += 1 }, enabled = canNext)
            } else {
                AlphonsoPrimaryButton(if (editing != null) "Save changes" else "Make my plan", { submit(worries) }, busy = busy)
                TextButton(onClick = { worries = ""; submit("") }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch)) { Text("Skip", color = ds.actionText) }
            }
            Text(RehearsalCopy.PLAN_FOOTER, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
}

// ---------------------------------------------------------------- the plan

/** "Your rehearsal plan": three stages, one primary button (the server's next stage), Adjust and Delete quiet. */
@Composable
fun RehearsalPlan(state: RehearsalState, controller: RehearsalController, onBack: () -> Unit, onOpenStage: (String, Stage) -> Unit, onAdjust: () -> Unit) {
    val r = state.active ?: return
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf(false) }
    val next = state.next ?: Stage.WARMUP
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        DsBackBar("Learn", onBack)
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            DsHeroCard {
                Text("YOUR REHEARSAL PLAN", style = OverlineType, color = ds.onHeroKick)
                Text(r.kind.label, style = TitleType, color = ds.onHero, modifier = Modifier.semantics { heading() })
                Text(RehearsalCopy.whenLine(r.eventDate, LocalDate.now()), style = FootnoteType, color = ds.onHeroSoft)
                Text(RehearsalCopy.withLine(r), style = FootnoteType, color = ds.onHeroSoft)
            }
            Stage.entries.forEach { stage ->
                val done = state.isDone(stage)
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(if (done) ds.rightTint else ds.card)
                        .border(2.dp, if (done) ds.right else ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                        .clickable(role = Role.Button, onClickLabel = "${if (done) "Repeat" else "Start"} ${stage.label}") { onOpenStage(r.id, stage) }
                        .padding(AlphonsoTokens.Space.s3),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                ) {
                    Text(if (done) "✓" else "${stage.number}", style = HeadlineType, color = if (done) ds.rightInk else ds.ink)
                    Column(Modifier.weight(1f)) {
                        Text(stage.label, style = HeadlineType, color = ds.ink)
                        Text(RehearsalCopy.stageRowSubtitle(stage, done), style = CaptionType, color = ds.inkSoft)
                    }
                    if (!done && stage == next) Text("Next", style = CaptionType, color = ds.choice)
                    Text(if (done) "Repeat" else "Start", style = FootnoteType, color = ds.actionText)
                }
            }
            AlphonsoPrimaryButton(RehearsalCopy.nextButton(next), { onOpenStage(r.id, next) })
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                TextButton(onClick = onAdjust) { Text("Adjust", color = ds.inkSoft) }
                TextButton(onClick = { confirming = true }) { Text("Delete this rehearsal", color = ds.inkSoft) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.Top) {
                DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
                Text(RehearsalCopy.PLAN_FOOTER, style = CaptionType, color = ds.inkSoft, modifier = Modifier.weight(1f))
            }
        }
    }
    if (confirming) DsConfirmDialog(
        "Delete this rehearsal?", "Its plan and run notes are removed. You can not undo this.", "Delete",
        onConfirm = { confirming = false; scope.launch { controller.delete(r.id) } }, onDismiss = { confirming = false }, destructive = true,
    )
}

// ---------------------------------------------------------------- how did it go

/** Four full-width taps. "Moved" opens a date picker; the other way out is closing the rehearsal. Nothing is typed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HowDidItGo(
    r: Rehearsal, busy: Boolean, error: com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError?, controller: RehearsalController,
    onBack: () -> Unit, onDone: () -> Unit, onMoved: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var moving by rememberSaveable { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    val picker = rememberDatePickerState(selectableDates = fromDay(today.plusDays(1)))
    val newDay = picker.selectedDay()
    BackHandler(enabled = moving) { moving = false }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        DsBackBar("Plan", { if (moving) moving = false else onBack() })
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Text(RehearsalCopy.FOLLOW_UP_TITLE, style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
            Text("${RehearsalCopy.dateLabel(today.toString())} · ${r.kind.label}", style = FootnoteType, color = ds.inkSoft)
            if (moving) {
                Text(RehearsalCopy.MOVE_PROMPT, style = TitleType, color = ds.ink)
                Text(RehearsalCopy.MOVE_NOTE, style = FootnoteType, color = ds.inkSoft)
                DatePicker(picker, showModeToggle = false, title = null, headline = null)
                AlphonsoPrimaryButton(RehearsalCopy.moveButton(newDay), { newDay?.let { d -> scope.launch { if (controller.outcome(r.id, OutcomeChoice.MOVED, d)) onMoved() } } }, enabled = newDay != null && RehearsalRules.isFutureDay(newDay, today), busy = busy)
                AlphonsoSecondaryButton(RehearsalCopy.CLOSE_BUTTON, { scope.launch { if (controller.close(r.id)) onDone() } }, enabled = !busy)
            } else {
                Text("How did your ${r.kind.short} go?", style = TitleType, color = ds.ink)
                Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                    DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
                    Text("One tap is enough. Alphonso (AI) will remember it.", style = FootnoteType, color = ds.inkSoft)
                }
                OutcomeChoice.entries.forEach { choice ->
                    Column(
                        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                            .border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control))
                            .clickable(enabled = !busy, role = Role.Button) {
                                if (choice == OutcomeChoice.MOVED) moving = true else scope.launch { if (controller.outcome(r.id, choice)) onDone() }
                            }.padding(AlphonsoTokens.Space.s4),
                    ) {
                        Text(RehearsalCopy.outcomeRowTitle(choice), style = HeadlineType, color = ds.ink)
                        RehearsalCopy.outcomeRowDetail(choice)?.let { Text(it, style = CaptionType, color = ds.inkSoft) }
                    }
                }
            }
            error?.let { Text(RehearsalCopy.errorText(it), style = FootnoteType, color = ds.wrongInk) }
            Text(RehearsalCopy.OUTCOME_FOOTER, style = CaptionType, color = ds.inkSoft, modifier = Modifier.padding(bottom = AlphonsoTokens.Space.s6))
        }
    }
}

// ---------------------------------------------------------------- the Pro sheet

/** After the free rehearsal, for a learner who is not Pro: what they did, what stays free, and two equal ways out. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RehearsalPaywallSheet(latest: RehearsalSummary?, onSeePro: () -> Unit, onNotNow: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    ModalBottomSheet(
        onDismissRequest = onNotNow, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Text(RehearsalCopy.PAYWALL_TITLE, style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
            Text(RehearsalCopy.PAYWALL_SUBTITLE, style = HeadlineType, color = ds.ink)
            Text(RehearsalCopy.paywallBody(latest), style = FootnoteType, color = ds.inkSoft)
            Text("• ${RehearsalCopy.PAYWALL_STAYS_1}", style = FootnoteType, color = ds.ink)
            Text("• ${RehearsalCopy.PAYWALL_STAYS_2}", style = FootnoteType, color = ds.ink)
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                AlphonsoPrimaryButton("See Pro", onSeePro, Modifier.weight(1f))
                AlphonsoSecondaryButton("Not now", onNotNow, Modifier.weight(1f))
            }
            Text(RehearsalCopy.PAYWALL_PRICE_NOTE, style = CaptionType, color = ds.inkSoft)
        }
    }
}

/** Whether a tap on the Learn entry opens the Pro sheet (the one place the rule lives for the screens). */
fun entryOpensPaywall(state: RehearsalState?, isPro: Boolean): Boolean = state != null && RehearsalEntry.decide(state, isPro) == RehearsalEntry.PAYWALL

/** The event day: the 2-minute warm-up takes Learn's hero for that day only. */
@Composable
fun RehearsalHeroCard(item: com.obsidianmedia.learnwithalphonso.core.rehearsal.PinnedItem, onStart: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    DsHeroCard(Modifier.padding(vertical = AlphonsoTokens.Space.s1)) {
        Text(RehearsalCopy.heroOverline(item.kindOrNull).uppercase(), style = OverlineType, color = ds.onHeroKick)
        Text(RehearsalCopy.HERO_TITLE, style = TitleType, color = ds.onHero, modifier = Modifier.semantics { heading() })
        Text(RehearsalCopy.HERO_LINE, style = FootnoteType, color = ds.onHeroSoft)
        com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton(RehearsalCopy.HERO_BUTTON, onStart, primary = true)
    }
}
