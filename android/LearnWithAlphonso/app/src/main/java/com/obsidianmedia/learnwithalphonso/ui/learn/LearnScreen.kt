package com.obsidianmedia.learnwithalphonso.ui.learn

import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
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
import com.obsidianmedia.learnwithalphonso.data.DeadLetterDismissals
import com.obsidianmedia.learnwithalphonso.core.sync.PendingSyncNotice
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterNotice
import com.obsidianmedia.learnwithalphonso.BuildConfig
import androidx.compose.ui.platform.LocalUriHandler
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
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoProgressBar
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionCard
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionViewModel
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import com.obsidianmedia.learnwithalphonso.core.logic.CurrentUnit
import com.obsidianmedia.learnwithalphonso.core.logic.FoldRow
import com.obsidianmedia.learnwithalphonso.core.logic.FoldUnit
import com.obsidianmedia.learnwithalphonso.core.logic.LearnFold
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import androidx.compose.foundation.layout.Box
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import kotlinx.coroutines.launch

val Course.flag: String get() = when (this) { Course.ENGLISH -> "🇬🇧"; Course.FRENCH -> "🇫🇷"; Course.SPANISH -> "🇪🇸" }
val Course.displayName: String get() = when (this) { Course.ENGLISH -> "English"; Course.FRENCH -> "French"; Course.SPANISH -> "Spanish" }

/**
 * The two lines about queued work (LessonBrowserView.swift): finished lessons and review answers still saved only on
 * this phone, with a "Sync now" that survives the screen, and lessons the server permanently rejected, with a way to
 * contact support. Outside the lazy list so it never shifts the continue-lesson scroll target.
 */
@Composable
private fun SyncNotices(container: AppContainer, vm: LearnViewModel) {
    val palette = AlphonsoColor.palette
    val ds = LocalAlphonsoTokens.current
    val lessons by vm.pendingLessons.collectAsState()
    val reviewAnswers by vm.pendingReviewAnswers.collectAsState()
    val syncing by container.syncCoordinator.syncing.collectAsState()
    val isConnected by container.connectivity.isConnected.collectAsState()
    val dead by vm.deadLetters.collectAsState()
    val dismissals = remember { DeadLetterDismissals(container.prefs) }
    val uriHandler = LocalUriHandler.current
    var dismissed by remember { mutableStateOf(dismissals.dismissed) }
    // The list starts empty before the first read: pruning then would forget every dismissal.
    LaunchedEffect(dead) {
        dismissals.prune(dead.map { it.identity })
        dismissed = dismissals.dismissed
    }

    PendingSyncNotice.message(lessons, reviewAnswers, isConnected)?.let { message ->
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft, modifier = Modifier.weight(1f))
            TextButton(onClick = { container.syncCoordinator.syncNow() }, enabled = !syncing) {
                Text(if (syncing) PendingSyncNotice.SYNCING_TITLE else PendingSyncNotice.SYNC_NOW_TITLE, color = ds.actionText)
            }
        }
    }
    val visible = DeadLetterNotice.visible(dead.map { it.identity }, dismissed)
    DeadLetterNotice.message(visible.size)?.let { message ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
            Text(message, style = MaterialTheme.typography.bodySmall, color = palette.destructive)
            Row {
                TextButton(onClick = {
                    val reasons = dead.filter { it.identity in visible }.map { it.reason }
                    // No mail app installed: the notice stays, and there is nothing to crash on.
                    runCatching { uriHandler.openUri(DeadLetterNotice.supportMailUri(visible, reasons, BuildConfig.VERSION_NAME)) }
                }) { Text(DeadLetterNotice.CONTACT_TITLE, color = ds.actionText) }
                TextButton(onClick = { dismissals.dismiss(visible); dismissed = dismissals.dismissed }) { Text(DeadLetterNotice.DISMISS_TITLE, color = ds.inkSoft) }
            }
        }
    }
}

