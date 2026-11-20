package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileAchievementRow
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileActivityDay
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileCompletion
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileCourseProgress
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileLeagueStanding
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileOverviewData
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileAchievementsPreview
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileHero
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileLeague
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileOverviewModel
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileWeekSection
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.DayOfWeek
import java.time.format.TextStyle
import java.util.Locale

/**
 * The converged Profile (identity hero, level ring, stats, week strip, achievements card, league card) has real size on
 * screen, not just a node in the tree. Offline fixtures: no session or network. Nodes under clearAndSetSemantics are
 * only in the unmerged tree, so those lookups pass useUnmergedTree = true.
 */
@RunWith(AndroidJUnit4::class)
class ProfileConvergedVisualTest {
    @get:Rule val rule = createComposeRule()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val content by lazy { ContentStore { context.assets.open(it).bufferedReader().use { r -> r.readText() } } }

    private fun model(): ProfileOverviewModel {
        val lessons = content.bundle(Course.SPANISH).units.first { it.level == "A1" }.lessons.map { it.id }
        val badges = content.achievements.take(5).mapIndexed { i, a -> ProfileAchievementRow(a.id, a.threshold, "2026-11-0${1 + i}") }
        val data = ProfileOverviewData(
            today = "2026-11-06", localToday = "2026-11-06", course = "es", displayName = "Sam", avatarSeed = "animal:fox", country = "GB",
            courses = listOf(ProfileCourseProgress("es", 650, "A1", "silver")),
            streak = 12, longestStreak = 21, lastActiveDate = "2026-11-06", dayBasis = "local",
            completions = lessons.take(2).map { ProfileCompletion(it, "es", 4, 5) },
            activity = listOf(ProfileActivityDay("2026-11-02", 40), ProfileActivityDay("2026-11-04", 20)),
            achievements = badges,
            league = ProfileLeagueStanding("silver", 4, 12, "2026-11-02", "2026-11-08", 80),
        )
        return ProfileOverviewModel(data, content, Course.SPANISH, false, 10)
    }

    private fun SemanticsNodeInteraction.assertHasRealSize(): SemanticsNodeInteraction {
        val b = getUnclippedBoundsInRoot()
        assertTrue("expected a real size, got ${b.width} x ${b.height}", b.width > 8.dp && b.height > 8.dp)
        return this
    }

    @Test fun heroRingStatsWeekStripAchievementsAndLeagueHaveRealSize() {
        val m = model()
        val scale = mutableStateOf(1f)
        rule.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, scale.value)) {
                AlphonsoTheme(AlphonsoThemeId.DEFAULT, false) {
                    Column(
                        Modifier.fillMaxSize().background(LocalAlphonsoTokens.current.surface).verticalScroll(rememberScrollState()).padding(16.dp).testTag("scroll"),
                    ) {
                        Box(Modifier.testTag("hero")) { ProfileHero(m, compact = false, onPicture = {}) }
                        Box(Modifier.testTag("week")) { ProfileWeekSection(m) }
                        Box(Modifier.testTag("achievements")) { ProfileAchievementsPreview(m, onClick = {}) }
                        Box(Modifier.testTag("league")) { ProfileLeague(m) }
                    }
                }
            }
        }
        rule.waitForIdle()
        // Scroll to each card first: off-screen content has no size on a short device.
        rule.onNodeWithTag("hero").performScrollTo().assertHasRealSize()
        // The ring's picture button, and the four numbers, each readable as one phrase.
        rule.onAllNodes(hasContentDescription("Change picture"), useUnmergedTree = true).onFirst().assertHasRealSize()
        for (part in listOf("day streak", "XP in", "words learned", "percent accuracy")) {
            rule.onAllNodes(hasContentDescription(part, substring = true), useUnmergedTree = true).onFirst().assertHasRealSize()
        }
        rule.onNodeWithTag("week").performScrollTo().assertHasRealSize()
        for (day in DayOfWeek.entries) {
            val name = day.getDisplayName(TextStyle.FULL, Locale.getDefault())
            rule.onAllNodes(hasContentDescription(name, substring = true), useUnmergedTree = true).onFirst().assertHasRealSize()
        }
        rule.onNodeWithTag("achievements").performScrollTo().assertHasRealSize()
        rule.onAllNodes(hasContentDescription("unlocked", substring = true), useUnmergedTree = true).onFirst().assertHasRealSize()
        rule.onNodeWithTag("league").performScrollTo().assertHasRealSize()
        rule.onAllNodes(hasContentDescription("Your league", substring = true), useUnmergedTree = true).onFirst().assertHasRealSize()

        // Large text: the hero reflows to one column and nothing collapses.
        rule.runOnIdle { scale.value = 2f }
        rule.waitForIdle()
        rule.onNodeWithTag("hero").performScrollTo().assertHasRealSize()
        for (part in listOf("day streak", "percent accuracy")) {
            rule.onAllNodes(hasContentDescription(part, substring = true), useUnmergedTree = true).onFirst().assertHasRealSize()
        }
    }
}
