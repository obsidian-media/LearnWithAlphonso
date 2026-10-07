package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionCard
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionViewModel
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

val Course.flag: String get() = when (this) { Course.ENGLISH -> "🇬🇧"; Course.FRENCH -> "🇫🇷"; Course.SPANISH -> "🇪🇸" }
val Course.displayName: String get() = when (this) { Course.ENGLISH -> "English"; Course.FRENCH -> "French"; Course.SPANISH -> "Spanish" }

/** Port of LessonBrowserView.swift: header, review row, placement banner, band picker, units and lessons. */
@Composable
fun LearnScreen(
    container: AppContainer,
    onOpenLesson: (Course, String) -> Unit,
    onOpenReview: (Course) -> Unit,
    onOpenPlacement: (Course) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val vm: LearnViewModel = viewModel { LearnViewModel(container.content, container.progressClient, container.syncStore) }
    val state by vm.state.collectAsState()
    val progress by vm.progress.collectAsState()
    val dueCount by vm.dueCount.collectAsState()
    val palette = AlphonsoColor.palette
    val units = state.unitsForLevel(container.content)
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) { vm.refresh() }

    // The team mission: this view-model outlives the screen (kept with the Learn back-stack entry), so refresh on every
    // entry. Null (no team, loading, or a failed refresh) means no card, and no list item either.
    val missionVm: TeamMissionViewModel = viewModel(key = "team-mission-learn") { TeamMissionViewModel(container.progressClient) }
    val teamMission by missionVm.state.collectAsState()
    LaunchedEffect(missionVm) { missionVm.refresh() }

    val continueId = state.continueLessonId(container.content)
    var scrolled by remember { mutableStateOf(false) }
    LaunchedEffect(continueId) {
        if (scrolled || continueId == null) return@LaunchedEffect
        val flat = units.flatMap { u -> u.lessons.map { it.id } }
        val idx = flat.indexOf(continueId)
        if (idx >= 0) {
            scrolled = true
            listState.animateScrollToItem((idx + 4 + units.indexOfFirst { u -> u.lessons.any { it.id == continueId } }).coerceAtLeast(0))
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            CoursePicker(state.course, onSelect = vm::selectCourse)
            Spacer(Modifier.weight(1f))
            Text("Learn with Alphonso", style = MaterialTheme.typography.titleMedium, color = palette.ink)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onOpenSettings) { Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = palette.moss) }
        }
        ToastBanner(state.notice, onClear = vm::clearNotice)
        LazyColumn(state = listState, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Stable keys on every item: the header, challenges and placement card come and go as data loads,
            // and unkeyed items shifting index is the one way a lazy list can show a row twice.
            item(key = "header") { StatusHeader(progress, onBuyStreakFreeze = vm::buyStreakFreeze) }
            item(key = "goal") {
                // One view-model per course: a request still running for a course the learner just left can only
                // write into that course's own (hidden) model, never into the card now on screen.
                val goalVm: GoalCardViewModel = viewModel(key = "goal-" + state.course.code) {
                    GoalCardViewModel(state.course, container.goalClient, container.goalCache) { container.session.userId }
                }
                // This view-model outlives the screen (kept with the Learn back-stack entry), so reload on every entry:
                // after a lesson the numbers must be fresh. Quiet = no "Loading" flash over the card already showing.
                LaunchedEffect(goalVm) { goalVm.reload(quiet = true) }
                GoalCard(goalVm)
            }
            teamMission?.let { mission -> item(key = "team-mission") { TeamMissionCard(mission) } }
            if (state.challenges.isNotEmpty()) {
                item(key = "challenges") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(palette.parchment).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AlphonsoSectionHeader("This week's challenges")
                        state.challenges.forEach { c ->
                            val done = c.progress >= c.threshold
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(c.title, style = MaterialTheme.typography.bodyLarge, color = if (c.completed) palette.inkSoft else palette.ink)
                                AlphonsoProgressBar(minOf(c.progress, c.threshold).toFloat() / maxOf(c.threshold, 1))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("${minOf(c.progress, c.threshold)}/${c.threshold}", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, modifier = Modifier.weight(1f))
                                    if (done && !c.completed && c.templateId !in state.claimedChallengeIds) TextButton(onClick = { vm.claimChallenge(c) }) { Text("Claim", color = palette.moss, fontWeight = FontWeight.SemiBold) }
                                    else if (c.completed || c.templateId in state.claimedChallengeIds) Text("Claimed", style = MaterialTheme.typography.labelMedium, color = palette.moss)
                                }
                            }
                        }
                    }
                }
            }
            item(key = "review") {
                val subtitle = when (dueCount) { 0 -> "Nothing due right now"; 1 -> "1 item ready to review"; else -> "$dueCount items ready to review" }
                AlphonsoRowCard("Review", subtitle, accent = if (dueCount > 0) palette.ember else palette.hairline, modifier = Modifier.clickable { onOpenReview(state.course) })
            }
            if (state.placementTaken == false) {
                item(key = "placement") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(palette.parchment).padding(12.dp)) {
                        Text("Find your level", style = MaterialTheme.typography.titleSmall, color = palette.ink)
                        Text("A five-minute placement test picks the right band for you. No hearts lost.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                        TextButton(onClick = { onOpenPlacement(state.course) }) { Text("Take the placement test", color = palette.moss, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
            item(key = "levels") { LevelBandPicker(state.selectedLevel, onSelect = vm::selectLevel) }
            units.forEach { unit ->
                item(key = "unit-${unit.id}") { AlphonsoSectionHeader("${unit.eyebrow} · ${unit.title}", Modifier.padding(top = 8.dp)) }
                unit.lessons.forEachIndexed { index, lesson ->
                    item(key = lesson.id) {
                        val accent = when {
                            lesson.id in state.completedLessonIds -> palette.hairline
                            index == 0 -> palette.ember
                            else -> palette.moss
                        }
                        AlphonsoRowCard(lesson.title, lesson.subtitle, accent = accent, modifier = Modifier.clickable { onOpenLesson(state.course, lesson.id) })
                    }
                }
            }
        }
    }
}

