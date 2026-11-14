package com.obsidianmedia.learnwithalphonso.ui.achievements

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.logic.AchievementPresentation
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.UnlockedAchievement
import com.obsidianmedia.learnwithalphonso.core.net.WeaknessTrendEntry
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileOverview
import com.obsidianmedia.learnwithalphonso.core.net.fetchWeaknessTrend
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AchievementsUiState(
    val isLoading: Boolean = true,
    val unlockedById: Map<String, UnlockedAchievement> = emptyMap(),
    val weaknessTrend: List<WeaknessTrendEntry> = emptyList(),
    val error: String? = null,
    /** The learner's numbers by badge family (streak, xp, perfect, lessons, league, freeze), for the progress of a locked badge. Empty when unknown. */
    val stats: Map<String, Int> = emptyMap(),
)

/** Port of AchievementsView.swift: the unlock fetch may fail while the catalog still shows. */
class AchievementsViewModel(
    val content: ContentStore,
    private val client: ProgressSyncClient,
    private val onOpenWeaknesses: (List<String>) -> Unit = {},
    private val userId: String? = null,
    private val course: String = "en",
    /** DEBUG screenshots (ScreenHarness): a seeded view-model shows exactly this state and never calls the network. */
    private val seed: AchievementsUiState? = null,
) : ViewModel() {
    private val _state = MutableStateFlow(seed ?: AchievementsUiState())
    val state: StateFlow<AchievementsUiState> = _state.asStateFlow()

    init {
        if (seed == null) viewModelScope.launch {
            val unlocked = runCatching { client.fetchUnlockedAchievements() }
            val trend = runCatching { client.fetchWeaknessTrend() }.getOrDefault(emptyList())
            onOpenWeaknesses(trend.filter { it.openCount > 0 }.map { it.category })
            // The numbers behind a locked badge's progress; without them the badge simply shows no progress.
            val stats = userId?.let { runCatching { ProfileMath.achievementStats(client.fetchProfileOverview(it, course)) }.getOrNull() }.orEmpty()
            _state.value = AchievementsUiState(
                isLoading = false,
                unlockedById = unlocked.getOrDefault(emptyList()).associateBy { it.achievementId },
                weaknessTrend = trend,
                error = if (unlocked.isFailure) "Couldn't load your unlock status. Showing the full catalog." else null,
                stats = stats,
            )
        }
    }
}

/**
 * Achievements (the batch-2 redesign, screen 14): the trophy hall, the catalog as a grid of medallions (unlocked in
 * colour, locked in grey, a ring for the ones that are partway), the detail of a badge with its ladder, and the
 * weakness trend. The real unlock status and catalog; the unlock celebration (a later change) is not part of this.
 */
@Composable
fun AchievementsScreen(container: AppContainer, onBack: () -> Unit, seededVm: AchievementsViewModel? = null) {
    val ds = LocalAlphonsoTokens.current
    val course by container.activeCourse.course.collectAsState()
    val vm: AchievementsViewModel = seededVm ?: viewModel {
        AchievementsViewModel(container.content, container.progressClient, container.reminders::onWeaknessTrend, container.session.userId, course.code)
    }
    val state by vm.state.collectAsState()
    var open by remember { mutableStateOf<Achievement?>(null) }
    val catalog = vm.content.achievements

    DsSceneScreen(DsScene.PROFILE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Profile", onBack)
            if (state.isLoading) {
                Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s8), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
            } else Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Achievements", AchievementPresentation.summary(state.unlockedById.size, catalog.size))
                state.error?.let { DsCard { Text(it, style = FootnoteType, color = ds.inkSoft) } }
                catalog.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        row.forEach { a ->
                            val unlocked = state.unlockedById.containsKey(a.id)
                            BadgeTile(a, unlocked, state.stats[a.category] ?: 0, state.error == null, Modifier.weight(1f)) { open = a }
                        }
                        repeat(3 - row.size) { Box(Modifier.weight(1f)) }
                    }
                }
                if (state.weaknessTrend.isNotEmpty()) WeaknessTrendCard(state.weaknessTrend)
            }
        }
    }

    open?.let { a ->
        BadgeDetailSheet(a, catalog, state.unlockedById, state.stats, state.error == null, onDismiss = { open = null })
    }
}

/** The medallion's drawable by the achievement id, or null for a badge with no art yet (a newer catalog). */
@Composable
private fun rememberMedallion(id: String): Int? {
    val context = LocalContext.current
    val name = AchievementPresentation.medallionName(id)
    return remember(name) { context.resources.getIdentifier(name, "drawable", context.packageName).takeIf { it != 0 } }
}

