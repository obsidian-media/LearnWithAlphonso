package com.obsidianmedia.learnwithalphonso.ui.league

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.ui.layout.ContentScale
import com.obsidianmedia.learnwithalphonso.core.logic.RecapPresentation
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.LeagueTierCopy
import com.obsidianmedia.learnwithalphonso.core.logic.LeaguePresentation
import com.obsidianmedia.learnwithalphonso.core.net.LeaderboardRow
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsDivider
import com.obsidianmedia.learnwithalphonso.ui.components.DsEmptyState
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsHeroCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsRankBadge
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.components.DsSegmented
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.NumeralType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.learn.LeagueTierPalette
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.social.ToastBanner
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * League (the batch-1 redesign, the same screen as iOS LeaderboardView.swift): the trophy-hall scene, the learner's
 * league as a hero, DS segmented controls for scope and period, avatar rows with the medal colours, and the three
 * scope-specific empty states. Same data, same actions; Teams, Season and Recap stay one tap away as chips.
 */
@Composable
fun LeaderboardScreen(container: AppContainer, onBack: () -> Unit, onOpenTeams: () -> Unit, onOpenSeason: () -> Unit, seededVm: LeaderboardViewModel? = null, seededUserId: String? = null, openRecapAtStart: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    val userId = seededUserId ?: container.session.userId
    val vm: LeaderboardViewModel = seededVm ?: viewModel {
        LeaderboardViewModel(container.progressClient, container.snapshotCache, container.recapCache, container.tierCache, userId)
    }
    val state by vm.state.collectAsState()
    var blockTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var showRecap by remember { mutableStateOf(openRecapAtStart) }

    LifecycleResumeEffect(Unit) { vm.checkForOvertake(); onPauseOrDispose { } }

    DsSceneScreen(DsScene.PROFILE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Profile", onBack) {
                DsGlassChip("Teams", onOpenTeams)
                DsGlassChip("Season", onOpenSeason)
                DsGlassChip("Recap") { showRecap = true; vm.loadRecap() }
            }
            ToastBanner(state.toast, onClear = vm::clearToast)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                LeagueHero(state.leagueTier, state.myWeekXp)
                DsSegmented(LeaderboardScope.entries.map { it to it.label }, state.scope, { vm.select(scope = it) }, "Leaderboard scope")
                DsSegmented(LeaderboardPeriod.entries.map { it to it.label }, state.period, { vm.select(period = it) }, "Leaderboard period")
                when {
                    state.isLoading -> DsCard { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) } }
                    state.error != null -> DsEmptyState("Couldn't load the leaderboard", state.error, artAsset = "lesson/hmm.webp")
                    state.rows.isEmpty() -> DsEmptyState(state.emptyTitle, state.emptyBody, artAsset = "lesson/happy.webp")
                    else -> DsCard(padding = AlphonsoTokens.Space.s2, spacing = 0.dp) {
                        state.rows.forEachIndexed { index, row ->
                            if (index > 0) DsDivider()
                            LeaderboardRowView(
                                rank = index + 1, row = row, isYou = row.userId == userId,
                                onBlock = { blockTarget = SocialTarget(row.userId, row.displayName) },
                                onReport = { reportTarget = SocialTarget(row.userId, row.displayName) },
                            )
                        }
                    }
                }
            }
        }
    }

    BlockConfirmDialog(blockTarget, onConfirm = { vm.block(it); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
    if (showRecap) WeeklyRecapDialog(vm, onDismiss = { showRecap = false })
}

/** The learner's league (its display name, from the tier the app last saw) and their own XP this week. An unknown value shows nothing, never a guess. */
@Composable
private fun LeagueHero(tier: String?, weekXp: Int?) {
    val ds = LocalAlphonsoTokens.current
    val title = LeaguePresentation.tierTitle(tier)
    DsHeroCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            Icon(painterResource(R.drawable.ds_trophy), null, tint = ds.xp, modifier = Modifier.size(AlphonsoTokens.Space.s12 + AlphonsoTokens.Space.s1))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                if (title != null) Text("YOUR LEAGUE", style = OverlineType, color = ds.onHeroKick)
                Text(title ?: "League", style = TitleType, color = ds.onHero, modifier = Modifier.semantics { heading() })
            }
            if (weekXp != null) {
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "$weekXp XP this week" }) {
                    Text("$weekXp", style = NumeralType, color = ds.onHero, modifier = Modifier.clearAndSetSemantics { })
                    Text("XP this week", style = CaptionType, color = ds.onHeroSoft, modifier = Modifier.clearAndSetSemantics { })
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRowView(rank: Int, row: LeaderboardRow, isYou: Boolean, onBlock: () -> Unit, onReport: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(if (isYou) ds.choiceTint else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        DsRankBadge(rank, LeaguePresentation.medal(rank))
        AvatarCircle(row.avatarSeed, row.displayName, AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s2)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                // The flag, only for a learner who turned it on (profiles.country is set only then), before the name; TalkBack still hears the code.
                ProfileMath.flagEmoji(row.country)?.let { flag ->
                    val label = ProfileMath.flagAccessibilityLabel(row.country).orEmpty()
                    Text(flag, style = HeadlineType, modifier = Modifier.semantics { contentDescription = label })
                }
                Text(row.displayName, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f, fill = false))
                if (isYou) DsPill("YOU", DsPillTone.GOLD)
            }
            // A code that draws no flag (malformed) still shows as text; a valid one is the flag above.
            row.country?.takeIf { ProfileMath.flagEmoji(it) == null }?.let { Text(it.uppercase(), style = CaptionType, color = ds.inkSoft) }
        }
        Text("${row.xp} XP", style = HeadlineType, color = ds.ink)
        if (!isYou) SocialSafetyMenu(onBlock, onReport)
    }
}

