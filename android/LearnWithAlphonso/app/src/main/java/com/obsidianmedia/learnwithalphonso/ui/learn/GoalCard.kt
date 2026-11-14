package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCopy
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPhase
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPlan
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalError
import com.obsidianmedia.learnwithalphonso.core.goal.PreviewResult
import com.obsidianmedia.learnwithalphonso.core.goal.SaveResult
import com.obsidianmedia.learnwithalphonso.core.goal.StoredGoal
import com.obsidianmedia.learnwithalphonso.core.logic.PathGoalChips
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsHeroCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch

/**
 * The learning goal on Build my path (BACKLOG 0.0-ac #8, docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md),
 * in the batch-1 design (the same card as iOS GoalCardView.swift): the goal as chips (purpose, level, date), then the
 * navy hero with the progress, the status in words and Change goal / Remove goal. It renders what /api/learning-goal
 * returns and does no plan maths: the server's planGoal is the single implementation. Every string comes from GoalCopy
 * (the web card's wording, word for word) and the state machine is GoalCardModel (tested in :core).
 *
 * [purposeId] is why the learner is here (their first-run answer) for the first chip; null leaves that chip out.
 */
@Composable
fun GoalCard(vm: GoalCardViewModel, purposeId: String?, modifier: Modifier = Modifier, openSheetAtStart: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    var showSetup by remember { mutableStateOf(openSheetAtStart) }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        DsOverline("Learning goal")
        when (state.phase) {
            GoalPhase.LOADING -> DsCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                    CircularProgressIndicator(color = ds.choice)
                    Text("Loading your goal…", style = FootnoteType, color = ds.inkSoft)
                }
            }
            GoalPhase.FAILED -> DsCard {
                Text(
                    GoalCopy.loadFailureMessage(state.loadError ?: LearningGoalError.Unavailable, hadCachedPlan = false),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    style = FootnoteType, color = ds.wrongInk,
                )
                DsCompactButton("Try again", vm::reload)
            }
            GoalPhase.EMPTY -> DsCard {
                Text("Set a target level and date and we'll work out how many lessons a week it takes.", style = FootnoteType, color = ds.inkSoft)
                LessonEdgeButton("Set a learning goal", EdgeVariant.PRIMARY, { showSetup = true })
            }
            GoalPhase.GOAL -> state.goal?.let { goal ->
                // Round 8 A0: the goal as chips (purpose, level, date); a tap changes it.
                DsCard(padding = AlphonsoTokens.Space.s3, spacing = AlphonsoTokens.Space.s2) {
                    DsChipRow {
                        PathGoalChips.labels(purposeId, goal.targetLevel, goal.targetDate).forEach { label ->
                            DsChip(label, true, onClick = { showSetup = true })
                        }
                    }
                    Text(PathGoalChips.NOTE, style = CaptionType, color = ds.inkSoft)
                }
                DsHeroCard(Modifier.semantics(mergeDescendants = false) { contentDescription = "Learning goal" }) {
                    Text(GoalCopy.headline(goal), style = TitleType, color = ds.onHero)
                    val plan = state.plan
                    if (plan != null) {
                        DsProgressBar((plan.lessonsInScope - plan.lessonsRemaining).toFloat() / maxOf(plan.lessonsInScope, 1), onHero = true)
                        Text(GoalCopy.progress(plan), style = FootnoteType, color = ds.onHeroSoft)
                        // Status is words, never colour alone.
                        Text(GoalCopy.statusLine(plan.status), style = HeadlineType, color = ds.onHero)
                        GoalCopy.weeklyLine(plan)?.let { Text(it, style = FootnoteType, color = ds.onHeroSoft) }
                        GoalCopy.suggestionLine(plan)?.let { Text(it, style = FootnoteType, color = ds.onHeroSoft) }
                        GoalCopy.realismLine(plan)?.let { Text(it, style = FootnoteType, color = ds.onHeroKick) }
                    } else {
                        // The learner's level has passed this target.
                        Text("Your level has passed this target. Pick a new target.", style = FootnoteType, color = ds.onHero)
                    }
                    if (state.offline) {
                        val asOf = plan?.let { " As of ${GoalCopy.formatDate(it.asOf.take(10))}." }.orEmpty()
                        Text(LearningGoalError.Offline.userMessage + asOf, style = CaptionType, color = ds.onHeroSoft)
                    }
                    Text(GoalCopy.ESTIMATE_NOTE, style = CaptionType, color = ds.onHeroSoft)
                    Row(Modifier.padding(top = AlphonsoTokens.Space.s1), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                        DsCompactButton("Change goal", { showSetup = true }, enabled = !state.offline)
                        DsCompactButton("Remove goal", vm::remove, enabled = !state.offline)
                    }
                }
                state.actionError?.let {
                    DsCard { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FootnoteType, color = ds.wrongInk) }
                }
            }
        }
    }

    if (showSetup) {
        // Keyed by the view-model: a sheet opened for one course must never keep its selection (or preview) for another.
        key(vm) { GoalSetupSheet(vm = vm, existing = state.goal, onDismiss = { showSetup = false }) }
    }
}

