package com.obsidianmedia.learnwithalphonso.ui.path

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.produceState
import androidx.compose.ui.draw.alpha
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsHeroCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCopy
import com.obsidianmedia.learnwithalphonso.core.path.LearningPath
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathChange
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathError
import com.obsidianmedia.learnwithalphonso.core.path.PathApi
import com.obsidianmedia.learnwithalphonso.core.path.PathGoalCard
import com.obsidianmedia.learnwithalphonso.core.path.PathItem
import com.obsidianmedia.learnwithalphonso.core.path.PathItemRef
import com.obsidianmedia.learnwithalphonso.core.path.PathKind
import com.obsidianmedia.learnwithalphonso.core.path.visibleStreaks
import com.obsidianmedia.learnwithalphonso.core.path.PathMixEntry
import com.obsidianmedia.learnwithalphonso.core.path.PathRestDay
import com.obsidianmedia.learnwithalphonso.core.path.PathStop
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.learn.GoalCard
import com.obsidianmedia.learnwithalphonso.ui.learn.GoalCardViewModel
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The learning path on Android (mock: mocks-r8 Feature 2, layout A "the road", with B's week view and "Why this mix" as
 * secondary screens, plus the Profile "My path" card and per-type tiles). It renders what /api/learning-path returns
 * (decoded and tested in :core, core/path/LearningPath.kt) and does no plan maths: the server's planPath is the single
 * implementation and the web and iOS screens show the same plan. Every colour is a design token. This layer is compiled
 * but NOT run on a device or emulator by the change that added it.
 */
sealed interface PathUi {
    object Loading : PathUi
    object None : PathUi
    data class Ready(val path: LearningPath) : PathUi
    data class Failed(val error: LearningPathError) : PathUi
}

/** One instance per course (screens key it by course code), so a slow answer for a course the learner left is dropped. */
class PathViewModel(private val courseCode: String, private val api: PathApi) : ViewModel() {
    private val _ui = MutableStateFlow<PathUi>(PathUi.Loading)
    val ui: StateFlow<PathUi> = _ui.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()
    private var generation = 0

    /** [quiet] keeps what is on screen while it refreshes (screens reload on every entry; this outlives them). */
    fun reload(quiet: Boolean = false) {
        val mine = ++generation
        if (!quiet || _ui.value !is PathUi.Ready) _ui.value = PathUi.Loading
        viewModelScope.launch {
            val next = try {
                api.fetch(courseCode)?.let { PathUi.Ready(it) } ?: PathUi.None
            } catch (e: LearningPathError) {
                PathUi.Failed(e)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                PathUi.Failed(LearningPathError.Unavailable)
            }
            if (mine == generation) {
                // A refresh that failed must not wipe a path already on screen.
                if (quiet && next is PathUi.Failed && _ui.value is PathUi.Ready) return@launch
                _ui.value = next
            }
        }
    }

    fun apply(change: LearningPathChange) {
        val mine = ++generation
        _busy.value = true
        _actionError.value = null
        viewModelScope.launch {
            try {
                val next = api.change(courseCode, change)
                if (mine == generation) _ui.value = next?.let { PathUi.Ready(it) } ?: PathUi.None
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                if (mine == generation) {
                    _actionError.value =
                        if (e === LearningPathError.Offline) "You are offline. Try again when connected." else "That could not be saved. Try again."
                }
            } finally {
                _busy.value = false
            }
        }
    }
}

@Composable
fun rememberPathViewModel(container: AppContainer, course: Course): PathViewModel {
    val vm: PathViewModel = viewModel(key = "path-" + course.code) { PathViewModel(course.code, container.pathClient) }
    // This view-model outlives the screen, so reload on every entry: after a lesson the numbers must be fresh.
    LaunchedEffect(vm) { vm.reload(quiet = true) }
    return vm
}

// ---------------------------------------------------------------- pieces