/** A medallion: colour when unlocked, grey and quieter when locked, with a progress ring when it is partway. */
@Composable
private fun Medallion(id: String, state: AchievementPresentation.State, fraction: Float, size: Dp, ringWidth: Dp = AlphonsoTokens.Space.s1) {
    val ds = LocalAlphonsoTokens.current
    val res = rememberMedallion(id)
    val filter = if (state == AchievementPresentation.State.UNLOCKED || state == AchievementPresentation.State.UNKNOWN) null else ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        if (state == AchievementPresentation.State.IN_REACH) {
            Canvas(Modifier.size(size)) {
                val stroke = ringWidth.toPx()
                val inset = stroke / 2
                val arc = Size(this.size.width - stroke, this.size.height - stroke)
                drawArc(ds.line, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
                drawArc(ds.xp, -90f, 360f * fraction, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
            }
        }
        val pad = if (state == AchievementPresentation.State.IN_REACH) ringWidth * 2 else 0.dp
        if (res != null) {
            Image(
                painterResource(res), contentDescription = null, contentScale = ContentScale.Fit, colorFilter = filter,
                alpha = if (state == AchievementPresentation.State.UNLOCKED) 1f else 0.9f, modifier = Modifier.size(size - pad * 2),
            )
        } else {
            Icon(painterResource(R.drawable.ds_star_solid), null, tint = ds.xp, modifier = Modifier.size(size / 2))
        }
    }
}

@Composable
private fun BadgeTile(a: Achievement, unlocked: Boolean, value: Int, known: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val st = AchievementPresentation.state(unlocked, value, known)
    val spoken = buildString {
        append(a.title).append(". ").append(a.description).append(". ")
        append(
            when (st) {
                AchievementPresentation.State.UNLOCKED -> "Unlocked."
                AchievementPresentation.State.IN_REACH -> AchievementPresentation.progressLine(value, a.threshold) + "."
                AchievementPresentation.State.LOCKED -> "Locked."
                AchievementPresentation.State.UNKNOWN -> ""
            },
        )
    }
    DsCard(
        modifier.clickable(role = Role.Button, onClick = onClick).semantics(mergeDescendants = true) { contentDescription = spoken },
        padding = AlphonsoTokens.Space.s2, spacing = AlphonsoTokens.Space.s1,
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
            Medallion(a.id, st, AchievementPresentation.fraction(value, a.threshold), AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s8)
            Text(a.title, style = CaptionType, color = ds.ink, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                if (st == AchievementPresentation.State.IN_REACH) AchievementPresentation.progressLine(value, a.threshold) else a.description,
                style = CaptionType, color = if (st == AchievementPresentation.State.IN_REACH) ds.actionText else ds.inkSoft,
                textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** One badge in full: the big medallion, its tier, whether it is unlocked or how far it is, and its ladder. */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun BadgeDetailSheet(a: Achievement, catalog: List<Achievement>, unlocked: Map<String, UnlockedAchievement>, stats: Map<String, Int>, known: Boolean, onDismiss: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val value = stats[a.category] ?: 0
    val st = AchievementPresentation.state(unlocked.containsKey(a.id), value, known)
    ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter), horizontalArrangement = Arrangement.End) { DsCompactButton("Done", onDismiss) }
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Medallion(a.id, st, AchievementPresentation.fraction(value, a.threshold), AlphonsoTokens.Space.s12 * 4, AlphonsoTokens.Space.s2)
                Text(a.title, style = DisplayType, color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
                DsPill(AchievementPresentation.tierLabel(a.tier).uppercase(), DsPillTone.GOLD)
                DsCard {
                    if (st == AchievementPresentation.State.UNLOCKED) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                            Icon(painterResource(R.drawable.ds_check), null, tint = ds.right, modifier = Modifier.size(AlphonsoTokens.Space.s8))
                            Text("Unlocked", style = HeadlineType, color = ds.ink)
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(AchievementPresentation.progressLine(value, a.threshold), style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                            DsPill(AchievementPresentation.percentLabel(value, a.threshold), DsPillTone.GOLD)
                        }
                        DsProgressBar(AchievementPresentation.fraction(value, a.threshold), tint = ds.xp)
                    }
                    Text(a.description, style = FootnoteType, color = ds.inkSoft)
                }
                val ladder = AchievementPresentation.ladder(catalog, a.category)
                AchievementPresentation.ladderTitle(a.category, ladder.size)?.let { title ->
                    DsOverline(title)
                    DsCard {
                        androidx.compose.foundation.layout.FlowRow(
                            Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3, Alignment.CenterHorizontally),
                            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
                        ) {
                            ladder.forEach { step ->
                                val isUnlocked = unlocked.containsKey(step.id)
                                val sv = stats[step.category] ?: 0
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                                    Medallion(step.id, AchievementPresentation.state(isUnlocked, if (step.id == a.id) value else sv, known), AchievementPresentation.fraction(sv, step.threshold), AlphonsoTokens.Space.s12)
                                    Text("${step.threshold}", style = CaptionType, color = if (step.id == a.id) ds.ink else ds.inkSoft)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WeaknessTrendCard(entries: List<WeaknessTrendEntry>) {
    val ds = LocalAlphonsoTokens.current
    Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        DsOverline("Weakness trend")
        DsCard {
            Text("Grammar gaps we've spotted, and how they're going", style = FootnoteType, color = ds.inkSoft)
            entries.take(8).forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    Text(e.category.replace('-', ' ').replaceFirstChar { it.uppercase() }, style = BodyType, color = ds.ink, modifier = Modifier.weight(1f))
                    if (e.openCount > 0) DsPill("Still working on it", DsPillTone.GOLD)
                    else DsPill("Mastered (${e.resolvedCount}×)", DsPillTone.GOOD)
                }
            }
        }
    }
}
