package com.obsidianmedia.learnwithalphonso.ui.learn

import com.obsidianmedia.learnwithalphonso.core.logic.StreakDisplay
import androidx.compose.ui.semantics.clearAndSetSemantics
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.mutableLongStateOf
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
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionCard
import com.obsidianmedia.learnwithalphonso.ui.league.TeamMissionViewModel
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
import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.LearnRail
import com.obsidianmedia.learnwithalphonso.core.path.PathGoalCard
import com.obsidianmedia.learnwithalphonso.ui.path.PathUi
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

    val hourglass = rememberFirstRunAsset("poses/alphonso-refill-hourglass.webp")
    PendingSyncNotice.message(lessons, reviewAnswers, isConnected)?.let { message ->
        DsCard(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s1), padding = AlphonsoTokens.Space.s3) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                hourglass?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s2).clearAndSetSemantics { }) }
                Text(message, style = FootnoteType, color = ds.inkSoft, modifier = Modifier.weight(1f))
                DsCompactButton(
                    if (syncing) PendingSyncNotice.SYNCING_TITLE else PendingSyncNotice.SYNC_NOW_TITLE, { container.syncCoordinator.syncNow() },
                    primary = true, enabled = !syncing,
                )
            }
        }
    }
    val visible = DeadLetterNotice.visible(dead.map { it.identity }, dismissed)
    DeadLetterNotice.message(visible.size)?.let { message ->
        DsCard(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s1), padding = AlphonsoTokens.Space.s3, fill = ds.wrongTint) {
            Text(message, style = FootnoteType, color = ds.wrongInk)
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                DsCompactButton(DeadLetterNotice.CONTACT_TITLE, {
                    val reasons = dead.filter { it.identity in visible }.map { it.reason }
                    // No mail app installed: the notice stays, and there is nothing to crash on.
                    runCatching { uriHandler.openUri(DeadLetterNotice.supportMailUri(visible, reasons, BuildConfig.VERSION_NAME)) }
                }, primary = true)
                DsCompactButton(DeadLetterNotice.DISMISS_TITLE, { dismissals.dismiss(visible); dismissed = dismissals.dismissed })
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
    onOpenPath: () -> Unit = {},
    onBuildPath: () -> Unit = {},
    onOpenPathRef: (com.obsidianmedia.learnwithalphonso.core.path.PathItemRef) -> Unit = {},
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
    // In LEARNING order (band by band), like the web's foldUnits: the curriculum interleaves bands, and the server opens
    // lessons only in this order, so the map's "Continue" must not point at the raw array's first undone lesson.
    val courseUnits = remember(state.course, container.content) {
        LearnFold.inLearningOrder(container.content.bundle(state.course).units) { it.level }.map(::foldUnitOf)
    }
    val completedSet = state.completedLessonIds
    val currentUnit = LearnFold.currentUnitOf(courseUnits, completedSet)
    var showAllUnits by rememberSaveable { mutableStateOf(false) }
    val limited = LearnFold.limitAhead(LearnFold.foldLearn(units.map(::foldUnitOf), completedSet), showAllUnits)
    val rows = limited.rows
    var expandedKeys by rememberSaveable { mutableStateOf("") }
    fun isExpanded(key: String) = expandedKeys.split(",").contains(key)
    fun toggle(key: String) { expandedKeys = (expandedKeys.split(",").filter { it.isNotEmpty() && it != key } + if (isExpanded(key)) emptyList() else listOf(key)).joinToString(",") }
    val context = androidx.compose.ui.platform.LocalContext.current
    // The climbing map: one level's climb from the shared model. No timing file, no map (nothing honest to say about minutes).
    val timing = remember { runCatching { com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming.fromJson(context.assets.open("content/lesson-timing.json").bufferedReader().use { it.readText() }) }.getOrNull() }
    val climbUnits = remember(units, container.content) { climbUnitsOf(units, container.content.vocabImages) }
    val climb = remember(climbUnits, completedSet, timing) { timing?.let { com.obsidianmedia.learnwithalphonso.core.logic.LearnMap.of(climbUnits, completedSet, it) } }
    val reduceMotion = com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion()
    val scope = rememberCoroutineScope()
    // The one path view-model for this course: the rail card reads its goal, and the card opened from the rail shows it in full.
    val pathVm = com.obsidianmedia.learnwithalphonso.ui.path.rememberPathViewModel(container, state.course)
    val pathUi by pathVm.ui.collectAsState()
    // Which rail card is open in place below the rail: "", "path", "team" or "weekly". The streak pill opens the freeze shop.
    var forYouOpen by rememberSaveable { mutableStateOf("") }
    var showFreezeShop by rememberSaveable { mutableStateOf(false) }
    fun toggleForYou(which: String) { forYouOpen = if (forYouOpen == which) "" else which }
    // Items before the unit rows: status, rail, units header, jump button, plus the ones that come and go (the climbing map is one).
    val fixedItems = learnFixedItems(hasClimb = climb != null, forYouDetailOpen = forYouOpen.isNotEmpty(), showsPlacement = state.placementTaken == false)
    val currentRowIndex = rows.indexOfFirst { it is FoldRow.UnitRow && it.current }.let { if (it < 0) -1 else fixedItems + it }
    // No scroll on first show: the status row and the climbing map are the top of the screen. "Jump to current" is the way down.
    Column(Modifier.fillMaxSize().background(ds.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            CoursePicker(state.course, onSelect = { picked -> container.activeCourse.set(picked); vm.selectCourse(picked) })
            Spacer(Modifier.weight(1f))
            Text("Learn with Alphonso", style = HeadlineType, color = ds.ink)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onOpenSettings) { Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = ds.actionText) }
        }
        ToastBanner(state.notice, onClear = vm::clearNotice)
        SyncNotices(container, vm)
        LazyColumn(state = listState, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Stable keys on every item: the header, challenges and placement card come and go as data loads,
            // and unkeyed items shifting index is the one way a lazy list can show a row twice.
            // The slim status row (streak with its protected mark, hearts, XP, league). The streak pill opens the freeze shop.
            item(key = "header") { StatusHeader(progress, showFreezeShop = showFreezeShop, onToggleFreezeShop = { showFreezeShop = !showFreezeShop }, onBuyStreakFreeze = vm::buyStreakFreeze) }
            // The climbing map replaces the old hero: this level's unit as a climb, with the start sheet for the next lesson.
            // "Unit N of M" counts the units of the level on screen. Continue lesson only when the next lesson is the course-wide one.
            climb?.let { c ->
                item(key = "learn-climb") {
                    LearnClimbMap(c, greeting(progress), continueLessonId = currentUnit?.lessonId, reduceMotion = reduceMotion, onOpenLesson = { id -> onOpenLesson(state.course, id) })
                }
            }
            item(key = "for-you") {
                val hasNoGoal = pathUi is PathUi.None
                val pathValue = when (val u = pathUi) {
                    PathUi.Loading -> "Loading"
                    is PathUi.Failed -> "Couldn't load"
                    PathUi.None -> LearnRail.PATH_UNSET
                    is PathUi.Ready -> PathGoalCard.lines(u.path).headline
                }
                // A finished quest that is not yet claimed is a reward waiting to be claimed (challenges pay themselves).
                val claimReady = state.quests.any { it.claimable }
                val cards = buildList {
                    add(RailItem("review", R.drawable.ds_book, "Review", LearnRail.reviewValue(dueCount), LearnRail.reviewSpoken(dueCount), showsDot = dueCount > 0, expanded = null) { onOpenReview(state.course) })
                    add(RailItem("path", R.drawable.ds_target, if (hasNoGoal) "Build my path" else "My path", pathValue, "${if (hasNoGoal) "Build my path" else "My path"}, $pathValue", expanded = if (hasNoGoal) null else forYouOpen == "path") {
                        // No goal yet: straight to the planner (what the goal card did). With a goal: open its detail below.
                        if (hasNoGoal) onBuildPath() else toggleForYou("path")
                    })
                    teamMission?.let { m -> LearnRail.teamValue(m).let { v -> add(RailItem("team", R.drawable.ds_friends, "Team mission", v, "Team mission, $v", expanded = forYouOpen == "team") { toggleForYou("team") }) } }
                    if (state.challenges.isNotEmpty() || state.quests.isNotEmpty()) LearnRail.weeklyValue(state.challenges, state.quests.size).let { v -> add(RailItem("weekly", R.drawable.ds_star_solid, "Weekly", v, "Weekly challenges, $v${if (claimReady) ", reward ready to claim" else ""}", showsDot = claimReady, expanded = forYouOpen == "weekly") { toggleForYou("weekly") }) }
                }
                ForYouRail(cards)
            }
            // The opened card's full detail, in place under the rail.
            if (forYouOpen.isNotEmpty()) {
                item(key = "for-you-detail") {
                    when (forYouOpen) {
                        "path" -> com.obsidianmedia.learnwithalphonso.ui.path.PathCard(pathVm, onOpenRoad = onOpenPath, onBuild = onBuildPath, onOpenRef = onOpenPathRef)
                        "team" -> teamMission?.let { TeamMissionCard(it) }
                        "weekly" -> Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                            if (state.challenges.isNotEmpty()) ChallengesCard(state.challenges)
                            if (state.quests.isNotEmpty()) QuestsCard(state.quests, onClaim = vm::claimQuest)
                        }
                    }
                }
            }
            if (state.placementTaken == false) {
                item(key = "placement") {
                    DsCard(spacing = AlphonsoTokens.Space.s2) {
                        Text("Find your level", style = HeadlineType, color = ds.ink)
                        Text("A five-minute placement test picks the right band for you. No hearts lost.", style = FootnoteType, color = ds.inkSoft)
                        DsCompactButton("Take the placement test", { onOpenPlacement(state.course) }, primary = true)
                    }
                }
            }
            item(key = "levels") { UnitsHeader(state.selectedLevel, units, state.completedLessonIds, onSelect = vm::selectLevel) }
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
    item(key = "unit-${unit.id}") { DsOverline("${unit.eyebrow} \u00B7 ${unit.title}", Modifier.padding(top = 8.dp)) }
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

