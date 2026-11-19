package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Unit as ContentUnit
import com.obsidianmedia.learnwithalphonso.core.logic.CurrentUnit
import com.obsidianmedia.learnwithalphonso.ui.learn.CurrentUnitCard
import com.obsidianmedia.learnwithalphonso.ui.learn.ForYouRail
import com.obsidianmedia.learnwithalphonso.ui.learn.RailItem
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Learn hero and the For you rail must actually take up room. Source guards cannot see a card that composes with
 * a 2 px height or a screen that scrolls its own top out of view, so this renders them and checks sizes.
 */
@RunWith(AndroidJUnit4::class)
class LearnHeroRailTest {
    @get:Rule val rule = createComposeRule()

    private val unit = ContentUnit("u1", "A1", "Unit 1", "Everyday basics", "", listOf(Lesson("l1", "Saying Hello", "Common greetings", emptyList())))

    @Test
    fun heroShowsLessonLineAndContinueButtonWithRealSize() {
        rule.setContent {
            AlphonsoTheme(AlphonsoThemeId.ROYAL, systemDark = false) {
                Column(Modifier.fillMaxWidth()) {
                    CurrentUnitCard(unit, CurrentUnit(1, 3, "u1", "l1"), 1, 28, "Saying Hello", "Ready for today's lesson?", onContinue = {})
                }
            }
        }
        rule.onNodeWithText("Continue lesson").assertIsDisplayed().assertHeightIsAtLeast(40.dp)
        rule.onNodeWithText("Next: Saying Hello").assertIsDisplayed()
        rule.onNodeWithText("YOU ARE HERE · UNIT 1 OF 28").assertIsDisplayed()
        rule.onNodeWithText("Ready for today's lesson?").assertIsDisplayed()
    }

    @Test
    fun railCardsAreDisplayedAtTheirContentHeight() {
        val cards = listOf(
            RailItem("review", R.drawable.ds_book, "Review", "All caught up", "Review, Nothing due right now", expanded = null) {},
            RailItem("path", R.drawable.ds_target, "Build my path", "Set a goal", "Build my path, Set a goal", expanded = null) {},
            RailItem("weekly", R.drawable.ds_star_solid, "Weekly", "0 of 3 done", "Weekly challenges, 0 of 3 done", expanded = false) {},
        )
        rule.setContent { AlphonsoTheme(AlphonsoThemeId.ROYAL, systemDark = false) { ForYouRail(cards) } }
        for (d in listOf("Review, Nothing due right now", "Build my path, Set a goal", "Weekly challenges, 0 of 3 done")) {
            rule.onNodeWithContentDescription(d).assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        }
    }
}