@Composable
private fun kindColor(kind: PathKind): Color {
    val ds = LocalAlphonsoTokens.current
    return when (kind) {
        PathKind.LESSON -> ds.choice
        PathKind.PODCAST -> ds.hero
        PathKind.TALK -> ds.xp
        PathKind.CAMPAIGN -> ds.right
        PathKind.VIDEO -> ds.hero
        PathKind.UNKNOWN -> ds.line
    }
}

private fun kindIcon(kind: PathKind): ImageVector = when (kind) {
    PathKind.LESSON -> Icons.Filled.MenuBook
    PathKind.PODCAST -> Icons.Filled.Headphones
    PathKind.TALK -> Icons.Filled.Mic
    PathKind.VIDEO -> Icons.Filled.PlayArrow
    PathKind.CAMPAIGN, PathKind.UNKNOWN -> Icons.Filled.Star
}

@Composable
fun PathTypeBadge(kind: PathKind, small: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val glyph = when (kind) {
        PathKind.TALK -> ds.ink
        PathKind.CAMPAIGN -> ds.onRight
        else -> ds.card
    }
    Box(
        Modifier.size(if (small) 28.dp else 40.dp).clip(RoundedCornerShape(if (small) 9.dp else 13.dp)).background(kindColor(kind)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(kindIcon(kind), contentDescription = null, tint = glyph, modifier = Modifier.size(if (small) 15.dp else 21.dp))
    }
}

@Composable
private fun PathBar(fraction: Float, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    Box(modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(ds.onHeroSoft.copy(alpha = 0.3f))) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(8.dp).clip(CircleShape).background(ds.xp))
    }
}

@Composable
fun PathItemRow(item: PathItem, onClick: (() -> Unit)? = null) {
    val ds = LocalAlphonsoTokens.current
    val done = item.state == "done"
    val tone = when {
        done -> ds.rightTint
        item.state == "next" -> ds.choiceTint
        else -> ds.card
    }
    val spoken = "${item.kind.noun}: ${item.title}, ${item.minutes} minutes" +
        (if (done) ", done" else if (item.state == "next") ", next" else "")
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(tone)
            .let { if (onClick != null && !done) it.clickable(role = Role.Button, onClick = onClick) else it }
            .defaultMinSize(minHeight = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PathTypeBadge(item.kind)
        Column(Modifier.weight(1f)) {
            Text(item.title, style = MaterialTheme.typography.titleSmall, color = ds.ink, maxLines = 1)
            Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft, maxLines = 1)
        }
        Text((if (done) "✓ " else "") + "${item.minutes} min", style = MaterialTheme.typography.labelMedium, color = if (done) ds.rightInk else ds.inkSoft)
    }
}

@Composable
fun PathMixBar(mix: List<PathMixEntry>, onHero: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val shown = mix.filter { it.minutes > 0 }
    val total = maxOf(shown.sumOf { it.minutes }, 1)
    val spoken = "Weekly mix: " + shown.joinToString(", ") { "${it.kind.label} ${it.minutes} minutes" }
    Column(Modifier.clearAndSetSemantics { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(8.dp)), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            shown.forEach { Box(Modifier.weight(it.minutes.toFloat() / total).height(14.dp).background(kindColor(it.kind))) }
        }
        Text(shown.joinToString(" · ") { "${it.kind.label} ${it.minutes} min" }, style = MaterialTheme.typography.labelSmall, color = if (onHero) ds.onHeroSoft else ds.inkSoft)
    }
}

@Composable
private fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ds.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { content() }
}

// ---------------------------------------------------------------- Learn: the path card with today's list (A1)

/**
 * The goal at the top of MY PATH: target level and date, lessons a week and whether the learner is on track, or an
 * invitation to set one. It opens the goal planner (Build my path). Every word comes from [PathGoalCard] in `:core`,
 * which reads the server's numbers; nothing is typed in here.
 */