private fun greeting(progress: LessonCompletionProgress?): String {
    val streak = progress?.let { StreakDisplay.shown(it, System.currentTimeMillis()).streak } ?: 0
    return if (streak > 0) "Nice $streak-day streak! Ready for today's lesson?" else "Ready for today's lesson?"
}

/** One card of the For you rail. [expanded] is null for a card that opens a screen, true or false for one that opens in place. */
internal class RailItem(
    val id: String,
    val icon: Int,
    val title: String,
    val value: String,
    val spoken: String,
    val showsDot: Boolean = false,
    val expanded: Boolean?,
    val onClick: () -> kotlin.Unit,
)

/** Learn's "For you" rail: Review, the goal path, the team mission and the weekly challenges as one row of small cards. */
@Composable
internal fun ForYouRail(items: List<RailItem>) {
    val ds = LocalAlphonsoTokens.current
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Text("For you", style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            items.forEach { item ->
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
                Column(
                    Modifier.width((124 * LocalDensity.current.fontScale.coerceIn(1f, 2f)).dp).heightIn(min = 48.dp).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
                        .clickable(role = Role.Button, onClick = item.onClick)
                        .semantics(mergeDescendants = true) {
                            contentDescription = item.spoken
                            item.expanded?.let { stateDescription = if (it) "Expanded" else "Collapsed" }
                        }
                        .padding(AlphonsoTokens.Space.s3),
                    verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Icon(painterResource(item.icon), null, tint = ds.actionText, modifier = Modifier.size(AlphonsoTokens.Space.s8))
                        if (item.showsDot) Box(Modifier.size(8.dp).clip(CircleShape).background(ds.heart))
                    }
                    Text(item.title, style = FootnoteType, fontWeight = FontWeight.Bold, color = ds.ink)
                    Text(item.value, style = CaptionType, color = ds.inkSoft)
                }
            }
        }
    }
}