private sealed interface PreviewUi {
    object Loading : PreviewUi
    data class Ok(val plan: GoalPlan) : PreviewUi
    data class Failed(val message: String) : PreviewUi
}

/**
 * Setting or changing the goal: a level, a date (3/6/12-month presets or a date picker), and a live preview of the
 * lessons a week it takes. Save is only possible once a preview for the CURRENT selection has arrived: the preview
 * runs in a LaunchedEffect keyed by the selection, so a newer selection cancels an older request.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalSetupSheet(vm: GoalCardViewModel, existing: StoredGoal?, onDismiss: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var level by remember { mutableStateOf(existing?.targetLevel ?: "B1") }
    var day by remember { mutableStateOf(GoalCopy.atLeastTomorrow(existing?.targetDate ?: GoalCopy.monthsFromToday(6))) }
    var preview by remember { mutableStateOf<PreviewUi>(PreviewUi.Loading) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var showPicker by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(level, day) {
        preview = PreviewUi.Loading
        preview = when (val result = vm.preview(level, day)) {
            is PreviewResult.Ok -> PreviewUi.Ok(result.plan)
            is PreviewResult.Failed -> PreviewUi.Failed(result.message)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = ds.surface,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s2),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsCompactButton("Cancel", onDismiss)
                Text("Set a learning goal", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f).semantics { heading() })
            }
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsOverline("Finish level")
                // The five CEFR band ids, shared with the Learn screen's band picker (LearnViewModel.LEVELS).
                DsChipRow { LEVELS.forEach { (l, _) -> DsChip(l, level == l, onClick = { level = l }) } }
                DsOverline("Target date")
                DsCard {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clickable { showPicker = true }
                            .semantics(mergeDescendants = true) { contentDescription = "Target date, ${GoalCopy.formatDate(day)}. Opens the date picker" },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(GoalCopy.formatDate(day), style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                    }
                    DsChipRow { listOf(3, 6, 12).forEach { months -> DsChip("$months months", day == GoalCopy.monthsFromToday(months), onClick = { day = GoalCopy.monthsFromToday(months) }) } }
                }
                when (val p = preview) {
                    PreviewUi.Loading -> DsCard { Text("Working it out…", style = FootnoteType, color = ds.inkSoft) }
                    is PreviewUi.Failed -> DsCard { Text(p.message, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FootnoteType, color = ds.wrongInk) }
                    is PreviewUi.Ok -> {
                        val lines = GoalCopy.previewLines(p.plan)
                        DsHeroCard {
                            Text(lines.perWeek, style = TitleType, color = ds.onHero)
                            Text(lines.left, style = FootnoteType, color = ds.onHeroSoft)
                            GoalCopy.suggestionLine(p.plan)?.let { Text(it, style = FootnoteType, color = ds.onHeroSoft) }
                            GoalCopy.realismLine(p.plan)?.let { Text(it, style = FootnoteType, color = ds.onHeroKick) }
                        }
                    }
                }
                Text(GoalCopy.ESTIMATE_NOTE, style = CaptionType, color = ds.inkSoft)
                saveError?.let { DsCard { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FootnoteType, color = ds.wrongInk) } }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s3, bottom = AlphonsoTokens.Space.s4),
                horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Box(Modifier.weight(1f)) { LessonEdgeButton("Cancel", EdgeVariant.SECONDARY, onDismiss) }
                Box(Modifier.weight(1f)) {
                    LessonEdgeButton(
                        "Save goal", EdgeVariant.PRIMARY,
                        {
                            scope.launch {
                                saving = true
                                saveError = null
                                when (val result = vm.save(level, day)) {
                                    SaveResult.Saved, SaveResult.Dropped -> onDismiss()
                                    is SaveResult.Failed -> saveError = result.message
                                }
                                saving = false
                            }
                        },
                        enabled = preview is PreviewUi.Ok && !saving,
                    )
                }
            }
        }
    }

    if (showPicker) {
        // Material3's DatePicker works in UTC milliseconds, which is exactly the app's "day" (a UTC date).
        val tomorrow = GoalCopy.tomorrow()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = GoalCopy.millisOfDay(day),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = GoalCopy.dayOf(utcTimeMillis) >= tomorrow
            },
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { day = GoalCopy.dayOf(it) }
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showPicker = false }) { Text("Cancel") } },
        ) { DatePicker(state = pickerState) }
    }
}