@Composable
private fun GoalCard(path: LearningPath?, onOpenPlanner: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val card = PathGoalCard.lines(path)
    val shape = RoundedCornerShape(22.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(ds.card)
            .border(1.dp, ds.line, shape)
            .clickable(role = Role.Button, onClickLabel = if (card.hasGoal) "Change your goal" else "Open the planner", onClick = onOpenPlanner)
            .defaultMinSize(minHeight = 48.dp).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(card.kicker.uppercase(), style = MaterialTheme.typography.labelSmall, color = ds.actionText)
            Text(card.headline, style = MaterialTheme.typography.titleLarge, color = ds.ink)
            Text(card.detail, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
        }
        Text("›", style = MaterialTheme.typography.titleLarge, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics { })
    }
}

@Composable
fun PathCard(vm: PathViewModel, onOpenRoad: () -> Unit, onBuild: () -> Unit, onOpenRef: (PathItemRef) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val ui by vm.ui.collectAsState()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (val s = ui) {
            PathUi.Loading -> Card { AlphonsoSectionHeader("My path"); Text("Loading your path…", style = MaterialTheme.typography.bodyMedium, color = ds.inkSoft) }
            is PathUi.Failed -> Card {
                AlphonsoSectionHeader("My path")
                Text(s.error.userMessage, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodyMedium, color = ds.wrongInk)
                AlphonsoSecondaryButton("Try again", onClick = { vm.reload() }, fullWidth = false)
            }
            PathUi.None -> {
                GoalCard(null, onBuild)
                Text("With a goal we build a daily plan of lessons, podcasts, talks and story campaigns.", style = MaterialTheme.typography.bodyMedium, color = ds.inkSoft)
            }
            is PathUi.Ready -> {
                val p = s.path
                GoalCard(p, onBuild)
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(ds.hero)
                        .clickable(role = Role.Button, onClickLabel = "Open my path", onClick = onOpenRoad).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("MY PATH · FINISH ${p.goalLabel.uppercase()}", style = MaterialTheme.typography.labelSmall, color = ds.onHeroKick)
                    Text(p.statusLine, style = MaterialTheme.typography.titleLarge, color = ds.onHero)
                    PathBar(p.lessonFraction)
                    Text("${p.progress.lessonsDone} of ${p.progress.lessonsInScope} lessons", style = MaterialTheme.typography.bodySmall, color = ds.onHeroSoft)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Today · ${p.today.targetMinutes} min", style = MaterialTheme.typography.titleMedium, color = ds.ink, modifier = Modifier.weight(1f))
                    Text(if (p.today.minutesLeft > 0) "${p.today.minutesLeft} min left" else "Done for today", style = MaterialTheme.typography.labelMedium, color = ds.inkSoft)
                }
                p.today.items.forEach { item -> PathItemRow(item, onClick = item.ref?.let { r -> { onOpenRef(r) } }) }
                if (p.today.items.isEmpty()) Text("Nothing planned today. Enjoy the rest.", style = MaterialTheme.typography.bodyMedium, color = ds.inkSoft)
                Text("Minutes are estimates from lesson length, episode length and typical call length.", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
            }
        }
    }
}

// ---------------------------------------------------------------- the road, week, why

enum class PathMode { ROAD, WEEK, WHY }

@Composable
private fun ScreenFrame(title: String, subtitle: String?, onBack: () -> Unit, content: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxWidth().background(ds.surface)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge, color = ds.ink)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
            }
        }
        content()
    }
}