/** Kept for the screens that still use the plain full-screen empty state (Season, Settings). */
@Composable
fun EmptyState(title: String, body: String) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s6), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2, Alignment.CenterVertically)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center)
    }
}

/**
 * Weekly recap (the batch-2 redesign, screen 25): a sheet with Alphonso cheering (or asleep after a quiet week), last
 * week's XP large, today's global weekly rank with its honest "approximate" note, and the promotion when there was one.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun WeeklyRecapDialog(vm: LeaderboardViewModel, onDismiss: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val recap by vm.recap.collectAsState()
    val pose = rememberFirstRunAsset(if (RecapPresentation.isQuiet(recap.lastWeekXp)) "poses/alphonso-sleepy-night.webp" else "poses/alphonso-levelup-cheer.webp")
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = ds.surface,
        shape = RoundedCornerShape(topStart = AlphonsoTokens.Radius.sheet, topEnd = AlphonsoTokens.Radius.sheet),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter), verticalAlignment = Alignment.CenterVertically) {
                Text("Weekly recap", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f).semantics { heading() })
                DsCompactButton("Done", onDismiss)
            }
            if (recap.isLoading) {
                Box(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s8), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) }
            } else Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 3).clearAndSetSemantics { }) }
                Text("Last week you earned", style = BodyType, color = ds.inkSoft)
                Text("${recap.lastWeekXp} XP", style = DisplayType, color = ds.brand)
                recap.currentRank?.let {
                    DsCard {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                            Text("Your rank today (global, weekly)", style = CaptionType, color = ds.inkSoft)
                            Text("#$it", style = HeadlineType, color = ds.ink)
                            Text("Approximate. This app doesn't keep a historical snapshot of last week's exact standings.", style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center)
                        }
                    }
                }
                recap.promotedToTier?.let {
                    DsHeroCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                            Icon(painterResource(R.drawable.ds_league), null, tint = ds.xp, modifier = Modifier.size(AlphonsoTokens.Space.s8))
                            Text(RecapPresentation.promotionLine(it), style = HeadlineType, color = ds.onHero)
                        }
                    }
                }
            }
        }
    }
}