@Composable
fun CoursePicker(course: Course, onSelect: (Course) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val palette = AlphonsoColor.palette
    TextButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Course: ${course.displayName}" }) {
        Text("${course.flag} ${course.code.uppercase()}", color = palette.moss, fontWeight = FontWeight.SemiBold)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
        Course.entries.forEach { c ->
            DropdownMenuItem(text = { Text("${c.flag} ${c.displayName}") }, onClick = { open = false; onSelect(c) })
        }
    }
}

@Composable
private fun LevelBandPicker(selected: String, onSelect: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LEVELS.forEach { (id, name) ->
            val isSelected = id == selected
            Column(
                Modifier
                    .clip(CircleShape)
                    .background(if (isSelected) palette.moss else palette.parchment)
                    .border(if (isSelected) 0.dp else 1.dp, palette.hairline, CircleShape)
                    .clickable { onSelect(id) }
                    .padding(horizontal = 14.dp, vertical = 6.dp)
                    .semantics { contentDescription = "$id $name${if (isSelected) ", selected" else ""}" },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(id, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (isSelected) palette.onPrimary else palette.ink)
                Text(name, fontSize = 9.sp, color = if (isSelected) palette.onPrimary else palette.ink)
            }
        }
    }
}

/** Port of StatusHeaderView.swift: streak, hearts, XP, league, and the mascot greeting. Nothing when no cache yet. */
@Composable
fun StatusHeader(progress: LessonCompletionProgress?, onBuyStreakFreeze: (() -> Unit)? = null) {
    if (progress == null) return
    val palette = AlphonsoColor.palette
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            StatPill("🔥", "${progress.streak}", "Streak: ${progress.streak} day${if (progress.streak == 1) "" else "s"}")
            StatPill("❤️", "${progress.hearts}", "Hearts: ${progress.hearts}")
            StatPill("⭐", "${progress.xp}", "XP: ${progress.xp}")
            Spacer(Modifier.weight(1f))
            Text(
                progress.leagueTier.replaceFirstChar { it.uppercase() },
                color = androidx.compose.ui.graphics.Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(LeagueTierPalette.color(progress.leagueTier)).padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
        AlphonsoMascotBanner(if (progress.streak > 0) "Nice ${progress.streak}-day streak! Ready for today's lesson?" else "Ready for today's lesson?")
        if (onBuyStreakFreeze != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text("\u2744\uFE0F ${progress.streakFreezes} streak freeze${if (progress.streakFreezes == 1) "" else "s"}", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft, modifier = Modifier.weight(1f))
                TextButton(onClick = onBuyStreakFreeze) { Text("Buy freeze (50 XP)", color = palette.moss, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

@Composable
private fun StatPill(icon: String, value: String, label: String) {
    val palette = AlphonsoColor.palette
    Row(
        Modifier.clip(CircleShape).background(palette.parchment).border(1.dp, palette.hairline, CircleShape).padding(horizontal = 10.dp, vertical = 6.dp).semantics(mergeDescendants = true) { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(icon, fontSize = 13.sp)
        Text(value, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = palette.ink)
    }
}

object LeagueTierPalette {
    fun color(tier: String): androidx.compose.ui.graphics.Color = when (tier) {
        "bronze" -> androidx.compose.ui.graphics.Color(0xFFB07242)
        "silver" -> androidx.compose.ui.graphics.Color(0xFF8A9099)
        "sapphire" -> androidx.compose.ui.graphics.Color(0xFF4A6B8A)
        "ruby" -> androidx.compose.ui.graphics.Color(0xFF9A4A4A)
        "diamond" -> androidx.compose.ui.graphics.Color(0xFF4A7F7A)
        else -> androidx.compose.ui.graphics.Color(0xFF878787)
    }
}
