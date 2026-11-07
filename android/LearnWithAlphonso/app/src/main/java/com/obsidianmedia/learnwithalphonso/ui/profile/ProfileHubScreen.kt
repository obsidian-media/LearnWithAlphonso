package com.obsidianmedia.learnwithalphonso.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileOverview
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTab
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTabs
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.firstrun.AvatarPickerDialog
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonLightScope
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.CancellationException

/** Port of ProfileHubView.swift: the redesigned Profile (visual round 6, part 4) with the old hub rows below it. */
@Composable
fun ProfileHubScreen(
    container: AppContainer, onEditAnswers: () -> Unit,
    onOpenLeague: () -> Unit, onOpenFriends: () -> Unit, onOpenAchievements: () -> Unit, onOpenSettings: () -> Unit,
    onOpenReview: (Course) -> Unit, onOpenPaywall: () -> Unit,
) {
    val course by container.activeCourse.course.collectAsState()
    val isPro = container.entitlements.state.collectAsState().value.isPro
    var overview by remember { mutableStateOf<ProfileOverviewModel?>(null) }
    var failed by remember { mutableStateOf(false) }
    var tab by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(ProfileTab.OVERVIEW) }
    var picking by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    val userId = container.session.userId
    LaunchedEffect(course, userId, isPro, reload) {
        val id = userId ?: return@LaunchedEffect
        try {
            val data = container.progressClient.fetchProfileOverview(id, course.code)
            // The learner's chosen daily time; a failed or empty read just means no goal (rings keep the XP rule).
            val goal = runCatching { container.learnerProfileClient.fetch().answers.dailyMinutes }.getOrNull()
            overview = ProfileOverviewModel(data, container.content, course, isPro, goal)
            failed = false
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failed = overview == null
        }
    }
    LessonLightScope(container.themeManager.theme.collectAsState().value, container.themeManager.palette.collectAsState().value) {
        val ds = LocalAlphonsoTokens.current
        val context = LocalContext.current
        Column(
            Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Text("Profile", style = TitleType, color = ds.brand, modifier = Modifier.semantics { heading() })
            val m = overview
            when {
                m != null -> {
                    ProfileTabBar(tab, onChange = { tab = it })
                    when (tab) {
                        ProfileTab.OVERVIEW -> {
                            ProfileHero(m, onCourse = { container.activeCourse.set(it) }, onPicture = { picking = true })
                            if (!m.hasAnyActivity) Text("Your first lesson starts your streak and fills in this page.", color = ds.ink)
                            ProfileWeekSection(m)
                            ProfileHector(m, onPaywall = onOpenPaywall)
                        }
                        ProfileTab.PROGRESS -> {
                            ProfileCompactHeader(m)
                            ProfileSkills(m)
                            ProfileFold("Last 3 months", ProfileTabs.heatSummary(m.heat.activeDays)) { ProfileHeatMap(m) }
                            ProfileFold("Personal records", ProfileTabs.recordsSummary(m.records.bestStreak)) { ProfileRecords(m) }
                            ProfileFold("Level ${m.level.level}", "${m.level.level} · ${m.level.pct}%") { ProfileLevel(m) }
                            ProfileFold("Top weak spots", ProfileTabs.weakSummary(m.weak.second)) { ProfileWeak(m, onPractice = { onOpenReview(course) }) }
                        }
                        ProfileTab.SOCIAL -> {
                            ProfileCompactHeader(m)
                            ProfileLeague(m)
                            ProfileFriends(m)
                            ProfileShare(m, onShare = { shareProfileCard(context, m, ds) })
                        }
                    }
                    if (picking) {
                        AvatarPickerDialog(container, m.name, m.data.avatarSeed ?: "a", onClose = { picking = false }) { reload++ }
                    }
                }
                failed -> {
                    Text("Profile could not load.", color = ds.ink)
                    LessonEdgeButton("Try again", EdgeVariant.SECONDARY, { failed = false; reload++ })
                }
            }
            // The old hub rows keep their place, each on the tab it belongs to; Settings and Edit answers stay on Overview.
            when (tab) {
                ProfileTab.OVERVIEW -> {
                    LessonEdgeButton("Edit your answers", EdgeVariant.SECONDARY, onEditAnswers)
                    AlphonsoRowCard("Settings", "Theme and account", leadingEmoji = "⚙️", modifier = Modifier.clickable(onClick = onOpenSettings).padding(top = 8.dp))
                }
                ProfileTab.PROGRESS ->
                    AlphonsoRowCard("Achievements", overview?.let { ProfileTabs.achievementsSummary(it.unlockedCount, it.catalogCount) } ?: "Badges you have earned", leadingEmoji = "⭐", modifier = Modifier.clickable(onClick = onOpenAchievements))
                ProfileTab.SOCIAL -> {
                    AlphonsoRowCard("League", "Leaderboards, teams, and the season ladder", leadingEmoji = "🏆", modifier = Modifier.clickable(onClick = onOpenLeague))
                    AlphonsoRowCard("Friends", "Your friends, their activity, and duels", leadingEmoji = "👥", modifier = Modifier.clickable(onClick = onOpenFriends))
                }
            }
        }
    }
}