@Composable
fun PathScreen(
    container: AppContainer, mode: PathMode, onBack: () -> Unit,
    onOpenWeek: () -> Unit, onOpenWhy: () -> Unit, onBuild: () -> Unit, onOpenRef: (PathItemRef) -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val course by container.activeCourse.course.collectAsState()
    val vm = rememberPathViewModel(container, course)
    val ui by vm.ui.collectAsState()
    val busy by vm.busy.collectAsState()
    val actionError by vm.actionError.collectAsState()
    val scope = rememberCoroutineScope()
    val path = (ui as? PathUi.Ready)?.path
    val title = when (mode) {
        PathMode.ROAD -> path?.let { "My path to ${it.progress.targetLevel}" } ?: "My path"
        PathMode.WEEK -> "My week"
        PathMode.WHY -> "Why this mix?"
    }
    ScreenFrame(title, if (mode == PathMode.ROAD && path != null) "${path.dailyMinutes} min a day · by ${GoalCopy.formatDate(path.progress.targetDate)}" else null, onBack) {
        when (val s = ui) {
            PathUi.Loading -> Text("Loading your path…", Modifier.padding(16.dp), color = ds.inkSoft)
            is PathUi.Failed -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(s.error.userMessage, color = ds.wrongInk)
                AlphonsoSecondaryButton("Try again", onClick = { vm.reload() }, fullWidth = false)
            }
            PathUi.None -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("You have no path yet.", color = ds.inkSoft)
                AlphonsoPrimaryButton("Build my path", onClick = onBuild, fullWidth = false)
            }
            is PathUi.Ready -> LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (mode) {
                    PathMode.ROAD -> roadItems(s.path, vm, busy, actionError, scope, container, course, onOpenWeek, onOpenWhy, onBuild, onOpenRef)
                    PathMode.WEEK -> weekItems(s.path, onOpenWhy)
                    PathMode.WHY -> whyItems(s.path)
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.roadItems(
    p: LearningPath, vm: PathViewModel, busy: Boolean, actionError: String?, scope: kotlinx.coroutines.CoroutineScope,
    container: AppContainer, course: Course,
    onOpenWeek: () -> Unit, onOpenWhy: () -> Unit, onBuild: () -> Unit, onOpenRef: (PathItemRef) -> Unit,
) {
    if (p.trimmed) item(key = "trim") {
        Card {
            val ds = LocalAlphonsoTokens.current
            Text("Lessons first until ${p.trimUntil?.let { GoalCopy.formatDate(it) } ?: "you resume"}.", color = ds.ink)
            AlphonsoSecondaryButton("Resume my mix", onClick = { vm.apply(LearningPathChange.Resume) }, enabled = !busy, fullWidth = false)
        }
    }
    if (p.status == "behind" && p.recovery.isNotEmpty()) item(key = "recovery") {
        val ds = LocalAlphonsoTokens.current
        var picked by remember { mutableStateOf<String?>(null) }
        val chosenId = picked ?: p.recovery.firstOrNull { it.suggested }?.id
        Card {
            Text(p.statusLine, style = MaterialTheme.typography.titleMedium, color = ds.ink)
            Text(p.statusDetail, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
            p.recovery.forEach { o ->
                Row(
                    Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp)
                        .clickable(role = Role.RadioButton) { picked = o.id }
                        .semantics { selected = o.id == chosenId },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = o.id == chosenId, onClick = null)
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(o.title + if (o.suggested) " (suggested)" else "", style = MaterialTheme.typography.titleSmall, color = ds.ink)
                        Text(o.detail, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
                    }
                }
            }
            p.recovery.firstOrNull { it.id == chosenId }?.mix?.let { PathMixBar(it) }
            actionError?.let { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = ds.wrongInk) }
            AlphonsoPrimaryButton("Update my path", enabled = !busy, onClick = {
                val o = p.recovery.firstOrNull { it.id == chosenId } ?: return@AlphonsoPrimaryButton
                when (o.id) {
                    "lessons_first" -> vm.apply(LearningPathChange.LessonsFirst)
                    "add_minutes" -> o.dailyMinutes?.let { vm.apply(LearningPathChange.SetDailyMinutes(it)) }
                    "move_date" -> o.date?.let { date ->
                        // The date is the goal's own: saved through the same route the goal card uses.
                        scope.launch {
                            runCatching { container.goalClient.save(course.code, p.progress.targetLevel, date) }
                            vm.reload()
                        }
                    }
                }
            })
        }
    }
    item(key = "road-head") { AlphonsoSectionHeader("Your road") }
    items(p.road.size, key = { "stop-$it" }) { i -> StopRow(p.road[i], onOpenRef) }
    item(key = "links") {
        val ds = LocalAlphonsoTokens.current
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("This week" to onOpenWeek, "Why this mix?" to onOpenWhy, "Change my path" to onBuild).forEach { (label, go) ->
                TextButton(onClick = go, modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp)) {
                    Text("$label ›", color = ds.ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun StopRow(stop: PathStop, onOpenRef: (PathItemRef) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val done = stop.state == "done"
    val cur = stop.state == "current"
    val isGoal = stop.kind == "goal"
    val tone = when {
        isGoal -> ds.hero
        done -> ds.rightTint
        cur -> ds.choiceTint
        else -> ds.card
    }
    val spoken = (if (done) "Done. " else if (cur) "Next up. " else "") + "${stop.title}. ${stop.subtitle}"
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(tone)
            .let { m -> stop.ref?.let { r -> if (!done && stop.kind == "item") m.clickable(role = Role.Button) { onOpenRef(r) } else m } ?: m }
            .padding(10.dp).clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when {
            done -> Box(Modifier.size(40.dp).clip(CircleShape).background(ds.right), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Check, null, tint = ds.onRight) }
            isGoal -> Box(Modifier.size(40.dp).clip(CircleShape).background(ds.choice), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Flag, null, tint = ds.card) }
            stop.pathKind != null -> PathTypeBadge(stop.pathKind!!)
        }
        Column(Modifier.weight(1f)) {
            val kind = stop.pathKind
            if (kind != null && !isGoal) Text(if (stop.note.isEmpty()) kind.noun else "${kind.noun} · ${stop.note}", style = MaterialTheme.typography.labelSmall, color = ds.actionText)
            Text(stop.title, style = MaterialTheme.typography.titleSmall, color = if (isGoal) ds.onHero else ds.ink)
            Text(stop.subtitle + (stop.estDate?.let { " · est. ${GoalCopy.formatDate(it)}" } ?: ""), style = MaterialTheme.typography.bodySmall, color = if (isGoal) ds.onHeroSoft else ds.inkSoft)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.weekItems(p: LearningPath, onOpenWhy: () -> Unit) {
    item(key = "week-mix") {
        val ds = LocalAlphonsoTokens.current
        Card {
            Text("${p.dailyMinutes} min a day · ${p.week.count { it.state != "rest" }} days · ${p.weekMinutes} min", style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
            PathMixBar(p.mix)
            Text("${p.weekDoneMinutes} of ${p.weekMinutes} minutes done so far.", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
        }
    }
    items(p.week.size, key = { "day-$it" }) { i ->
        val ds = LocalAlphonsoTokens.current
        val d = p.week[i]
        val tone = when (d.state) { "done" -> ds.rightTint; "today" -> ds.choiceTint; else -> ds.card }
        val spoken = "${d.label}${if (d.state == "today") ", today" else ""}: " +
            (if (d.state == "rest") "rest day" else if (d.items.isEmpty()) "nothing" else d.items.joinToString(", ") { it.kind.noun })
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(tone).defaultMinSize(minHeight = 48.dp).padding(horizontal = 12.dp, vertical = 6.dp)
                .clearAndSetSemantics { contentDescription = spoken },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(d.label, style = MaterialTheme.typography.titleSmall, color = ds.ink, modifier = Modifier.width(44.dp))
            d.items.forEach { PathTypeBadge(it.kind, small = true) }
            Spacer(Modifier.weight(1f))
            Text(if (d.state == "rest") "Rest day" else if (d.state == "missed") "Missed" else "${d.minutes} min", style = MaterialTheme.typography.labelMedium, color = ds.inkSoft)
        }
    }
    item(key = "week-why") {
        TextButton(onClick = onOpenWhy, modifier = Modifier.defaultMinSize(minHeight = 48.dp)) { Text("Why this mix? ›") }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.whyItems(p: LearningPath) {
    item(key = "why-intro") {
        val ds = LocalAlphonsoTokens.current
        Card { Text("Lessons are the backbone because you want to finish ${p.goalLabel}. The rest follows what you told me and how you are doing.", color = ds.ink) }
    }
    items(p.why.size, key = { "why-$it" }) { i ->
        val ds = LocalAlphonsoTokens.current
        val w = p.why[i]
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(ds.card).defaultMinSize(minHeight = 48.dp).padding(horizontal = 12.dp, vertical = 8.dp)
                .clearAndSetSemantics { contentDescription = "${w.headline}. ${w.detail}" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PathTypeBadge(w.kind, small = true)
            Column {
                Text(w.headline, style = MaterialTheme.typography.titleSmall, color = ds.ink)
                Text(w.detail, style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
            }
        }
    }
    item(key = "why-foot") {
        val ds = LocalAlphonsoTokens.current
        Text("Change the minutes or turn a type off in Build my path. Your skill scores update the plan as you practise.", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
    }
}

// ---------------------------------------------------------------- Build my path (A0)

@Composable
fun PathBuildScreen(
    container: AppContainer, onBack: () -> Unit,
    /** DEBUG screenshots (ScreenHarness): view-models over fixed data, and the goal sheet opened at once. */
    seededPathVm: PathViewModel? = null, seededGoalVm: GoalCardViewModel? = null, seededPurpose: String? = null, openGoalSheet: Boolean = false,
) {
    val ds = LocalAlphonsoTokens.current
    val course by container.activeCourse.course.collectAsState()
    val vm = seededPathVm ?: rememberPathViewModel(container, course)
    val ui by vm.ui.collectAsState()
    val busy by vm.busy.collectAsState()
    val actionError by vm.actionError.collectAsState()
    val path = (ui as? PathUi.Ready)?.path
    val goalVm: GoalCardViewModel = seededGoalVm ?: androidx.lifecycle.viewmodel.compose.viewModel(key = "goal-" + course.code) {
        GoalCardViewModel(course, container.goalClient, container.goalCache) { container.session.userId }
    }
    // The goal card saves on its own button; reload the path whenever its answer changes so the switches appear.
    LaunchedEffect(goalVm) { goalVm.reload(quiet = true) }
    val goalState by goalVm.state.collectAsState()
    LaunchedEffect(goalState.goal?.targetLevel, goalState.goal?.targetDate) { vm.reload(quiet = true) }
    // Why the learner is here (their first-run answer), for the first goal chip; left out when never answered or the read fails.
    val fetchedPurpose by produceState<String?>(null, course) { value = if (seededGoalVm != null) null else runCatching { container.learnerProfileClient.fetch().answers.goal }.getOrNull() }
    val purposeId = seededPurpose ?: fetchedPurpose
    DsSceneScreen(DsScene.LEARN) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Learn", onBack) { DsGlassChip("Done", onBack) }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Build my path", course.name.lowercase().replaceFirstChar { it.uppercase() })
                GoalCard(goalVm, purposeId, openSheetAtStart = openGoalSheet)
                if (path != null) {
                    // The approved A0 plan hero (round 8): the navy card with the weekly lessons and the mix.
                    DsHeroCard {
                        Text("YOUR PLAN", style = OverlineType, color = ds.onHeroKick)
                        Text("${path.progress.requiredPerWeek} lessons a week", style = DisplayType, color = ds.onHero)
                        Text("${path.dailyMinutes} minutes a day, ${PathRestDay.studyDays(path.restDay)} days. The rest of each day is filled with the mix below.", style = FootnoteType, color = ds.onHeroSoft)
                        PathMixBar(path.mix, onHero = true)
                    }
                    DsOverline("Rest day")
                    DsCard {
                        DsChipRow(Modifier.selectableGroup().semantics { contentDescription = "Rest day" }) {
                            PathRestDay.CHOICES.forEach { (value, label) ->
                                DsChip(label, path.restDay == value, onClick = { if (!busy) vm.apply(LearningPathChange.SetRestDay(value)) })
                            }
                        }
                    }
                    DsOverline("How I like to learn")
                    DsCard(padding = AlphonsoTokens.Space.s3) {
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).alpha(0.7f).semantics(mergeDescendants = true) { },
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                        ) {
                            PathTypeBadge(PathKind.LESSON)
                            Column(Modifier.weight(1f)) {
                                Text("Lessons", style = HeadlineType, color = ds.ink)
                                Text("Always on, the backbone", style = CaptionType, color = ds.inkSoft)
                            }
                            Text("Always on", style = CaptionType, color = ds.inkSoft)
                        }
                    }
                    PathKind.switchable(path.mix, path.off).forEach { kind ->
                        val on = !path.off.contains(kind.wire)
                        val reason = path.why.firstOrNull { it.kind == kind && it.source != "planner" }?.detail?.takeIf { on }
                            ?: when (kind) {
                                PathKind.PODCAST -> "Listen and answer a short quiz"
                                PathKind.TALK -> "Needs the microphone"
                                PathKind.VIDEO -> "Short captioned videos from Alphonso"
                                else -> "Story scenes that run over several days"
                            }
                        DsCard(padding = AlphonsoTokens.Space.s3) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                            ) {
                                PathTypeBadge(kind)
                                Column(Modifier.weight(1f)) {
                                    Text(kind.label, style = HeadlineType, color = ds.ink)
                                    Text(reason, style = CaptionType, color = ds.inkSoft)
                                }
                                DsSwitch(
                                    checked = on, enabled = !busy,
                                    onChange = { nowOn ->
                                        val off = PathKind.optional.filter { k -> if (k == kind) !nowOn else path.off.contains(k.wire) }
                                        vm.apply(LearningPathChange.SetOff(off))
                                    },
                                    modifier = Modifier.semantics { contentDescription = "${kind.label} in my path" },
                                )
                            }
                        }
                    }
                    actionError?.let { e -> DsCard { Text(e, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FootnoteType, color = ds.wrongInk) } }
                    LessonEdgeButton("Start my path", EdgeVariant.PRIMARY, onBack)
                } else if (ui is PathUi.None) {
                    // The same line the web's Build my path shows until a goal is saved.
                    DsCard { Text("Save a goal above and your plan appears here.", style = FootnoteType, color = ds.inkSoft) }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Profile: My path card and per-type tiles

@Composable
fun PathProfileCard(container: AppContainer) {
    val ds = LocalAlphonsoTokens.current
    val course by container.activeCourse.course.collectAsState()
    val vm = rememberPathViewModel(container, course)
    val ui by vm.ui.collectAsState()
    when (val s = ui) {
        PathUi.Loading, is PathUi.Failed -> Unit
        PathUi.None -> Card {
            Text("My path", style = MaterialTheme.typography.titleMedium, color = ds.ink)
            Text("Build a daily plan from your goal: lessons, podcasts, talks and story campaigns. Open the Learn tab to start.", style = MaterialTheme.typography.bodySmall, color = ds.inkSoft)
        }
        is PathUi.Ready -> {
            val p = s.path
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(ds.hero).padding(14.dp).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("MY PATH", style = MaterialTheme.typography.labelSmall, color = ds.onHeroKick)
                    Text("Finish ${p.goalLabel}", style = MaterialTheme.typography.titleMedium, color = ds.onHero)
                    Text(p.statusLine, style = MaterialTheme.typography.bodyMedium, color = ds.xp)
                    PathBar(p.weekFraction)
                    Text("This week: ${p.weekDoneMinutes} of ${p.weekMinutes} min", style = MaterialTheme.typography.bodySmall, color = ds.onHeroSoft)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    visibleStreaks(p.streaks).forEach { st ->
                        val spoken = "${st.kind.label}: ${st.days} ${if (st.days == 1) "day" else "days"} in a row, ${st.weekMinutes} minutes this week"
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(ds.card).defaultMinSize(minHeight = 96.dp).padding(6.dp)
                                .clearAndSetSemantics { contentDescription = spoken },
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            PathTypeBadge(st.kind, small = true)
                            Text("${st.days}d", style = MaterialTheme.typography.titleSmall, color = ds.ink)
                            Text("${st.weekMinutes} min", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
                            Text(st.kind.label, style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
                        }
                    }
                }
                Text("Days in a row and minutes this week, per activity.", style = MaterialTheme.typography.labelSmall, color = ds.inkSoft)
            }
        }
    }
}