/** Port of LessonBrowserView.swift: header, review row, placement banner, band picker, units and lessons. */
@Composable
fun LearnScreen(
    container: AppContainer,
    onOpenLesson: (Course, String) -> Unit,
    onOpenReview: (Course) -> Unit,
    onOpenPlacement: (Course) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val vm: LearnViewModel = viewModel { LearnViewModel(container.content, container.progressClient, container.syncStore, initialCourse = container.activeCourse.course.value, userId = container.session.userId) }
    val state by vm.state.collectAsState()
    // Learn follows the active course when the account changes. It writes the course only when the learner picks one
    // (below), never its initial state: a screen built from the default must not overwrite the account's saved choice.
    LaunchedEffect(Unit) { container.activeCourse.course.collect { if (it != vm.state.value.course) vm.selectCourse(it) } }
    val progress by vm.progress.collectAsState()
    val dueCount by vm.dueCount.collectAsState()
    val ds = LocalAlphonsoTokens.current
    val units = state.unitsForLevel(container.content)
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) { vm.refresh() }

    // The team mission: this view-model outlives the screen (kept with the Learn back-stack entry), so refresh on every
    // entry. Null (no team, loading, or a failed refresh) means no card, and no list item either.
    val missionVm: TeamMissionViewModel = viewModel(key = "team-mission-learn") { TeamMissionViewModel(container.progressClient) }
    val teamMission by missionVm.state.collectAsState()
    LaunchedEffect(missionVm) { missionVm.refresh() }

    // Round 6.1 Learn fold: finished units fold to one row per run, the current unit is open, later units show a name.
    val courseUnits = remember(state.course, container.content) { container.content.bundle(state.course).units.map(::foldUnitOf) }
    val completedSet = state.completedLessonIds
    val currentUnit = LearnFold.currentUnitOf(courseUnits, completedSet)
    var showAllUnits by rememberSaveable { mutableStateOf(false) }
    val limited = LearnFold.limitAhead(LearnFold.foldLearn(units.map(::foldUnitOf), completedSet), showAllUnits)
    val rows = limited.rows
    var expandedKeys by rememberSaveable { mutableStateOf("") }
    fun isExpanded(key: String) = expandedKeys.split(",").contains(key)
    fun toggle(key: String) { expandedKeys = (expandedKeys.split(",").filter { it.isNotEmpty() && it != key } + if (isExpanded(key)) emptyList() else listOf(key)).joinToString(",") }
    val scope = rememberCoroutineScope()
    // Items before the unit rows: header, goal, review, levels, jump button, plus the ones that come and go.
    val fixedItems = 5 + (if (currentUnit != null) 1 else 0) + (if (teamMission != null) 1 else 0) + (if (state.challenges.isNotEmpty()) 1 else 0) + (if (state.placementTaken == false) 1 else 0)
    val currentRowIndex = rows.indexOfFirst { it is FoldRow.UnitRow && it.current }.let { if (it < 0) -1 else fixedItems + it }
    var scrolled by remember { mutableStateOf(false) }
    LaunchedEffect(currentRowIndex) {
        if (scrolled || currentRowIndex < 0) return@LaunchedEffect
        scrolled = true
        listState.animateScrollToItem(currentRowIndex)
    }

    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            CoursePicker(state.course, onSelect = { picked -> container.activeCourse.set(picked); vm.selectCourse(picked) })
            Spacer(Modifier.weight(1f))
            Text("Learn with Alphonso", style = MaterialTheme.typography.titleMedium, color = ds.ink)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onOpenSettings) { Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = ds.actionText) }
        }
        ToastBanner(state.notice, onClear = vm::clearNotice)
        SyncNotices(container, vm)
        LazyColumn(state = listState, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Stable keys on every item: the header, challenges and placement card come and go as data loads,
            // and unkeyed items shifting index is the one way a lazy list can show a row twice.
            currentUnit?.let { place ->
                container.content.bundle(state.course).units.firstOrNull { it.id == place.unitId }?.let { u ->
                    item(key = "current-unit") { CurrentUnitCard(u, place, onContinue = { onOpenLesson(state.course, place.lessonId) }) }
                }
            }
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
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AlphonsoSectionHeader("This week's challenges")
                        state.challenges.forEach { c ->
                            val done = c.progress >= c.threshold
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(c.title, style = MaterialTheme.typography.bodyLarge, color = if (c.completed) ds.inkSoft else ds.ink)
                                AlphonsoProgressBar(minOf(c.progress, c.threshold).toFloat() / maxOf(c.threshold, 1))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("${minOf(c.progress, c.threshold)}/${c.threshold}", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft, modifier = Modifier.weight(1f))
                                    if (done && !c.completed && c.templateId !in state.claimedChallengeIds) TextButton(onClick = { vm.claimChallenge(c) }) { Text("Claim", color = ds.actionText, fontWeight = FontWeight.SemiBold) }
                                    else if (c.completed || c.templateId in state.claimedChallengeIds) Text("Claimed", style = MaterialTheme.typography.labelMedium, color = ds.actionText)
                                }
                            }
                        }
                    }
                }
            }
            item(key = "review") {
                val subtitle = when (dueCount) { 0 -> "Nothing due right now"; 1 -> "1 item ready to review"; else -> "$dueCount items ready to review" }
                AlphonsoRowCard("Review", subtitle, accent = if (dueCount > 0) ds.flame else ds.line, modifier = Modifier.clickable { onOpenReview(state.course) })
            }
            if (state.placementTaken == false) {
                item(key = "placement") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card).padding(12.dp)) {
                        Text("Find your level", style = MaterialTheme.typography.titleSmall, color = ds.ink)
                        Text("A five-minute placement test picks the right band for you. No hearts lost.", style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
                        TextButton(onClick = { onOpenPlacement(state.course) }) { Text("Take the placement test", color = ds.actionText, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
            item(key = "levels") { LevelBandPicker(state.selectedLevel, onSelect = vm::selectLevel) }
            item(key = "jump") {
                if (currentRowIndex >= 0) {
                    TextButton(
                        onClick = { scope.launch { listState.animateScrollToItem(currentRowIndex) } },
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text("Jump to current", color = ds.actionText, fontWeight = FontWeight.SemiBold) }
                }
            }
            rows.forEach { row ->
                when (row) {
                    is FoldRow.DoneRun -> {
                        val open = isExpanded(row.key)
                        item(key = row.key) {
                            FoldHeaderRow("${LearnFold.runLabel(row)} \u00B7 ${row.done} / ${row.total}", open, "Finished", onClick = { toggle(row.key) })
                        }
                        if (open) units.filter { it.id in row.unitIds }.forEach { unit -> unitItems(unit, state.completedLessonIds, state.course, onOpenLesson) }
                    }
                    is FoldRow.UnitRow -> {
                        val unit = units.first { it.id == row.unitId }
                        val open = row.current || isExpanded(row.key)
                        if (row.current) {
                            unitItems(unit, state.completedLessonIds, state.course, onOpenLesson)
                        } else {
                            item(key = row.key) { FoldHeaderRow("${unit.eyebrow} \u00B7 ${unit.title}", open, "Ahead", onClick = { toggle(row.key) }) }
                            if (open) unit.lessons.forEachIndexed { i, l -> lessonItem(l, i, state.completedLessonIds, state.course, onOpenLesson) }
                        }
                    }
                }
            }
            if (limited.hidden > 0) {
                item(key = "show-all-units") {
                    TextButton(onClick = { showAllUnits = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text("Show all units in ${state.selectedLevel} (${limited.hidden} more)", color = ds.ink, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

private fun foldUnitOf(u: com.obsidianmedia.learnwithalphonso.core.content.Unit) = FoldUnit(u.id, u.eyebrow, u.title, u.lessons.map { it.id })

private fun androidx.compose.foundation.lazy.LazyListScope.unitItems(
    unit: com.obsidianmedia.learnwithalphonso.core.content.Unit, completed: Set<String>, course: Course, onOpenLesson: (Course, String) -> kotlin.Unit,
) {
    item(key = "unit-${unit.id}") { AlphonsoSectionHeader("${unit.eyebrow} \u00B7 ${unit.title}", Modifier.padding(top = 8.dp)) }
    unit.lessons.forEachIndexed { index, lesson -> lessonItem(lesson, index, completed, course, onOpenLesson) }
}

private fun androidx.compose.foundation.lazy.LazyListScope.lessonItem(
    lesson: com.obsidianmedia.learnwithalphonso.core.content.Lesson, index: Int, completed: Set<String>, course: Course, onOpenLesson: (Course, String) -> kotlin.Unit,
) {
    item(key = lesson.id) {
        val ds = LocalAlphonsoTokens.current
        val accent = when {
            lesson.id in completed -> ds.line
            index == 0 -> ds.flame
            else -> ds.actionText
        }
        AlphonsoRowCard(lesson.title, lesson.subtitle, accent = accent, modifier = Modifier.clickable { onOpenLesson(course, lesson.id) })
    }
}

/** A folded run or a later unit: one slim row; tap to open in place. 48dp minimum, wraps rather than clips at large font. */
@Composable
private fun FoldHeaderRow(label: String, open: Boolean, kind: String, onClick: () -> kotlin.Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = "$kind, $label"
                stateDescription = if (open) "Expanded" else "Collapsed"
            }
            .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Text(label, style = FootnoteType, color = ds.inkSoft, modifier = Modifier.weight(1f))
        Text(if (open) "\u25BE" else "\u25B8", style = CaptionType, color = ds.inkSoft)
    }
}

/** The current unit pinned on top as a room-art card: YOU ARE HERE, the unit's place, its title, and a gold Continue. */
@Composable
private fun CurrentUnitCard(unit: com.obsidianmedia.learnwithalphonso.core.content.Unit, place: CurrentUnit, onContinue: () -> kotlin.Unit) {
    val ds = LocalAlphonsoTokens.current
    val art = LearnFold.roomArtFor(place.index - 1)
    val room = rememberFirstRunAsset("scenes/$art.webp") ?: rememberFirstRunAsset("scenes/${LessonStage.FALLBACK_ROOM}.webp")
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    Box(Modifier.fillMaxWidth().clip(shape).background(ds.hero).semantics(mergeDescendants = true) {
        contentDescription = "You are here, unit ${place.index} of ${place.count}, ${unit.title}, ${LearnFold.roomName(art)}"
    }) {
        room?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, ds.hero.copy(alpha = 0.92f)))))
        Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s4), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Spacer(Modifier.height(AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s6))
            Text("YOU ARE HERE \u00B7 UNIT ${place.index} OF ${place.count}", style = OverlineType, color = ds.onHeroKick)
            Text(unit.title, style = TitleType, color = ds.onHero)
            Box(
                Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.xp)
                    .clickable(role = Role.Button, onClickLabel = "Continue ${unit.title}", onClick = onContinue)
                    .padding(horizontal = AlphonsoTokens.Space.s6, vertical = AlphonsoTokens.Space.s3),
                contentAlignment = Alignment.Center,
            ) { Text("Continue", style = HeadlineType, color = ds.ink) }
        }
    }
}