/** This week's challenges in full (what the rail's Weekly card opens): progress bars. They pay themselves, so no claim. */
@Composable
private fun ChallengesCard(challenges: List<com.obsidianmedia.learnwithalphonso.core.net.WeeklyChallenge>) {
    val ds = LocalAlphonsoTokens.current
    DsCard(spacing = AlphonsoTokens.Space.s2) {
        DsOverline("This week's challenges")
        challenges.forEach { c ->
            Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                Text(c.title, style = BodyType, color = if (c.completed) ds.inkSoft else ds.ink)
                DsProgressBar(minOf(c.progress, c.threshold).toFloat() / maxOf(c.threshold, 1))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${minOf(c.progress, c.threshold)}/${c.threshold}", style = CaptionType, color = ds.inkSoft, modifier = Modifier.weight(1f))
                    if (c.completed) Text("Done", style = FootnoteType, color = ds.actionText)
                }
            }
        }
    }
}

/** This week's quests (weekly_quests): progress bars and a Claim button on a finished one; same look as the challenges. */
@Composable
private fun QuestsCard(quests: List<com.obsidianmedia.learnwithalphonso.core.net.WeeklyQuest>, onClaim: (com.obsidianmedia.learnwithalphonso.core.net.WeeklyQuest) -> kotlin.Unit) {
    val ds = LocalAlphonsoTokens.current
    DsCard(spacing = AlphonsoTokens.Space.s2) {
        DsOverline("This week's quests")
        quests.forEach { q ->
            Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                Text("${q.title} (+${q.xpReward} XP)", style = BodyType, color = if (q.claimed) ds.inkSoft else ds.ink)
                DsProgressBar(minOf(q.progress, q.target).toFloat() / maxOf(q.target, 1))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${minOf(q.progress, q.target)}/${q.target}", style = CaptionType, color = ds.inkSoft, modifier = Modifier.weight(1f))
                    if (q.claimable) DsCompactButton("Claim", { onClaim(q) }, primary = true)
                    else if (q.claimed) Text("Claimed", style = FootnoteType, color = ds.actionText)
                }
            }
        }
    }
}

