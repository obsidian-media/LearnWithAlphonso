package com.obsidianmedia.learnwithalphonso.ui.profile

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
    var picking by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    val userId = container.session.userId
    LaunchedEffect(course, userId, isPro, reload) {
        val id = userId ?: return@LaunchedEffect
        try {
            val data = container.progressClient.fetchProfileOverview(id, course.code)
            overview = ProfileOverviewModel(data, container.content, course, isPro)
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
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Text("Profile", style = TitleType, color = ds.brand, modifier = Modifier.semantics { heading() })
            val m = overview
            when {
                m != null -> {
                    ProfileHero(m, onCourse = { container.activeCourse.set(it) }, onPicture = { picking = true })
                    if (!m.hasAnyActivity) Text("Your first lesson starts your streak and fills in this page.", color = ds.ink)
                    ProfileWeekSection(m)
                    ProfileHeatMap(m)
                    ProfileRecordsAndLevel(m)
                    ProfileWeakAndHector(m, onPractise = { onOpenReview(course) }, onPaywall = onOpenPaywall)
                    ProfileProgressCards(m)
                    ProfileShare(m, onShare = { shareProfileCard(context, m, ds) })
                    if (picking) {
                        AvatarPickerDialog(container, m.name, m.data.avatarSeed ?: "a", onClose = { picking = false }) { reload++ }
                    }
                }
                failed -> {
                    Text("Profile could not load.", color = ds.ink)
                    LessonEdgeButton("Try again", EdgeVariant.SECONDARY, { failed = false; reload++ })
                }
            }
            LessonEdgeButton("Edit your answers", EdgeVariant.SECONDARY, onEditAnswers)
            AlphonsoRowCard("League", "Leaderboards, teams, and the season ladder", leadingEmoji = "🏆", modifier = Modifier.clickable(onClick = onOpenLeague))
            AlphonsoRowCard("Friends", "Your friends, their activity, and duels", leadingEmoji = "👥", modifier = Modifier.clickable(onClick = onOpenFriends))
            AlphonsoRowCard("Achievements", "Badges earned and weak spots to work on", leadingEmoji = "⭐", modifier = Modifier.clickable(onClick = onOpenAchievements))
            AlphonsoRowCard("Settings", "Theme and account", leadingEmoji = "⚙️", modifier = Modifier.clickable(onClick = onOpenSettings).padding(top = 8.dp))
        }
    }
}
