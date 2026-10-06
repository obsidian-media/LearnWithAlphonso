package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCopy
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPhase
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPlan
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalError
import com.obsidianmedia.learnwithalphonso.core.goal.PreviewResult
import com.obsidianmedia.learnwithalphonso.core.goal.SaveResult
import com.obsidianmedia.learnwithalphonso.core.goal.StoredGoal
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.launch

/**
 * The learning goal on the Learn tab (BACKLOG 0.0-ac #8, docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md).
 * It renders what /api/learning-goal returns and does no plan maths: the server's planGoal is the single
 * implementation and the web and iOS cards show the same numbers. Every string comes from GoalCopy (the web card's
 * wording, word for word), and the card's state machine is GoalCardModel (tested in :core). This layer only lays
 * them out, and is compiled and unit-tested around but NOT run on a device or emulator by the change that added it.
 */
@Composable
fun GoalCard(vm: GoalCardViewModel, modifier: Modifier = Modifier) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    var showSetup by remember { mutableStateOf(false) }

    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(palette.parchment).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        AlphonsoSectionHeader("Learning goal")
        when (state.phase) {
            GoalPhase.LOADING -> Text("Loading your goal…", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
            GoalPhase.FAILED -> {
                Text(
                    GoalCopy.loadFailureMessage(state.loadError ?: LearningGoalError.Unavailable, hadCachedPlan = false),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    style = MaterialTheme.typography.bodyMedium, color = palette.destructive,
                )
                AlphonsoSecondaryButton("Try again", onClick = vm::reload, fullWidth = false)
            }
            GoalPhase.EMPTY -> {
                Text(
                    "Set a target level and date and we'll work out how many lessons a week it takes.",
                    style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft,
                )
                AlphonsoPrimaryButton("Set a learning goal", onClick = { showSetup = true }, fullWidth = false)
            }
            GoalPhase.GOAL -> state.goal?.let { goal ->
                Text(GoalCopy.headline(goal), style = MaterialTheme.typography.titleMedium, color = palette.ink)
                val plan = state.plan
                if (plan != null) {
                    AlphonsoProgressBar((plan.lessonsInScope - plan.lessonsRemaining).toFloat() / maxOf(plan.lessonsInScope, 1))
                    Text(GoalCopy.progress(plan), style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    // Status is words, never colour alone.
                    Text(GoalCopy.statusLine(plan.status), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.ink)
                    GoalCopy.weeklyLine(plan)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
                    GoalCopy.suggestionLine(plan)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
                    GoalCopy.realismLine(plan)?.let { Text(it, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = palette.ember) }
                } else {
                    // The learner's level has passed this target.
                    Text("Your level has passed this target. Pick a new target.", style = MaterialTheme.typography.bodyMedium, color = palette.ink)
                }
                if (state.offline) {
                    val asOf = plan?.let { " As of ${GoalCopy.formatDate(it.asOf.take(10))}." }.orEmpty()
                    Text(LearningGoalError.Offline.userMessage + asOf, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                }
                state.actionError?.let { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = palette.destructive) }
                Text(GoalCopy.ESTIMATE_NOTE, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AlphonsoSecondaryButton("Change goal", onClick = { showSetup = true }, enabled = !state.offline, fullWidth = false)
                    AlphonsoSecondaryButton("Remove goal", onClick = vm::remove, enabled = !state.offline, fullWidth = false)
                }
            }
        }
    }

    if (showSetup) {
        // Keyed by the view-model: a dialog opened for one course must never keep its selection (or preview) for another.
        key(vm) { GoalSetupDialog(vm = vm, existing = state.goal, onDismiss = { showSetup = false }) }
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
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun GoalSetupDialog(vm: GoalCardViewModel, existing: StoredGoal?, onDismiss: () -> Unit) {
    val palette = AlphonsoColor.palette
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Set a learning goal") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Finish level", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                // FlowRow, not Row: at a large font scale the chips wrap instead of being clipped out of reach.
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    // The five CEFR band ids, shared with the Learn screen's band picker (LearnViewModel.LEVELS).
                    LEVELS.forEach { (l, _) ->
                        FilterChip(selected = level == l, onClick = { level = l }, label = { Text(l) })
                    }
                }
                Text("Target date", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                AlphonsoSecondaryButton(GoalCopy.formatDate(day), onClick = { showPicker = true }, fullWidth = false)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(3, 6, 12).forEach { months ->
                        TextButton(onClick = { day = GoalCopy.monthsFromToday(months) }) { Text("$months months") }
                    }
                }
                when (val p = preview) {
                    PreviewUi.Loading -> Text("Working it out…", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                    is PreviewUi.Failed -> Text(p.message, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodyMedium, color = palette.destructive)
                    is PreviewUi.Ok -> {
                        val lines = GoalCopy.previewLines(p.plan)
                        Text(lines.perWeek, style = MaterialTheme.typography.titleSmall, color = palette.ink)
                        Text(lines.left, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                        GoalCopy.suggestionLine(p.plan)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft) }
                        GoalCopy.realismLine(p.plan)?.let { Text(it, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = palette.ember) }
                    }
                }
                saveError?.let { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall, color = palette.destructive) }
                Text(GoalCopy.ESTIMATE_NOTE, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
            }
        },
        confirmButton = {
            TextButton(
                enabled = preview is PreviewUi.Ok && !saving,
                onClick = {
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
            ) { Text("Save goal") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

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