@Composable
fun CoursePicker(course: Course, onSelect: (Course) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val ds = LocalAlphonsoTokens.current
    TextButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Course: ${course.displayName}" }) {
        Text("${course.flag} ${course.code.uppercase()}", color = ds.actionText, fontWeight = FontWeight.SemiBold)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
        Course.entries.forEach { c ->
            DropdownMenuItem(text = { Text("${c.flag} ${c.displayName}") }, onClick = { open = false; onSelect(c) })
        }
    }
}

@Composable
private fun LevelBandPicker(selected: String, onSelect: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LEVELS.forEach { (id, name) ->
            val isSelected = id == selected
            Column(
                Modifier
                    .clip(CircleShape)
                    .background(if (isSelected) ds.action else ds.card)
                    .border(if (isSelected) 0.dp else 1.dp, ds.line, CircleShape)
                    .clickable { onSelect(id) }
                    .padding(horizontal = 14.dp, vertical = 6.dp)
                    .semantics { contentDescription = "$id $name${if (isSelected) ", selected" else ""}" },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(id, style = FootnoteType, fontWeight = FontWeight.SemiBold, color = if (isSelected) ds.onAction else ds.ink)
                Text(name, style = CaptionType, color = if (isSelected) ds.onAction else ds.ink)
            }
        }
    }
}

