package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.ui.learn.ForYouRail
import com.obsidianmedia.learnwithalphonso.ui.learn.RailItem
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTheme
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoThemeId
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The For you rail must actually take up room. Source guards cannot see a card that composes with a 2 px height, so
 * this renders it and checks sizes. (The climbing map has its own test, LearnClimbMapTest.)
 */
@RunWith(AndroidJUnit4::class)
class LearnHeroRailTest {
    @get:Rule val rule = createComposeRule()

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