@Composable
fun CoursePicker(course: Course, onSelect: (Course) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val ds = LocalAlphonsoTokens.current
    TextButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Course: ${course.displayName}" }) {
        Text("${course.flag} ${course.code.uppercase()}", style = FootnoteType, color = ds.actionText, fontWeight = FontWeight.SemiBold)
    }
    if (open) {
        DsDialog({ open = false }) {
            DsDialogTitle("Course")
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                Course.entries.forEach { c ->
                    DsChip("${c.flag} ${c.displayName}", c == course, onClick = { open = false; onSelect(c) }, modifier = Modifier.fillMaxWidth())
                }
            }
            DsCompactButton("Cancel", { open = false })
        }
    }
}

/**
 * The units header: the band's name and how far through it the learner is, with the level picker as a compact menu
 * (the web's select beside the same heading). One menu instead of five capsules.
 */
@Composable
private fun UnitsHeader(selected: String, units: List<com.obsidianmedia.learnwithalphonso.core.content.Unit>, completed: Set<String>, onSelect: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val name = LEVELS.firstOrNull { it.first == selected }?.second ?: ""
    val lessons = units.flatMap { it.lessons }
    val percent = if (lessons.isEmpty()) 0 else Math.round(100f * lessons.count { it.id in completed } / lessons.size)
    var open by remember { mutableStateOf(false) }
    // At large font scales the menu drops under the title (as on iOS) so neither is cut off.
    val stacked = LocalDensity.current.fontScale >= 1.3f
    val title: @Composable (Modifier) -> kotlin.Unit = { m ->
        Column(m.semantics(mergeDescendants = true) { heading() }) {
            Text("$selected · $name", style = HeadlineType, color = ds.ink)
            Text("$percent% complete", style = CaptionType, color = ds.inkSoft)
        }
    }
    val menu: @Composable () -> kotlin.Unit = {
        Box {
            val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
            Row(
                Modifier.heightIn(min = 48.dp).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
                    .clickable(role = Role.Button, onClickLabel = "Change level", onClick = { open = true })
                    .semantics(mergeDescendants = true) { contentDescription = "Level: $selected, $name" }
                    .padding(horizontal = AlphonsoTokens.Space.s3),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
            ) {
                Text(selected, style = FootnoteType, fontWeight = FontWeight.Bold, color = ds.ink)
                Text("\u25BE", style = CaptionType, color = ds.inkSoft)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                LEVELS.forEach { (id, levelName) ->
                    DropdownMenuItem(
                        text = { Text("$id \u00B7 $levelName", color = ds.ink) },
                        onClick = { open = false; onSelect(id) },
                        modifier = Modifier.semantics { contentDescription = "$id $levelName${if (id == selected) ", selected" else ""}" },
                    )
                }
            }
        }
    }
    if (stacked) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) { title(Modifier); menu() }
    } else {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) { title(Modifier.weight(1f)); menu() }
    }
}

/**
 * The slim status row (StatusHeaderView.swift): streak, hearts, XP and league as small pills in one line. Android has no
 * cross-tab top bar, so the stats stay here. The streak pill is also the way to the streak-freeze shop. Nothing when no
 * cache yet.
 */