/** Port of StatusHeaderView.swift: streak, hearts, XP, league, and the mascot greeting. Nothing when no cache yet. */
@Composable
fun StatusHeader(progress: LessonCompletionProgress?, onBuyStreakFreeze: (() -> Unit)? = null) {
    if (progress == null) return
    val ds = LocalAlphonsoTokens.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            StatPill("🔥", "${progress.streak}", "Streak: ${progress.streak} day${if (progress.streak == 1) "" else "s"}")
            StatPill("❤️", "${progress.hearts}", "Hearts: ${progress.hearts}")
            StatPill("⭐", "${progress.xp}", "XP: ${progress.xp}")
            Spacer(Modifier.weight(1f))
            Text(
                progress.leagueTier.replaceFirstChar { it.uppercase() },
                color = ds.onHero,
                style = CaptionType,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(LeagueTierPalette.color(progress.leagueTier)).padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
        AlphonsoMascotBanner(if (progress.streak > 0) "Nice ${progress.streak}-day streak! Ready for today's lesson?" else "Ready for today's lesson?")
        if (onBuyStreakFreeze != null) {
            // A card like the other Learn rows (parchment, hairline edge), so the words never sit straight on the garden photo.
            // Ink on parchment, and the buy button is the secondary button: moss text alone is under 4.5:1 on Studio Ink's parchment.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card).border(1.dp, ds.line, RoundedCornerShape(14.dp)).padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            ) {
                Text("\u2744\uFE0F ${progress.streakFreezes} streak freeze${if (progress.streakFreezes == 1) "" else "s"}", style = MaterialTheme.typography.labelLarge, color = ds.ink, modifier = Modifier.weight(1f))
                AlphonsoSecondaryButton("Buy freeze ($STREAK_FREEZE_XP_COST XP)", onClick = onBuyStreakFreeze, fullWidth = false)
            }
        }
    }
}

@Composable
private fun StatPill(icon: String, value: String, label: String) {
    val ds = LocalAlphonsoTokens.current
    Row(
        Modifier.clip(CircleShape).background(ds.card).border(1.dp, ds.line, CircleShape).padding(horizontal = 10.dp, vertical = 6.dp).semantics(mergeDescendants = true) { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(icon, style = FootnoteType)
        Text(value, style = FootnoteType, fontWeight = FontWeight.Bold, color = ds.ink)
    }
}
