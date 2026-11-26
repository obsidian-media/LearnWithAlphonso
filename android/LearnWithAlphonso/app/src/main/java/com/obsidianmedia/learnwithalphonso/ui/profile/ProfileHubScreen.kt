package com.obsidianmedia.learnwithalphonso.ui.profile

import androidx.compose.foundation.background
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
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileOverview
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTab
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileTabs
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
    onOpenLeague: () -> Unit, onOpenFriends: () -> Unit, onOpenInvite: () -> Unit = {}, onOpenAchievements: () -> Unit, onOpenSettings: () -> Unit,
    onOpenReview: (Course) -> Unit, onOpenPaywall: () -> Unit, onOpenMemory: () -> Unit = {},
) {
    val course by container.activeCourse.course.collectAsState()
    val isPro = container.entitlements.state.collectAsState().value.isPro
    var overview by remember { mutableStateOf<ProfileOverviewModel?>(null) }
    var failed by remember { mutableStateOf(false) }
    var tab by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(ProfileTab.OVERVIEW) }
    var picking by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    // The counts on the memory card, read from the server (null until they arrive, or when the read fails). Free for everyone.
    var memorySummary by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(reload) {
        memorySummary = (container.aiClient.tutorMemory() as? com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryLoad.Ready)?.memory?.summary
    }
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
                    // The identity hero stays on every tab; Progress and Social show it without the level bar and numbers.
                    ProfileHero(m, compact = tab != ProfileTab.OVERVIEW, onPicture = { picking = true })
                    if (tab == ProfileTab.OVERVIEW) ProfileCoursePicker(m, onCourse = { container.activeCourse.set(it) })
                    ProfileTabBar(tab, onChange = { tab = it })
                    when (tab) {
                        ProfileTab.OVERVIEW -> {
                            if (!m.hasAnyActivity) Text("Your first lesson starts your streak and fills in this page.", color = ds.ink)
                            ProfileWeekSection(m)
                            ProfileAchievementsPreview(m, onClick = onOpenAchievements)
                            ProfileHector(m, onPaywall = onOpenPaywall)
                            ProfileMemory(memorySummary, onOpenMemory)
                            ProfileRowCard("Edit your answers", "Goal, level, daily time, interests", R.drawable.ds_target, ds.choiceTint, ds.choice, onEditAnswers)
                            ProfileRowCard("Settings", "Theme and account", R.drawable.ds_settings, ds.rightTint, ds.right, onOpenSettings)
                        }
                        ProfileTab.PROGRESS -> {
                            ProfileSkills(m)
                            com.obsidianmedia.learnwithalphonso.ui.path.PathProfileCard(container)
                            ProfileFold("Last 3 months", ProfileTabs.heatSummary(m.heat.activeDays)) { ProfileHeatMap(m) }
                            ProfileFold("Personal records", ProfileTabs.recordsSummary(m.records.bestStreak)) { ProfileRecords(m) }
                            ProfileFold("Level ${m.level.level}", "${m.level.level} \u00B7 ${m.level.pct}%") { ProfileLevel(m) }
                            ProfileFold("Top weak spots", ProfileTabs.weakSummary(m.weak.second)) { ProfileWeak(m, onPractice = { onOpenReview(course) }) }
                            ProfileRowCard(
                                "Achievements", ProfileTabs.achievementsSummary(m.unlockedCount, m.catalogCount), R.drawable.ds_star,
                                ds.xpTint, ds.xpText, onOpenAchievements,
                            )
                        }
                        ProfileTab.SOCIAL -> {
                            ProfileLeague(m)
                            ProfileRowCard("League", "Leaderboards, teams, and the season ladder", R.drawable.ds_league, ds.xpTint, ds.xpText, onOpenLeague)
                            ProfileRowCard("Friends", "Your friends, their activity, and duels", R.drawable.ds_friends, ds.choiceTint, ds.choice, onOpenFriends)
                            ProfileRowCard("Invite friends", "You both get a reward when they finish a first lesson", R.drawable.ds_gift, ds.rightTint, ds.right, onOpenInvite)
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
                    com.obsidianmedia.learnwithalphonso.ui.support.GetHelpButton()
                }
            }
        }
    }
}