@Composable
fun StatusHeader(progress: LessonCompletionProgress?, showFreezeShop: Boolean = false, onToggleFreezeShop: (() -> Unit)? = null, onBuyStreakFreeze: (() -> Unit)? = null) {
    if (progress == null) return
    val ds = LocalAlphonsoTokens.current
    // The streak as it reads today (StreakDisplay, the server's own rule): alive only by a freeze reads as protected,
    // and a run the next lesson would restart reads 0 instead of the old number.
    val streak = StreakDisplay.shown(progress, System.currentTimeMillis())
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            // Missed days a streak freeze covers: the snowflake the freeze row uses, as on iOS.
            StatPill(
                "🔥", "${streak.streak}", StreakDisplay.accessibilityLabel(streak), hint = if (streak.state == StreakDisplay.State.PROTECTED) "❄️" else null,
                onClick = onToggleFreezeShop, stateText = if (showFreezeShop) "Streak freezes shown" else "Double tap for streak freezes",
            )
            HeartsPill(progress)
            StatPill("⭐", "${progress.xp}", "XP: ${progress.xp}")
            Spacer(Modifier.weight(1f))
            Text(
                progress.leagueTier.replaceFirstChar { it.uppercase() },
                color = ds.onHero,
                style = CaptionType,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(LeagueTierPalette.color(progress.leagueTier)).padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        if (onBuyStreakFreeze != null && showFreezeShop) {
            // A card like the other Learn rows (parchment, hairline edge), so the words never sit straight on the garden photo.
            // Ink on parchment, and the buy button is the secondary button: moss text alone is under 4.5:1 on Studio Ink's parchment.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card).border(1.dp, ds.line, RoundedCornerShape(14.dp)).padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            ) {
                Text("\u2744\uFE0F ${progress.streakFreezes} streak freeze${if (progress.streakFreezes == 1) "" else "s"}", style = FootnoteType, color = ds.ink, modifier = Modifier.weight(1f))
                DsCompactButton("Buy freeze ($STREAK_FREEZE_XP_COST XP)", onBuyStreakFreeze)
            }
        }
    }
}

@Composable
private fun StatPill(icon: String, value: String, label: String, hint: String? = null, onClick: (() -> Unit)? = null, stateText: String? = null) {
    val ds = LocalAlphonsoTokens.current
    val tap = if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier
    Row(
        Modifier.heightIn(min = if (onClick != null) 48.dp else 0.dp).clip(CircleShape).background(ds.card).border(1.dp, ds.line, CircleShape).then(tap).padding(horizontal = 10.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = label; if (stateText != null) stateDescription = stateText },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(icon, style = FootnoteType)
        Text(value, style = FootnoteType, fontWeight = FontWeight.Bold, color = ds.ink)
        if (hint != null) Text(hint, style = CaptionType, color = ds.inkSoft)
        // A tappable pill says so: the chevron shows (and flips) the streak-freeze shop.
        if (onClick != null) Text(if (stateText != null && stateText.startsWith("Streak freezes shown")) "▴" else "▾", style = CaptionType, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics { })
    }
}

/**
 * The hearts counter. Below the cap it ticks on its own: a heart that has come due appears without a sync (the same
 * rule the server applies), and the wait for the next one shows beside the count.
 */
@Composable
private fun HeartsPill(progress: LessonCompletionProgress) {
    if (progress.hearts >= HeartsEconomy.MAX_HEARTS) {
        StatPill("❤️", "${progress.hearts}", "Hearts: ${progress.hearts}")
        return
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(progress.hearts, progress.heartsRefillAt) {
        while (true) {
            now = System.currentTimeMillis()
            kotlinx.coroutines.delay(1000)
        }
    }
    val shown = HeartsEconomy.resolveHeartsRefill(progress.hearts, progress.heartsRefillAt?.toLong(), now)
    val wait = HeartsEconomy.nextHeartCountdown(shown.hearts, shown.heartsRefillAt, now)
    StatPill(
        "❤️", "${shown.hearts}",
        if (wait != null) "Hearts: ${shown.hearts}, next heart in $wait" else "Hearts: ${shown.hearts}",
        hint = wait?.let { "+1 in $it" },
    )
}

/**
 * How many LazyColumn items sit above the unit rows, so Jump to current scrolls to the right one: the header, the For
 * you rail, the levels menu and the jump row always; the climbing map, the open For-you detail and the placement
 * banner when shown. Keep it in step with the `item(...)` calls before the unit rows in [LearnScreen].
 */
internal fun learnFixedItems(hasClimb: Boolean, forYouDetailOpen: Boolean, showsPlacement: Boolean): Int =
    4 + (if (hasClimb) 1 else 0) + (if (forYouDetailOpen) 1 else 0) + (if (showsPlacement) 1 else 0)
